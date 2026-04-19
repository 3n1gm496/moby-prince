'use strict';

/**
 * IndexerWorker — imports a normalised document into the Vertex AI Search
 * (Discovery Engine) datastore.
 *
 * Two import modes:
 *   INLINE   — document content included directly in the import request body
 *              (text files up to ~100 KB; simplest for testing)
 *   GCS_URI  — document stored in GCS; DE fetches it via `gcsSource`
 *              (production path for all real documents)
 *
 * The import API is asynchronous: it returns an operation name and you must
 * poll for completion. This worker submits the import and records the
 * operation name in the job; a polling step can be added later.
 *
 * Error codes emitted:
 *   INDEX_FAILURE   — DE import API returned an error
 *   INDEX_TIMEOUT   — operation polling timed out (if polling is enabled)
 *
 * Note: when running locally without GCP credentials, this worker logs the
 * import payload it would send and returns a simulated INDEXED state.
 * Set INDEX_DRY_RUN=true to force dry-run mode in any environment.
 */

const { BaseWorker } = require('./base');

const DRY_RUN = process.env.INDEX_DRY_RUN === 'true';

class IndexerWorker extends BaseWorker {
  constructor(config, logger) {
    super('indexer', logger);
    this._config = config;
  }

  shouldRun(job) {
    // Run if validation passed and splitting is done (or not needed)
    return ['VALIDATING', 'SPLITTING', 'INDEXING'].includes(job.status);
  }

  async run(job, context = {}) {
    let updated = job.startIndexing();
    const uri   = updated.normalizedUri || updated.sourceUri;

    this.logger.info({ jobId: job.jobId, uri, dryRun: DRY_RUN }, 'Indexing document');

    if (DRY_RUN || !this._config.dataStoreId) {
      this.logger.warn(
        { jobId: job.jobId, reason: DRY_RUN ? 'INDEX_DRY_RUN=true' : 'DATA_STORE_ID not configured' },
        'Dry-run mode: skipping actual Discovery Engine import'
      );
      const fakeDocId = `dry-run-${job.jobId.slice(0, 8)}`;
      return this.ok(updated.complete(fakeDocId), { dryRun: true, documentId: fakeDocId });
    }

    try {
      const result = await this._importDocument(updated, uri, context);
      const completed = updated.complete(result.documentId);
      this.logger.info({ jobId: job.jobId, documentId: result.documentId }, 'Indexed successfully');
      return this.ok(completed, result);
    } catch (err) {
      const failed = updated.fail('INDEX_FAILURE', err.message);
      this.logger.error({ jobId: job.jobId, error: err.message }, 'Indexing failed');
      return this.halt(failed, { error: err.message });
    }
  }

  async _importDocument(job, uri, context) {
    const { getAccessToken } = require('../../backend/services/auth');
    const cfg = this._config;

    const token    = await getAccessToken();
    const docId    = _toDocumentId(job.originalFilename);
    const endpoint = `https://${cfg.location}-discoveryengine.googleapis.com/v1/projects/${cfg.projectId}/locations/${cfg.location}/collections/default_collection/dataStores/${cfg.dataStoreId}/branches/0/documents/${encodeURIComponent(docId)}`;

    const body = uri.startsWith('gs://')
      ? _buildGcsImportBody(docId, uri, job)
      : await _buildInlineImportBody(docId, uri, job);

    const res = await fetch(endpoint, {
      method:  'POST',
      headers: {
        Authorization:         `Bearer ${token}`,
        'Content-Type':        'application/json',
        'X-Goog-User-Project': cfg.projectId,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw Object.assign(new Error(`DE import HTTP ${res.status}: ${text.slice(0, 200)}`), { httpStatus: res.status });
    }

    const data = await res.json();
    return { documentId: docId, operation: data.name || null };
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
      mimeType:    'text/plain',
      rawBytes:    Buffer.from(content).toString('base64'),
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _toDocumentId(filename) {
  return filename
    .toLowerCase()
    .replace(/\.[^.]+$/, '')                  // strip extension
    .replace(/[^a-z0-9_-]/g, '-')            // sanitise
    .replace(/-{2,}/g, '-')                   // collapse dashes
    .slice(0, 63);                            // DE max doc ID length
}

module.exports = { IndexerWorker };
