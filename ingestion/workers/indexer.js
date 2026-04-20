'use strict';

/**
 * IndexerWorker — creates or updates a single document in the Vertex AI Search
 * (Discovery Engine) datastore via the synchronous PUT document API.
 *
 * Two import modes:
 *   INLINE   — document content included directly in the request body
 *              (text files up to ~100 KB; simplest for testing)
 *   GCS_URI  — document stored in GCS; DE fetches it via content.uri
 *              (production path for all real documents)
 *
 * The single-document PUT is synchronous: a 2xx response means the document
 * has been created/updated and is available for search (after indexing lag).
 * This is distinct from the batch importDocuments API, which returns an LRO.
 *
 * Error codes emitted:
 *   INDEX_FAILURE   — DE returned an HTTP error or an unexpected response shape
 *
 * Note: when running locally without GCP credentials, this worker logs the
 * import payload it would send and returns a simulated INDEXED state.
 * Set INDEX_DRY_RUN=true to force dry-run mode in any environment.
 */

const crypto = require('crypto');

const { BaseWorker } = require('./base');

const IMPORT_TIMEOUT_MS = 60_000;

class IndexerWorker extends BaseWorker {
  constructor(config, logger) {
    super('indexer', logger);
    this._config = config;
  }

  get _dryRun() {
    // Defer to config so the value is resolved at call time (M-1 compatible).
    return this._config.dryRun === true || process.env.INDEX_DRY_RUN === 'true';
  }

  shouldRun(job) {
    // Run if validation passed and splitting is done (or not needed)
    return ['VALIDATING', 'SPLITTING', 'INDEXING'].includes(job.status);
  }

  async run(job, context = {}) {
    let updated = job.startIndexing();
    const uri   = updated.normalizedUri || updated.sourceUri;

    this.logger.info({ jobId: job.jobId, uri, dryRun: this._dryRun }, 'Indexing document');

    if (this._dryRun || !this._config.dataStoreId) {
      this.logger.warn(
        { jobId: job.jobId, reason: this._dryRun ? 'INDEX_DRY_RUN=true' : 'DATA_STORE_ID not configured' },
        'Dry-run mode: skipping actual Discovery Engine import'
      );
      const fakeDocId = `dry-run-${job.jobId.slice(0, 8)}`;
      return this.ok(updated.complete(fakeDocId), { dryRun: true, documentId: fakeDocId });
    }

    try {
      const result = await this._importDocument(updated, uri, context);
      const completed = updated.complete(result.documentId);
      this.logger.info(
        { jobId: job.jobId, documentId: result.documentId, documentResourceName: result.documentResourceName },
        'Indexed successfully',
      );
      return this.ok(completed, result);
    } catch (err) {
      const failed = updated.fail('INDEX_FAILURE', err.message);
      this.logger.error({ jobId: job.jobId, error: err.message }, 'Indexing failed');
      return this.halt(failed, { error: err.message });
    }
  }

  async _importDocument(job, uri, context) {
    const { getAccessToken } = require('../services/auth');
    const cfg = this._config;

    const token    = await getAccessToken();
    const docId    = _toDocumentId(job.originalFilename);
    // Single-document PUT — synchronous, not an LRO
    const endpoint = `https://${cfg.location}-discoveryengine.googleapis.com/v1/projects/${cfg.projectId}/locations/${cfg.location}/collections/default_collection/dataStores/${cfg.dataStoreId}/branches/0/documents/${encodeURIComponent(docId)}`;

    const body = uri.startsWith('gs://')
      ? _buildGcsImportBody(docId, uri, job)
      : await _buildInlineImportBody(docId, uri, job);

    const controller = new AbortController();
    const timerId    = setTimeout(() => controller.abort('timeout'), IMPORT_TIMEOUT_MS);

    let res;
    try {
      res = await fetch(endpoint, {
        method:  'PUT',
        headers: {
          Authorization:         `Bearer ${token}`,
          'Content-Type':        'application/json',
          'X-Goog-User-Project': cfg.projectId,
        },
        body:   JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timerId);
      const msg = fetchErr.name === 'AbortError'
        ? `DE import timed out after ${IMPORT_TIMEOUT_MS / 1000}s`
        : fetchErr.message;
      throw Object.assign(new Error(msg), { httpStatus: fetchErr.name === 'AbortError' ? 504 : 502 });
    }
    clearTimeout(timerId);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw Object.assign(
        new Error(`DE import HTTP ${res.status}: ${text.slice(0, 200)}`),
        { httpStatus: res.status },
      );
    }

    const data = await res.json();

    // data.name is the full document resource path, e.g.
    // projects/.../dataStores/.../branches/0/documents/<docId>
    if (!data.name) {
      throw new Error(`DE import returned no document resource name for docId=${docId}`);
    }

    return { documentId: docId, documentResourceName: data.name };
  }
}

// ── Import body builders ──────────────────────────────────────────────────────

function _buildGcsImportBody(docId, gcsUri, job) {
  return {
    id: docId,
    jsonData: JSON.stringify({
      id:          docId,
      title:       job.originalFilename,
      document_type: null,  // filled once metadata pipeline is wired
    }),
    content: {
      mimeType: job.mimeType || 'text/plain',
      uri:      gcsUri,
    },
  };
}

async function _buildInlineImportBody(docId, localPath, job) {
  const fs      = require('fs');
  const content = fs.readFileSync(localPath, 'utf8');
  return {
    id: docId,
    jsonData: JSON.stringify({ id: docId, title: job.originalFilename }),
    content: {
      mimeType: 'text/plain',
      rawBytes: Buffer.from(content).toString('base64'),
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _toDocumentId(filename) {
  // Append an 8-hex-char SHA-1 suffix so that files whose names normalise to
  // the same slug (e.g. report_2003.pdf vs report_2003.txt) get distinct IDs.
  const hash = crypto.createHash('sha1').update(filename).digest('hex').slice(0, 8);
  const slug = filename
    .toLowerCase()
    .replace(/\.[^.]+$/, '')         // strip extension
    .replace(/[^a-z0-9_-]/g, '-')   // sanitise
    .replace(/-{2,}/g, '-')          // collapse dashes
    .replace(/^-+|-+$/g, '');        // trim leading/trailing dashes
  return `${slug}-${hash}`.slice(0, 63);
}

module.exports = { IndexerWorker };
