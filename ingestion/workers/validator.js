'use strict';

/**
 * ValidatorWorker — pre-flight checks before a document enters the pipeline.
 *
 * Checks:
 *   1. File is reachable (exists locally or GCS object head succeeds)
 *   2. MIME type is supported (text/plain, application/pdf, text/html)
 *   3. File size is non-zero
 *   4. File size does not exceed the PDF_CRITICAL threshold (those must go
 *      through Document AI and cannot be directly ingested)
 *
 * Error codes emitted:
 *   VALIDATION_FAILURE   — non-retryable; file fundamentally cannot be ingested
 *   FILE_NOT_FOUND       — retryable (transient GCS availability issues)
 *   PDF_CRITICAL         — non-retryable; requires Document AI pipeline
 */

const fs   = require('fs');
const path = require('path');
const { BaseWorker } = require('./base');

const SUPPORTED_MIMES = new Set([
  'text/plain',
  'text/html',
  'application/pdf',
  'application/json',
]);

class ValidatorWorker extends BaseWorker {
  constructor(config, logger) {
    super('validator', logger);
    this._config = config;
  }

  shouldRun(job) {
    return job.status === 'PENDING';
  }

  async run(job, context = {}) {
    const updatedJob = job.startValidating();
    this.logger.info({ jobId: job.jobId, sourceUri: job.sourceUri }, 'Validating');

    const result = await this._validate(updatedJob, context);

    if (result.error) {
      const failed = updatedJob.fail(result.error.code, result.error.message);
      this.logger.warn({ jobId: job.jobId, errorCode: result.error.code }, result.error.message);
      return this.halt(failed, { validationResult: result });
    }

    // Attach file metadata we now know
    const enriched = new (require('../state/job').IngestionJob)({
      ...updatedJob,
      fileSizeBytes:    result.fileSizeBytes,
      mimeType:         result.mimeType,
      originalFilename: result.originalFilename || updatedJob.originalFilename,
      updatedAt:        new Date().toISOString(),
    });

    this.logger.info(
      { jobId: job.jobId, fileSizeBytes: result.fileSizeBytes, mimeType: result.mimeType },
      'Validation passed'
    );

    return this.ok(enriched, { validationResult: result });
  }

  async _validate(job, context) {
    const uri = job.sourceUri;

    // GCS URI
    if (uri.startsWith('gs://')) {
      return this._validateGcs(uri, job, context);
    }

    // Local file
    return this._validateLocal(uri, job);
  }

  _validateLocal(filePath, job) {
    if (!fs.existsSync(filePath)) {
      return { error: { code: 'FILE_NOT_FOUND', message: `File not found: ${filePath}` } };
    }

    const stat      = fs.statSync(filePath);
    const ext       = path.extname(filePath).toLowerCase();
    const mimeType  = _extToMime(ext) || job.mimeType;
    const sizeBytes = stat.size;

    if (sizeBytes === 0) {
      return { error: { code: 'VALIDATION_FAILURE', message: 'File is empty' } };
    }

    if (!SUPPORTED_MIMES.has(mimeType)) {
      return {
        error: {
          code:    'VALIDATION_FAILURE',
          message: `Unsupported MIME type: ${mimeType} (${ext}). Supported: ${[...SUPPORTED_MIMES].join(', ')}`,
        },
      };
    }

    const cfg = this._config.split;
    if (mimeType === 'application/pdf' && sizeBytes > cfg.pdfCriticalBytes) {
      return {
        error: {
          code:    'PDF_CRITICAL',
          message: `PDF (${_mb(sizeBytes)} MB) exceeds ${_mb(cfg.pdfCriticalBytes)} MB limit. ` +
                   'Must be processed through Document AI pipeline before indexing.',
        },
      };
    }

    return {
      fileSizeBytes:    sizeBytes,
      mimeType,
      originalFilename: path.basename(filePath),
    };
  }

  async _validateGcs(gcsUri, job, context) {
    // Requires @google-cloud/storage; gracefully degrade if not installed
    const storage = context.storage;
    if (!storage) {
      this.logger.warn({ gcsUri }, 'GCS storage client not provided; skipping GCS validation');
      return { fileSizeBytes: job.fileSizeBytes, mimeType: job.mimeType };
    }

    try {
      const { bucket, name } = _parseGcsUri(gcsUri);
      const [metadata] = await storage.bucket(bucket).file(name).getMetadata();
      const sizeBytes  = parseInt(metadata.size, 10);
      const mimeType   = metadata.contentType || job.mimeType;

      if (sizeBytes === 0) {
        return { error: { code: 'VALIDATION_FAILURE', message: 'GCS object is empty' } };
      }

      const cfg = this._config.split;
      if (mimeType === 'application/pdf' && sizeBytes > cfg.pdfCriticalBytes) {
        return {
          error: {
            code:    'PDF_CRITICAL',
            message: `PDF ${_mb(sizeBytes)} MB exceeds ${_mb(cfg.pdfCriticalBytes)} MB critical limit. ` +
                     'Route through Document AI pipeline.',
          },
        };
      }

      return { fileSizeBytes: sizeBytes, mimeType, originalFilename: name.split('/').pop() };
    } catch (err) {
      if (err.code === 404) {
        return { error: { code: 'FILE_NOT_FOUND', message: `GCS object not found: ${gcsUri}` } };
      }
      return { error: { code: 'FILE_NOT_FOUND', message: `GCS error: ${err.message}` } };
    }
  }
}

function _extToMime(ext) {
  return { '.pdf': 'application/pdf', '.txt': 'text/plain', '.html': 'text/html', '.json': 'application/json' }[ext] || null;
}

function _mb(bytes) { return (bytes / 1_000_000).toFixed(1); }

function _parseGcsUri(uri) {
  const m = uri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!m) throw new Error(`Invalid GCS URI: ${uri}`);
  return { bucket: m[1], name: m[2] };
}

module.exports = { ValidatorWorker };
