'use strict';

/**
 * DocumentAIWorker — routes large PDFs through Document AI, extracts logical
 * sections, writes them as .html files to the normalized bucket, and creates
 * child IngestionJobs for each section.
 *
 * Activated when:
 *   - job.status === 'VALIDATING'
 *   - job.mimeType === 'application/pdf'
 *   - job.fileSizeBytes >= config.split.pdfCriticalBytes (default 50 MB)
 *
 * Required environment variables:
 *   GOOGLE_CLOUD_PROJECT           GCP project ID
 *   DOCAI_PROCESSOR_ID             Document AI OCR processor ID (DOCUMENT_OCR type)
 *   DOCAI_LOCATION                 Document AI API location (default: eu)
 *
 * Optional environment variables:
 *   DOCAI_LAYOUT_PROCESSOR_ID      Layout Parser processor ID. When set, the
 *                                  worker uses the Layout Parser instead of the
 *                                  basic OCR processor, enabling semantic section
 *                                  splitting (headings, tables) and populating
 *                                  layout_type in DE structData.
 *
 * Required context (passed by Cloud Run entrypoint):
 *   context.storage            @google-cloud/storage Storage instance
 *   context.documentai         @google-cloud/documentai DocumentProcessorServiceClient
 */

const path = require('path');
const { BaseWorker } = require('./base');
const { createJob } = require('../state/job');
const { toDocumentId } = require('../lib/documentId');
const documentRegistry = require('../services/documentRegistry');

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
    const forceAllPdfs = this._config.docai?.forceAllPdfs === true;
    return (
      job.status === 'VALIDATING' &&
      job.mimeType === 'application/pdf' &&
      (
        forceAllPdfs ||
        (
          job.fileSizeBytes != null &&
          job.fileSizeBytes >= this._config.split.pdfCriticalBytes
        )
      )
    );
  }

  async run(job, context = {}) {
    const { storage, documentai, checkpoint } = context;

    // Layout Parser takes precedence over the basic OCR processor when configured.
    const layoutProcessorId = process.env.DOCAI_LAYOUT_PROCESSOR_ID;
    const ocrProcessorId    = process.env.DOCAI_PROCESSOR_ID;
    const processorId       = layoutProcessorId || ocrProcessorId;
    const useLayoutParser   = !!layoutProcessorId;

    if (!documentai) {
      this.logger.warn({ jobId: job.jobId }, 'No DocumentAI client in context; quarantining');
      return this.halt(job.fail('PDF_CRITICAL', 'Document AI client not provided — set context.documentai'));
    }
    if (!storage) {
      this.logger.warn({ jobId: job.jobId }, 'No GCS Storage client in context; quarantining');
      return this.halt(job.fail('PDF_CRITICAL', 'GCS Storage client not provided — set context.storage'));
    }
    if (!processorId) {
      return this.halt(job.fail('PDF_CRITICAL', 'DOCAI_PROCESSOR_ID (or DOCAI_LAYOUT_PROCESSOR_ID) env var not set'));
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
      let operation;
      const outputPrefix = `docai-output/${job.jobId}/`;
      const outputGcsUri = `gs://${normalizedBucket}/${outputPrefix}`;

      if (job.docaiOperationName) {
        // ── Resume: reattach to existing LRO (restart after crash/timeout) ────
        this.logger.info(
          { jobId: job.jobId, operationName: job.docaiOperationName },
          'Reattaching to existing Document AI LRO',
        );
        [operation] = await documentai.checkBatchProcessDocumentsProgress(job.docaiOperationName);
      } else {
        // ── 1. Resolve a gs:// URI for the source PDF ─────────────────────────
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

        // ── 2. Submit async batch process request ──────────────────────────────
        this.logger.info({ jobId: job.jobId, processorName, gcsInputUri }, 'Submitting Document AI batch');

        [operation] = await documentai.batchProcessDocuments({
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

        // Checkpoint: persist operation name before the long wait so a
        // restart can reattach rather than resubmit the same PDF.
        splitting = splitting.setDocaiOperation(operation.name);
        if (checkpoint) await checkpoint(splitting);
      }

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

      // ── 5. Extract sections and aggregate quality metrics ─────────────────
      const sections = [];
      const allConfs = [];
      const blockCounts = { tables: 0, headings: 0, other: 0 };

      for (const file of jsonFiles) {
        const [buf] = await file.download();
        let docResult;
        try {
          docResult = JSON.parse(buf.toString('utf8'));
        } catch {
          this.logger.warn({ file: file.name }, 'Failed to parse Document AI JSON; skipping file');
          continue;
        }
        _collectTokenConfidences(docResult, allConfs);
        _collectBlockCounts(docResult, blockCounts);
        if (useLayoutParser && docResult.documentLayout) {
          sections.push(..._extractSectionsFromLayout(docResult));
        } else {
          sections.push(..._extractSections(docResult));
        }
      }

      const ocrQuality = _calcOcrQuality(allConfs);
      const layoutType = _calcLayoutType(blockCounts);

      this.logger.info(
        { jobId: job.jobId, ocrQuality, layoutType, useLayoutParser },
        'Document AI quality assessment complete',
      );

      if (sections.length === 0) {
        return this.halt(job.fail('PARSE_FAILURE', 'Document AI output contains no extractable text'));
      }

      // ── 6. Write section .html files to normalized bucket ──────────────────
      const stem = path.basename(job.originalFilename, path.extname(job.originalFilename));
      const normalizedUris = [];

      for (let i = 0; i < sections.length; i++) {
        const partName = `moby-prince/${stem}_part_${String(i + 1).padStart(3, '0')}.html`;
        const content  = _formatSection(sections[i]);

        await storage.bucket(normalizedBucket).file(partName).save(content, {
          contentType: 'text/html; charset=utf-8',
          metadata: {
            jobId:     job.jobId,
            pageStart: String(sections[i].pageStart),
            pageEnd:   String(sections[i].pageEnd),
            section:   sections[i].heading || '',
          },
        });

        normalizedUris.push(`gs://${normalizedBucket}/${partName}`);
      }

      const manifestName = `moby-prince/${stem}.normalized-manifest.json`;
      const manifestUri = `gs://${normalizedBucket}/${manifestName}`;
      const canonicalDocumentId = toDocumentId(job.originalFilename);
      const manifest = {
        sourceUri: job.sourceUri,
        canonicalDocumentId,
        generatedAt: new Date().toISOString(),
        partsCount: sections.length,
        ocrQuality,
        layoutType,
        partUris: normalizedUris,
        sections: sections.map((section, index) => ({
          uri: normalizedUris[index],
          heading: section.heading || null,
          pageStart: section.pageStart ?? null,
          pageEnd: section.pageEnd ?? null,
        })),
      };

      await storage.bucket(normalizedBucket).file(manifestName).save(JSON.stringify(manifest, null, 2), {
        contentType: 'application/json; charset=utf-8',
        metadata: {
          jobId: job.jobId,
          sourceUri: job.sourceUri,
          partsCount: String(sections.length),
        },
      });

      this.logger.info(
        { jobId: job.jobId, partsCount: sections.length, partUris: normalizedUris, manifestUri },
        `Split into ${sections.length} sections via Document AI`
      );

      // ── 7. Create child jobs for each section ──────────────────────────────
      const childJobs = normalizedUris.map((uri, i) => {
        const sec = sections[i];
        const extraMeta = {};
        if (ocrQuality)           extraMeta.ocr_quality  = ocrQuality;
        if (layoutType)           extraMeta.layout_type  = layoutType;
        if (sec.pageStart != null) extraMeta.page_start  = sec.pageStart;
        if (sec.pageEnd   != null) extraMeta.page_end    = sec.pageEnd;
        extraMeta.skip_indexing = true;
        extraMeta.canonical_document_id = canonicalDocumentId;
        extraMeta.canonical_source_uri = job.sourceUri;
        extraMeta.canonical_normalized_uri = manifestUri;
        extraMeta.purge_claims = i === 0;
        return createJob(uri, {
          originalFilename: `${stem}_part_${String(i + 1).padStart(3, '0')}.html`,
          parentJobId:      job.jobId,
          mimeType:         'text/html',
          ...extraMeta,
        }, this._config.retry.maxAttempts);
      });

      if (documentRegistry.isEnabled()) {
        try {
          await documentRegistry.upsertReprocessingMetadata({
            documentId: canonicalDocumentId,
            sourceUri: job.sourceUri,
            normalizedUri: manifestUri,
            title: path.basename(job.originalFilename, path.extname(job.originalFilename)),
            ocrQuality,
            chunkCount: sections.length,
            ingestionJobId: job.jobId,
            reprocessingState: 'normalized_children_ready',
          });
        } catch (registryErr) {
          this.logger.warn(
            { jobId: job.jobId, error: registryErr.message },
            'Could not persist document reprocessing metadata to BigQuery',
          );
        }
      }

      const completed = splitting.completeSplit(normalizedUris);
      return this.ok(completed, { childJobs, partsCount: sections.length, partUris: normalizedUris });

    } catch (err) {
      this.logger.error({ jobId: job.jobId, error: err.message, stack: err.stack }, 'DocumentAI worker error');
      return this.halt(job.fail('PDF_CRITICAL', `Document AI error: ${err.message}`));
    }
  }
}

// ── Quality-metric helpers ────────────────────────────────────────────────────

/** Accumulate per-token OCR confidence values into `out` (in-place). */
function _collectTokenConfidences(doc, out) {
  for (const page of (doc.pages || [])) {
    for (const token of (page.tokens || [])) {
      const c = token.layout?.confidence;
      if (typeof c === 'number') out.push(c);
    }
  }
}

/** Accumulate block-type counts into `counts` (in-place). */
function _collectBlockCounts(doc, counts) {
  // Layout Parser format
  if (doc.documentLayout?.blocks) {
    for (const blk of doc.documentLayout.blocks) {
      if (blk.tableBlock)                                   counts.tables++;
      else if (blk.textBlock?.type?.startsWith('heading'))  counts.headings++;
      else                                                  counts.other++;
    }
    return;
  }
  // OCR processor format
  for (const page of (doc.pages || [])) {
    for (const block of (page.blocks || [])) {
      const t = block.layout?.blockType || '';
      if (t.includes('TABLE'))                                  counts.tables++;
      else if (t.includes('HEADING') || t.includes('TITLE'))   counts.headings++;
      else                                                      counts.other++;
    }
  }
}

/**
 * Derive OCR quality label from aggregated token confidence scores.
 * Returns null when no tokens were found (non-text document or very short PDF).
 */
function _calcOcrQuality(confs) {
  if (confs.length === 0) return null;
  const avg = confs.reduce((s, v) => s + v, 0) / confs.length;
  return avg > 0.9 ? 'high' : avg > 0.7 ? 'medium' : 'low';
}

/**
 * Derive layout type from aggregated block-type counts.
 */
function _calcLayoutType({ tables, headings, other }) {
  const total = tables + headings + other || 1;
  if (tables / total > 0.2)   return 'table_heavy';
  if (headings / total > 0.1) return 'structured';
  return 'prose';
}

// ── Layout Parser section extraction ─────────────────────────────────────────

/**
 * Extract logical sections from a Layout Parser Document JSON.
 * Uses `documentLayout.blocks` with semantic type annotations.
 * Falls back to the heuristic extractor when layout blocks are absent.
 */
function _extractSectionsFromLayout(doc) {
  const blocks = doc.documentLayout?.blocks;
  if (!blocks || blocks.length === 0) return _extractSections(doc);

  const sections = [];
  let cur = { heading: null, text: '', pageStart: null, pageEnd: null };

  for (const blk of blocks) {
    const isHeading = blk.textBlock?.type?.startsWith('heading');
    const isTable   = !!blk.tableBlock;
    const blockText = isTable
      ? _tableBlockToText(blk.tableBlock)
      : (blk.textBlock?.text || '');

    if (!blockText.trim()) continue;

    // Page range from provenance (Layout Parser includes pageRefs)
    const pageNums = (blk.pageSpan
      ? [blk.pageSpan.pageStart, blk.pageSpan.pageEnd]
      : []
    ).filter(Boolean);
    const blockPageStart = pageNums[0] ?? null;
    const blockPageEnd   = pageNums[pageNums.length - 1] ?? null;

    const wouldOverflow = cur.text.length + blockText.length > MAX_SECTION_CHARS;
    const startNew = (isHeading && cur.text.length > 0) || wouldOverflow;

    if (startNew) {
      if (cur.text.trim()) sections.push({ ...cur });
      cur = {
        heading:   isHeading ? blockText.trim().slice(0, 120) : null,
        text:      isHeading ? '' : blockText,
        pageStart: blockPageStart,
        pageEnd:   blockPageEnd,
      };
    } else {
      if (isHeading && !cur.heading) cur.heading = blockText.trim().slice(0, 120);
      cur.text   += cur.text ? '\n\n' + blockText : blockText;
      if (blockPageStart != null && cur.pageStart == null) cur.pageStart = blockPageStart;
      if (blockPageEnd   != null) cur.pageEnd = blockPageEnd;
    }
  }

  if (cur.text.trim()) sections.push(cur);
  return sections.length > 0 ? sections : _extractSections(doc);
}

/** Render a Layout Parser tableBlock to plain text (tab-separated rows). */
function _tableBlockToText(tableBlock) {
  if (!tableBlock) return '';
  const rows = [...(tableBlock.headerRows || []), ...(tableBlock.bodyRows || [])];
  return rows
    .map(row =>
      (row.cells || [])
        .map(cell => (cell.blocks || []).map(b => b.textBlock?.text || '').join(' ').trim())
        .join('\t')
    )
    .filter(Boolean)
    .join('\n');
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
  const heading = section.heading
    ? `<h1>${_escapeHtml(section.heading)}</h1>`
    : '';
  const pageRef = `<p data-page-start="${section.pageStart}" data-page-end="${section.pageEnd}">Pagine ${section.pageStart}&ndash;${section.pageEnd}</p>`;
  const body = section.text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${_escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('\n');

  return [
    '<!doctype html>',
    '<html lang="it">',
    '<head><meta charset="utf-8" /></head>',
    '<body>',
    heading,
    pageRef,
    body,
    '</body>',
    '</html>',
  ].join('\n');
}

function _escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { DocumentAIWorker };
