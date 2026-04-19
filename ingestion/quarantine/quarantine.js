'use strict';

/**
 * Quarantine manager — handles QUARANTINED jobs.
 *
 * A quarantined job is terminal: it will not be retried automatically.
 * The quarantine manager provides:
 *   1. Reporting: list all quarantined jobs with failure details
 *   2. Export: copy the original file to the quarantine GCS bucket
 *      alongside a .failure.json sidecar
 *   3. Manual re-entry: operator can reset a quarantined job to PENDING
 *      after manual repair (e.g. re-OCR'd file, split replacement)
 *
 * Quarantine bucket structure:
 *   gs://{project}-corpus-quarantine/
 *     {original-path}/{filename}              original file (copied)
 *     {original-path}/{filename}.failure.json failure metadata
 *
 * In production, a Cloud Monitoring alert fires when quarantine count
 * increases (see docs/ingestion-architecture.md §Observability).
 */

const fs   = require('fs');
const path = require('path');
const { createLogger } = require('../workers/base');

class QuarantineManager {
  constructor(config, logger) {
    this._config = config;
    this.logger  = logger || createLogger('quarantine');
  }

  /**
   * List all quarantined jobs with a summary suitable for operator review.
   *
   * @param {object} store
   * @returns {Promise<object[]>}
   */
  async list(store) {
    const jobs = await store.getByStatus('QUARANTINED');
    return jobs.map(j => ({
      jobId:            j.jobId,
      sourceUri:        j.sourceUri,
      originalFilename: j.originalFilename,
      errorCode:        j.errorCode,
      errorMessage:     j.errorMessage,
      attempts:         j.attempts,
      quarantinedAt:    j.completedAt,
      fileSizeBytes:    j.fileSizeBytes,
      mimeType:         j.mimeType,
    }));
  }

  /**
   * Export a quarantined job's source file to the quarantine bucket/directory
   * and write a .failure.json sidecar.
   *
   * @param {object} job
   * @param {object} [context]  { storage } for GCS
   */
  async export(job, context = {}) {
    const uri = job.sourceUri;
    this.logger.info({ jobId: job.jobId, uri }, 'Exporting to quarantine');

    const sidecar = {
      jobId:         job.jobId,
      sourceUri:     uri,
      errorCode:     job.errorCode,
      errorMessage:  job.errorMessage,
      attempts:      job.attempts,
      quarantinedAt: job.completedAt,
      fileSizeBytes: job.fileSizeBytes,
      mimeType:      job.mimeType,
    };

    if (uri.startsWith('gs://')) {
      await this._exportGcs(job, sidecar, context);
    } else {
      await this._exportLocal(job, sidecar);
    }
  }

  async _exportLocal(job, sidecar) {
    const src     = job.sourceUri;
    const qDir    = this._config.localDirs.quarantine;
    const base    = path.basename(src);
    const destFile = path.join(qDir, base);
    const sideFile = destFile + '.failure.json';

    fs.mkdirSync(qDir, { recursive: true });

    if (fs.existsSync(src)) {
      fs.copyFileSync(src, destFile);
    }
    fs.writeFileSync(sideFile, JSON.stringify(sidecar, null, 2));

    this.logger.info({ dest: destFile, sidecar: sideFile }, 'Quarantine export complete');
  }

  async _exportGcs(job, sidecar, context) {
    const storage = context.storage;
    if (!storage) {
      this.logger.warn({ jobId: job.jobId }, 'No GCS client; skipping GCS quarantine export');
      return;
    }

    const { bucket: srcBucket, name: srcName } = _parseGcsUri(job.sourceUri);
    const qBucket = this._config.buckets.quarantine;
    if (!qBucket) {
      this.logger.warn({}, 'BUCKET_QUARANTINE not configured; skipping export');
      return;
    }

    await storage.bucket(srcBucket).file(srcName)
      .copy(storage.bucket(qBucket).file(srcName));

    await storage.bucket(qBucket)
      .file(srcName + '.failure.json')
      .save(JSON.stringify(sidecar, null, 2), { contentType: 'application/json' });

    this.logger.info({ qBucket, srcName }, 'GCS quarantine export complete');
  }

  /**
   * Reset a QUARANTINED job back to PENDING for manual re-entry.
   * The caller is responsible for fixing the underlying issue first.
   *
   * @param {object} job
   * @param {object} store
   * @param {string} [reason]  operator note
   */
  async requeue(job, store, reason = 'Manual requeue by operator') {
    if (job.status !== 'QUARANTINED') {
      throw new Error(`Job ${job.jobId} is ${job.status}, not QUARANTINED`);
    }

    const requeued = new (require('../state/job').IngestionJob)({
      ...job,
      status:       'PENDING',
      errorCode:    null,
      errorMessage: null,
      attempts:     0,
      completedAt:  null,
      updatedAt:    new Date().toISOString(),
    });

    await store.save(requeued);
    this.logger.info({ jobId: job.jobId, reason }, 'Job requeued from quarantine');
    return requeued;
  }
}

function _parseGcsUri(uri) {
  const m = uri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!m) throw new Error(`Invalid GCS URI: ${uri}`);
  return { bucket: m[1], name: m[2] };
}

module.exports = { QuarantineManager };
