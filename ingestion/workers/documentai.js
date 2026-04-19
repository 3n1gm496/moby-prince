'use strict';

/**
 * DocumentAIWorker — routes large PDFs through Document AI OCR, extracts
 * logical sections, writes them as .txt files to the normalized bucket, and
 * creates child IngestionJobs for each section.
 *
 * Activated when:
 *   - job.status === 'VALIDATING'
 *   - job.mimeType === 'application/pdf'
 *   - job.fileSizeBytes >= config.split.pdfCriticalBytes (default 50 MB)
 *
 * Required environment variables:
 *   GOOGLE_CLOUD_PROJECT       GCP project ID
 *   DOCAI_PROCESSOR_ID         Document AI processor ID (DOCUMENT_OCR type)
 *   DOCAI_LOCATION             Document AI API location (default: eu)
 *
 * Required context (passed by Cloud Run entrypoint):
 *   context.storage            @google-cloud/storage Storage instance
 *   context.documentai         @google-cloud/documentai DocumentProcessorServiceClient
 */

const path = require('path');
const { BaseWorker } = require('./base');
const { createJob } = require('../state/job');

const DOCAI_LOCATION = process.env.DOCAI_LOCATION || 'eu';
// Headings: short all-caps or Title Case lines (< 120 chars), possibly ending without a period
const HEADING_RE = /^([A-ZÁÀÈÉÌÍÒÓÙÚA-Z][^\n]{0,118}[^.\n])$/;
// Section size cap (chars) — stay well under Discovery Engine 2.5 MB limit
const MAX_SECTION_CHARS = 800_000;

class DocumentAIWorker extends BaseWorker {
  constructor(config, logger) {
    super('documentai', logger);
    this._config = config;
  }

  shouldRun(job) {
    return (
      job.status === 'VALIDATING' &&
      job.mimeType === 'application/pdf' &&
      job.fileSizeBytes != null &&
      job.fileSizeBytes >= this._config.split.pdfCriticalBytes
    );
  }

  async run(job, context = {}) {
    const { storage, documentai } = context;
    const processorId = process.env.DOCAI_PROCESSOR_ID;

    if (!documentai) {
      this.logger.warn({ jobId: job.jobId }, 'No DocumentAI client in context; quarantining');
      return this.halt(job.fail('PDF_CRITICAL', 'Document AI client not provided — set context.documentai'));
    }
    if (!storage) {
      this.logger.warn({ jobId: job.jobId }, 'No GCS Storage client in context; quarantining');
      return this.halt(job.fail('PDF_CRITICAL', 'GCS Storage client not provided — set context.storage'));
    }
    if (!processorId) {
      return this.halt(job.fail('PDF_CRITICAL', 'DOCAI_PROCESSOR_ID env var not set'));
    }
    if (!this._config.projectId) {
      return this.halt(job.fail('PDF_CRITICAL', 'GOOGLE_CLOUD_PROJECT not configured'));
    }

    const processorName =
      `projects/${this._config.projectId}/locations/${DOCAI_LOCATION}/processors/${processorId}`;
    const normalizedBucket = this._config.buckets.normalized;

    if (!normalizedBucket) {
      return this.halt(job.fail('PDF_CRITICAL', 'BUCKET_NORMALIZED not configured'));
    }

    let splitting = job._next({ status: 'SPLITTING' });

    try {
      // ── 1. Resolve a gs:// URI for the source PDF ───────────────────────────
      let gcsInputUri = job.sourceUri;

      if (!gcsInputUri.startsWith('gs://')) {
        // Local file — upload to raw bucket so Document AI can reach it
        const rawBucket = this._config.buckets.raw;
        if (!rawBucket) {
          return this.halt(job.fail('PDF_CRITICAL', 'BUCKET_RAW not configured for local→GCS upload'));
        }
        const remoteName = `moby-prince/pending/${job.jobId}/${path.basename(job.sourceUri)}`;
        this.logger.info({ jobId: job.jobId, remoteName }, 'Uploading local PDF to raw bucket');
        await storage.bucket(rawBucket).upload(job.sourceUri, { destination: remoteName });
        gcsInputUri = `gs://${rawBucket}/${remoteName}`;
      }

      // ── 2. Submit async batch process request ───────────────────────────────
      const outputPrefix = `docai-output/${job.jobId}/`;
      const outputGcsUri = `gs://${normalizedBucket}/${outputPrefix}`;

      this.logger.info({ jobId: job.jobId, processorName, gcsInputUri }, 'Submitting Document AI batch');

      const [operation] = await documentai.batchProcessDocuments({
        name: processorName,
        inputDocuments: {
          gcsDocuments: {
            documents: [{ gcsUri: gcsInputUri, mimeType: 'application/pdf' }],
          },
        },
        documentOutputConfig: {
          gcsOutputConfig: { gcsUri: outputGcsUri },
        },
      });

      // ── 3. Wait for long-running operation (up to 15 min) ──────────────────
      this.logger.info({ jobId: job.jobId, operationName: operation.name }, 'Waiting for Document AI');
      const [response] = await operation.promise();
      void response; // result is in GCS output files

      // ── 4. Retrieve Document AI JSON output files ───────────────────────────
      const [outputFiles] = await storage.bucket(normalizedBucket).getFiles({ prefix: outputPrefix });
      const jsonFiles = outputFiles.filter(f => f.name.endsWith('.json'));

      if (jsonFiles.length === 0) {
        return this.halt(job.fail('PARSE_FAILURE', 'Document AI produced no output JSON files'));
      }

      // ── 5. Extract logical sections from all output files ──────────────────
      const sections = [];
      for (const file of jsonFiles) {
        const [buf] = await file.download();
        let docResult;
        try {
          docResult = JSON.parse(buf.toString('utf8'));
        } catch {
          this.logger.warn({ file: file.name }, 'Failed to parse Document AI JSON; skipping file');
          continue;
        }
        sections.push(..._extractSections(docResult));
      }

      if (sections.length === 0) {
        return this.halt(job.fail('PARSE_FAILURE', 'Document AI output contains no extractable text'));
      }

      // ── 6. Write section .txt files to normalized bucket ───────────────────
      const stem = path.basename(job.originalFilename, path.extname(job.originalFilename));
      const normalizedUris = [];

      for (let i = 0; i < sections.length; i++) {
        const partName = `moby-prince/${stem}_part_${String(i + 1).padStart(3, '0')}.txt`;
        const content  = _formatSection(sections[i]);

        await storage.bucket(normalizedBucket).file(partName).save(content, {
          contentType: 'text/plain; charset=utf-8',
          metadata: {
            jobId:     job.jobId,
            pageStart: String(sections[i].pageStart),
            pageEnd:   String(sections[i].pageEnd),
            section:   sections[i].heading || '',
          },
        });

        normalizedUris.push(`gs://${normalizedBucket}/${partName}`);
      }

      this.logger.info(
        { jobId: job.jobId, partsCount: sections.length, partUris: normalizedUris },
        `Split into ${sections.length} sections via Document AI`
      );

      // ── 7. Create child jobs for each section ──────────────────────────────
      const childJobs = normalizedUris.map((uri, i) =>
        createJob(uri, {
          originalFilename: `${stem}_part_${String(i + 1).padStart(3, '0')}.txt`,
          parentJobId:      job.jobId,
          mimeType:         'text/plain',
        }, this._config.retry.maxAttempts)
      );

      const completed = splitting.completeSplit(normalizedUris);
      return this.ok(completed, { childJobs, partsCount: sections.length, partUris: normalizedUris });

    } catch (err) {
      this.logger.error({ jobId: job.jobId, error: err.message, stack: err.stack }, 'DocumentAI worker error');
      return this.halt(job.fail('PDF_CRITICAL', `Document AI error: ${err.message}`));
    }
  }
}

// ── Section extraction helpers ────────────────────────────────────────────────

/**
 * Extract logical sections from a Document AI Document JSON.
 * Groups consecutive pages whose combined text is under MAX_SECTION_CHARS;
 * detected heading lines start a new section.
 */
function _extractSections(doc) {
  const pages = doc.pages || [];
  if (pages.length === 0) return [];

  const sections = [];
  let cur = { heading: null, text: '', pageStart: 1, pageEnd: 1 };

  for (const page of pages) {
    const pageNum  = page.pageNumber || 1;
    const pageText = _pageToText(doc, page);
    const heading  = _detectHeading(pageText);

    const wouldOverflow = cur.text.length + pageText.length > MAX_SECTION_CHARS;
    const newSection    = (heading && cur.text.length > 0) || wouldOverflow;

    if (newSection) {
      if (cur.text.trim()) sections.push({ ...cur });
      cur = { heading, text: pageText, pageStart: pageNum, pageEnd: pageNum };
    } else {
      if (!cur.heading && heading) cur.heading = heading;
      cur.text   += cur.text ? '\n\n' + pageText : pageText;
      cur.pageEnd = pageNum;
    }
  }

  if (cur.text.trim()) sections.push(cur);
  return sections;
}

/**
 * Reconstruct plain text for a page using Document AI textContent or by
 * walking the token layout.
 */
function _pageToText(doc, page) {
  // Fast path: full document text is stored at doc.text; each token has
  // textAnchor.textSegments pointing into that string.
  const docText = doc.text || '';

  if (docText) {
    const lines = [];
    for (const block of (page.blocks || [])) {
      for (const para of (block.paragraphs || [])) {
        const segs = para.layout?.textAnchor?.textSegments || [];
        const paraText = segs
          .map(s => docText.slice(Number(s.startIndex || 0), Number(s.endIndex || 0)))
          .join('');
        if (paraText.trim()) lines.push(paraText.trim());
      }
    }
    return lines.join('\n');
  }

  // Fallback: walk tokens with detectedText
  const words = [];
  for (const block of (page.blocks || [])) {
    for (const para of (block.paragraphs || [])) {
      for (const line of (para.lines || [])) {
        for (const token of (line.tokens || [])) {
          if (token.detectedText) words.push(token.detectedText);
        }
      }
      words.push('\n');
    }
  }
  return words.join(' ').replace(/ \n /g, '\n').trim();
}

/**
 * Return the first line of pageText if it looks like a section heading
 * (short, title-cased or all-caps, no trailing period).
 */
function _detectHeading(pageText) {
  const firstLine = pageText.split('\n')[0]?.trim() || '';
  if (firstLine.length > 0 && firstLine.length < 120 && HEADING_RE.test(firstLine)) {
    return firstLine;
  }
  return null;
}

function _formatSection(section) {
  const header  = section.heading
    ? `${section.heading}\n${'─'.repeat(Math.min(section.heading.length, 60))}\n\n`
    : '';
  const pageRef = `[Pagine ${section.pageStart}–${section.pageEnd}]\n\n`;
  return header + pageRef + section.text;
}

module.exports = { DocumentAIWorker };
