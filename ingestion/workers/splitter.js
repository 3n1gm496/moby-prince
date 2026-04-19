'use strict';

/**
 * SplitterWorker — detects oversized documents and splits them into parts that
 * satisfy the Vertex AI Search per-document size limit.
 *
 * Discovery Engine limits that motivate splitting:
 *   - Unstructured datastore: max 2.5 MB per document
 *   - Layout-aware chunking: can fail with FILE_READ_ERROR for large PDFs
 *   - Chunk count limit per document (~500 chunks; varies by config)
 *
 * Splitting strategy:
 *   TEXT files  → split at paragraph boundaries (blank lines) keeping each
 *                 part under maxBytesPerPart. Sentence-boundary fallback
 *                 if paragraphs are themselves too large.
 *   PDF files   → cannot be split here; flag as needing Document AI.
 *                 Splitter records the issue and halts with PDF_LARGE warning.
 *
 * Output:
 *   Each part is written as {originalName}_part_001.txt ... _part_NNN.txt
 *   to the normalizedDir / normalized GCS bucket.
 *   Child jobs are created for each part (parentJobId = original job's jobId).
 *
 * Error codes emitted:
 *   OVERSIZED       — text file too large (split attempted)
 *   SPLIT_FAILURE   — splitting produced zero valid parts
 *   PDF_LARGE       — PDF over warn threshold (retryable with Document AI)
 */

const fs   = require('fs');
const path = require('path');
const { BaseWorker } = require('./base');
const { createJob }  = require('../state/job');

// ── Splitting constants ───────────────────────────────────────────────────────

// Blank-line paragraph separator
const PARAGRAPH_RE = /\n{2,}/;

class SplitterWorker extends BaseWorker {
  constructor(config, logger) {
    super('splitter', logger);
    this._config = config;
  }

  shouldRun(job) {
    if (job.status !== 'VALIDATING') return false;
    if (!job.fileSizeBytes) return false;
    return job.fileSizeBytes > this._config.split.maxBytesPerPart || job.isSplit;
  }

  async run(job, context = {}) {
    const cfg = this._config.split;
    let updated = job.startSplitting();

    this.logger.info(
      { jobId: job.jobId, fileSizeBytes: job.fileSizeBytes, mimeType: job.mimeType },
      'Splitting oversized document'
    );

    // PDFs need Document AI — flag and halt
    if (job.mimeType === 'application/pdf') {
      if (job.fileSizeBytes > cfg.pdfCriticalBytes) {
        return this.halt(
          updated.fail('PDF_CRITICAL', 'PDF too large for direct split; must use Document AI pipeline'),
          {}
        );
      }
      // Warn but continue — the indexer will attempt direct ingest and may succeed
      this.logger.warn(
        { jobId: job.jobId, fileSizeBytes: job.fileSizeBytes },
        `PDF ${_mb(job.fileSizeBytes)} MB exceeds warn threshold; high risk of FILE_READ_ERROR`
      );
      return this.ok(updated, { warning: 'PDF_LARGE' });
    }

    // Text splitting
    const sourceUri = job.sourceUri;
    let text;
    try {
      text = await this._readText(sourceUri, context);
    } catch (err) {
      return this.halt(updated.fail('SPLIT_FAILURE', `Cannot read source for splitting: ${err.message}`), {});
    }

    const parts = splitTextIntoParts(text, { maxChars: cfg.maxCharsPerPart });

    if (parts.length === 0) {
      return this.halt(updated.fail('SPLIT_FAILURE', 'Splitting produced zero parts'), {});
    }

    if (parts.length === 1) {
      // File fits in one part after all (whitespace trimming can reduce size)
      this.logger.info({ jobId: job.jobId }, 'File fits in one part after trimming; no split needed');
      return this.ok(updated, { parts: 1 });
    }

    // Write parts
    const partUris = await this._writeParts(parts, job, context);

    // Create child jobs for each part (caller / pipeline is responsible for enqueuing them)
    const childJobs = partUris.map((uri, i) =>
      createJob(uri, {
        parentJobId:      job.jobId,
        originalFilename: `${_stem(job.originalFilename)}_part_${String(i + 1).padStart(3, '0')}.txt`,
        mimeType:         'text/plain',
        fileSizeBytes:    Buffer.byteLength(parts[i], 'utf8'),
      }, job.maxAttempts)
    );

    updated = updated.completeSplit(partUris);

    this.logger.info(
      { jobId: job.jobId, partsCount: parts.length, partUris },
      `Split into ${parts.length} parts`
    );

    return this.ok(updated, { parts: parts.length, partUris, childJobs });
  }

  async _readText(uri, context) {
    if (uri.startsWith('gs://')) {
      const storage = context.storage;
      if (!storage) throw new Error('GCS storage client not provided');
      const { bucket, name } = _parseGcsUri(uri);
      const [content] = await storage.bucket(bucket).file(name).download();
      return content.toString('utf8');
    }
    return fs.readFileSync(uri, 'utf8');
  }

  async _writeParts(parts, job, context) {
    const stem = _stem(job.originalFilename);
    const uris = [];

    for (let i = 0; i < parts.length; i++) {
      const partName = `${stem}_part_${String(i + 1).padStart(3, '0')}.txt`;
      const content  = parts[i];

      if (job.sourceUri.startsWith('gs://')) {
        const storage = context.storage;
        if (!storage) throw new Error('GCS storage client required for GCS write');
        const { name: srcName } = _parseGcsUri(job.sourceUri);
        const destName = srcName.replace(/[^/]+$/, partName);
        const destUri  = `gs://${this._config.buckets.normalized}/${destName}`;
        await storage.bucket(this._config.buckets.normalized).file(destName).save(content, {
          contentType: 'text/plain; charset=utf-8',
          metadata: { parentJobId: job.jobId, partIndex: String(i) },
        });
        uris.push(destUri);
      } else {
        const normalizedDir = this._config.localDirs.normalized;
        fs.mkdirSync(normalizedDir, { recursive: true });
        const destPath = path.join(normalizedDir, partName);
        fs.writeFileSync(destPath, content, 'utf8');
        uris.push(destPath);
      }
    }

    return uris;
  }
}

// ── Core splitting algorithm (exported for direct use / testing) ──────────────

/**
 * Analyse a local file or URI for ingestion issues without splitting.
 *
 * @param {string} filePath
 * @param {object} [config]
 * @returns {{ sizeBytes, mimeType, issues: Array<{code, detail}>, needsSplit }}
 */
function analyzeFile(filePath, config = {}) {
  const maxBytes     = config.maxBytesPerPart     || 2_000_000;
  const pdfWarn      = config.pdfWarnBytes         || 10_000_000;
  const pdfCritical  = config.pdfCriticalBytes     || 50_000_000;

  if (!fs.existsSync(filePath)) {
    return { sizeBytes: 0, mimeType: null, issues: [{ code: 'FILE_NOT_FOUND', detail: filePath }], needsSplit: false };
  }

  const stat      = fs.statSync(filePath);
  const ext       = path.extname(filePath).toLowerCase();
  const mimeType  = { '.pdf': 'application/pdf', '.txt': 'text/plain' }[ext] || 'application/octet-stream';
  const sizeBytes = stat.size;
  const issues    = [];

  if (sizeBytes > maxBytes) {
    issues.push({
      code:   'OVERSIZED',
      detail: `${_mb(sizeBytes)} MB exceeds ${_mb(maxBytes)} MB Discovery Engine limit`,
    });
  }

  if (mimeType === 'application/pdf') {
    if (sizeBytes > pdfCritical) {
      issues.push({
        code:   'PDF_CRITICAL',
        detail: `PDF ${_mb(sizeBytes)} MB exceeds ${_mb(pdfCritical)} MB — requires Document AI extraction, cannot directly ingest`,
      });
    } else if (sizeBytes > pdfWarn) {
      issues.push({
        code:   'PDF_LARGE',
        detail: `PDF ${_mb(sizeBytes)} MB exceeds ${_mb(pdfWarn)} MB warn threshold — high risk of FILE_READ_ERROR`,
      });
    }
  }

  return {
    sizeBytes,
    mimeType,
    issues,
    needsSplit: issues.some(i => i.code === 'OVERSIZED'),
  };
}

/**
 * Split a large text string into parts that each fit under maxChars.
 *
 * Strategy:
 *   1. Split on paragraph boundaries (two or more consecutive newlines)
 *   2. Accumulate paragraphs until the next one would exceed maxChars
 *   3. If a single paragraph exceeds maxChars, split at sentence boundaries
 *   4. If a single sentence exceeds maxChars, hard-split at maxChars
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {number} [opts.maxChars]  default 800_000
 * @returns {string[]}  array of part strings, each ≤ maxChars
 */
function splitTextIntoParts(text, opts = {}) {
  const maxChars = opts.maxChars || 800_000;

  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(PARAGRAPH_RE).filter(p => p.trim());
  const parts      = [];
  let   current    = '';

  for (const para of paragraphs) {
    // Paragraph fits with what we have so far
    if (current.length + para.length + 2 <= maxChars) {
      current = current ? current + '\n\n' + para : para;
      continue;
    }

    // Flush current part before adding the oversized paragraph
    if (current.trim()) {
      parts.push(current.trim());
      current = '';
    }

    // Paragraph itself fits in one part
    if (para.length <= maxChars) {
      current = para;
      continue;
    }

    // Paragraph is itself too large — split at sentence boundaries
    const sentenceParts = _splitAtSentences(para, maxChars);
    for (let i = 0; i < sentenceParts.length - 1; i++) {
      parts.push(sentenceParts[i].trim());
    }
    current = sentenceParts[sentenceParts.length - 1] || '';
  }

  if (current.trim()) parts.push(current.trim());

  return parts.filter(p => p.length > 0);
}

/**
 * Split a string at sentence boundaries, keeping each slice ≤ maxChars.
 * Falls back to hard-splitting at maxChars if no sentence boundary is found.
 */
function _splitAtSentences(text, maxChars) {
  const SENTENCE_END_RE = /(?<=[.!?])\s+/;
  const sentences = text.split(SENTENCE_END_RE).filter(Boolean);
  const parts = [];
  let current = '';

  for (const sent of sentences) {
    if (current.length + sent.length + 1 <= maxChars) {
      current = current ? current + ' ' + sent : sent;
    } else {
      if (current) parts.push(current);
      if (sent.length > maxChars) {
        // Hard-split long sentence
        for (let i = 0; i < sent.length; i += maxChars) {
          parts.push(sent.slice(i, i + maxChars));
        }
        current = '';
      } else {
        current = sent;
      }
    }
  }

  if (current) parts.push(current);
  return parts;
}

/**
 * Scan a directory for files with ingestion issues.
 *
 * @param {string} dir
 * @param {object} [config]
 * @returns {Array<{file, analysis}>}
 */
function scanDirectory(dir, config = {}) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  _walkDir(dir, file => {
    const ext = path.extname(file).toLowerCase();
    if (!['.pdf', '.txt', '.html', '.json'].includes(ext)) return;
    const analysis = analyzeFile(file, config);
    if (analysis.issues.length > 0) results.push({ file, analysis });
  });
  return results;
}

function _walkDir(dir, fn) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) _walkDir(full, fn);
    else fn(full);
  }
}

function _mb(bytes) { return (bytes / 1_000_000).toFixed(1); }
function _stem(filename) { return filename.replace(/\.[^.]+$/, ''); }
function _parseGcsUri(uri) {
  const m = uri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!m) throw new Error(`Invalid GCS URI: ${uri}`);
  return { bucket: m[1], name: m[2] };
}

module.exports = { SplitterWorker, analyzeFile, splitTextIntoParts, scanDirectory };
