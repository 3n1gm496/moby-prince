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
 * Metadata:
 *   Struct metadata (filterable via struct.* expressions) is populated in two
 *   ways, in order of decreasing reliability:
 *     1. Caller-supplied: job.meta object (set by import-documents.js manifest path)
 *     2. Heuristic:       _extractMetadata() infers year, legislature,
 *                         document_type, and institution from the filename/path.
 *   Fields that cannot be inferred are omitted from structData entirely so
 *   they do not overwrite data from a previous manifest import.
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
    return this._config.dryRun === true || process.env.INDEX_DRY_RUN === 'true';
  }

  shouldRun(job) {
    if (job.isSplit) return false; // parent was split into child jobs; children are indexed separately
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

    if (!data.name) {
      throw new Error(`DE import returned no document resource name for docId=${docId}`);
    }

    return { documentId: docId, documentResourceName: data.name };
  }
}

// ── Import body builders ──────────────────────────────────────────────────────

/**
 * Build the PUT body for a GCS-sourced document.
 *
 * Metadata is stored in structData (the field that Vertex AI Search exposes
 * via struct.* filter expressions). Caller-supplied job.meta takes precedence
 * over heuristic inference so manifest imports are never downgraded.
 */
function _buildGcsImportBody(docId, gcsUri, job) {
  const heuristic  = _extractMetadata(job.originalFilename, gcsUri);
  const callerMeta = job.meta || {};

  // Merge: caller-supplied values win; heuristic fills gaps; nulls are omitted
  // so they don't overwrite metadata from a previous manifest import.
  const merged = { ...heuristic, ...callerMeta };
  const structData = Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v !== null && v !== undefined && v !== '')
  );

  return {
    id: docId,
    structData,
    content: {
      mimeType: job.mimeType || 'text/plain',
      uri:      gcsUri,
    },
  };
}

/**
 * Build the PUT body for an inline (local file) document.
 * Same metadata strategy as _buildGcsImportBody.
 */
async function _buildInlineImportBody(docId, localPath, job) {
  const fs         = require('fs');
  const content    = fs.readFileSync(localPath, 'utf8');
  const heuristic  = _extractMetadata(job.originalFilename, localPath);
  const callerMeta = job.meta || {};

  const merged = { ...heuristic, ...callerMeta };
  const structData = Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v !== null && v !== undefined && v !== '')
  );

  return {
    id: docId,
    structData,
    content: {
      mimeType: 'text/plain',
      rawBytes: Buffer.from(content).toString('base64'),
    },
  };
}

// ── Heuristic metadata extraction ─────────────────────────────────────────────

/**
 * Infer corpus metadata from the document's filename and storage path.
 *
 * This is a best-effort heuristic — it works when files follow a naming
 * convention that includes document type, institution, or year keywords.
 * For curated metadata, use the manifest import path instead:
 *   node ingestion/scripts/import-documents.js --manifest corpus.jsonl
 *
 * Fields returned (null when inference is not confident):
 *   year          — 4-digit year in [1991–2024] extracted from the path
 *   legislature   — Italian legislature number derived from year
 *   document_type — enum value matched from keywords in filename
 *   institution   — enum value matched from keywords in filename/path
 *
 * Fields intentionally NOT inferred (require NLP or human annotation):
 *   persons_mentioned, topic, ocr_quality
 *
 * @param {string} filename
 * @param {string} uri  — local path or gs:// URI
 * @returns {{ year: number|null, legislature: string|null, document_type: string|null, institution: string|null }}
 */
function _extractMetadata(filename, uri) {
  // Normalise to lowercase for matching; include both filename and full path
  const hay = (uri + '/' + filename).toLowerCase().replace(/[_\-./\\]/g, ' ');

  // ── Year ──────────────────────────────────────────────────────────────────
  const yearMatch = hay.match(/\b(199[1-9]|200[0-9]|201[0-9]|202[0-4])\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null;

  // ── Legislature (inferred from year) ─────────────────────────────────────
  // Italian republican legislatures:
  //   X=1987–92, XI=1992–94, XII=1994–96, XIII=1996–2001,
  //   XIV=2001–06, XV=2006–08, XVI=2008–13, XVII=2013–18,
  //   XVIII=2018–22, XIX=2022–present
  const YEAR_TO_LEG = [
    [1987, 1992, 'X'],
    [1992, 1994, 'XI'],
    [1994, 1996, 'XII'],
    [1996, 2001, 'XIII'],
    [2001, 2006, 'XIV'],
    [2006, 2008, 'XV'],
    [2008, 2013, 'XVI'],
    [2013, 2018, 'XVII'],
    [2018, 2022, 'XVIII'],
    [2022, 9999, 'XIX'],
  ];
  let legislature = null;
  if (year !== null) {
    for (const [from, to, leg] of YEAR_TO_LEG) {
      if (year >= from && year < to) { legislature = leg; break; }
    }
  }

  // ── Document type ─────────────────────────────────────────────────────────
  const TYPE_PATTERNS = [
    [/testimon/,                              'testimony'],
    [/perizia|expert opinion|expert  op/,     'expert_opinion'],
    [/relazione|report/,                      'report'],
    [/\ball[_ ]?\b|allegato|exhibit/,         'exhibit'],
    [/decreto|ordinanza|decree/,              'decree'],
    [/atto parl|parliamentary|seduta|verbale parl/, 'parliamentary_act'],
    [/stampa|articol|giornale|press/,         'press'],
    [/indagin|invest|inquiry/,                'investigation'],
  ];
  let document_type = null;
  for (const [re, val] of TYPE_PATTERNS) {
    if (re.test(hay)) { document_type = val; break; }
  }

  // ── Institution ───────────────────────────────────────────────────────────
  const INST_PATTERNS = [
    [/marina mil/,                           'marina_militare'],
    [/guardia costiera|mrcc|capitaneria/,    'guardia_costiera'],
    [/procura|magistrat|livorno giu/,        'procura_livorno'],
    [/commission[e ]parl|commissione bi|camera dep|senato/, 'commissione_parlamentare'],
    [/\btribunal/,                           'tribunale'],
    [/ministero|min trasporti|mit\b/,        'ministero_trasporti'],
    [/\brina\b/,                             'rina'],
  ];
  let institution = null;
  for (const [re, val] of INST_PATTERNS) {
    if (re.test(hay)) { institution = val; break; }
  }

  return { year, legislature, document_type, institution };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _toDocumentId(filename) {
  const hash = crypto.createHash('sha1').update(filename).digest('hex').slice(0, 8);
  const slug = filename
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug}-${hash}`.slice(0, 63);
}

module.exports = { IndexerWorker };
