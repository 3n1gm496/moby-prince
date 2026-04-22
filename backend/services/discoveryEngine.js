'use strict';

/**
 * Discovery Engine REST client.
 *
 * Wraps the Google Cloud Discovery Engine v1 HTTP API.
 * All methods return plain JS objects; normalisation lives in ../transformers/.
 */

const config           = require('../config');
const { getAccessToken } = require('./auth');
const { createLogger } = require('../logger');
const gcs              = require('./gcs');

const URI_CACHE_PATH = '_cache/de-uri-id.json';

const log = createLogger('discovery-engine');

// POST_TIMEOUT_MS must stay below the client-side fetch timeout (75 s defined
// in frontend/src/hooks/useChat.js CLIENT_TIMEOUT_MS) so that backend 504
// errors reach the client before the client aborts its own connection.
const POST_TIMEOUT_MS = 55_000;
const GET_TIMEOUT_MS  = 30_000;  // chunk lookup is a simple read; shorter timeout is fine
const RETRY_DELAY_MS  = 2_000;

// ── Error type ───────────────────────────────────────────────────────────────

class DiscoveryEngineError extends Error {
  constructor(message, statusCode = 502, detail = null) {
    super(message);
    this.name       = 'DiscoveryEngineError';
    this.statusCode = statusCode;
    this.detail     = detail;
    this.isTimeout  = false;
  }
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

async function _post(url, body, { timeoutMs = POST_TIMEOUT_MS, attempt = 1 } = {}) {
  const token      = await getAccessToken();
  const controller = new AbortController();
  const timerId    = setTimeout(() => controller.abort('timeout'), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method:  'POST',
      headers: {
        Authorization:         `Bearer ${token}`,
        'Content-Type':        'application/json',
        'X-Goog-User-Project': config.projectId,
      },
      body:   JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (fetchErr) {
    clearTimeout(timerId);
    if (fetchErr.name === 'AbortError') {
      const e = new DiscoveryEngineError('Request timed out', 504);
      e.isTimeout = true;
      throw e;
    }
    // Retry once on low-level network errors
    if (attempt === 1) {
      log.warn({ url: _redactUrl(url), attempt, error: fetchErr.message },
        'Network error — retrying');
      await _sleep(RETRY_DELAY_MS);
      return _post(url, body, { timeoutMs, attempt: 2 });
    }
    throw new DiscoveryEngineError(fetchErr.message);
  }

  clearTimeout(timerId);

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    log.error({ url: _redactUrl(url), status: response.status, detail: errText.slice(0, 300) },
      `Discovery Engine HTTP ${response.status}`);

    // Retry once on 5xx
    if (response.status >= 500 && attempt === 1) {
      log.warn({ url: _redactUrl(url), status: response.status, attempt },
        'Server error — retrying');
      await _sleep(RETRY_DELAY_MS);
      return _post(url, body, { timeoutMs, attempt: 2 });
    }

    throw new DiscoveryEngineError(
      `Discovery Engine returned ${response.status}`,
      response.status,
      errText,
    );
  }

  return _parseResponse(response);
}

async function _get(url, { timeoutMs = GET_TIMEOUT_MS, attempt = 1 } = {}) {
  const token      = await getAccessToken();
  const controller = new AbortController();
  const timerId    = setTimeout(() => controller.abort('timeout'), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method:  'GET',
      headers: {
        Authorization:         `Bearer ${token}`,
        'X-Goog-User-Project': config.projectId,
      },
      signal: controller.signal,
    });
  } catch (fetchErr) {
    clearTimeout(timerId);
    if (fetchErr.name === 'AbortError') {
      const e = new DiscoveryEngineError('Request timed out', 504);
      e.isTimeout = true;
      throw e;
    }
    if (attempt === 1) {
      log.warn({ url: _redactUrl(url), attempt, error: fetchErr.message },
        'Network error — retrying');
      await _sleep(RETRY_DELAY_MS);
      return _get(url, { timeoutMs, attempt: 2 });
    }
    throw new DiscoveryEngineError(fetchErr.message);
  }

  clearTimeout(timerId);

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    log.error({ url: _redactUrl(url), status: response.status, detail: errText.slice(0, 300) },
      `Discovery Engine HTTP ${response.status}`);

    if (response.status >= 500 && attempt === 1) {
      log.warn({ url: _redactUrl(url), status: response.status, attempt },
        'Server error — retrying');
      await _sleep(RETRY_DELAY_MS);
      return _get(url, { timeoutMs, attempt: 2 });
    }

    throw new DiscoveryEngineError(
      `Discovery Engine returned ${response.status}`,
      response.status,
      errText,
    );
  }

  return _parseResponse(response);
}

async function _parseResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    // Discovery Engine occasionally returns NDJSON — take the first object
    const firstLine = text.split('\n').find(l => l.trim().startsWith('{'));
    if (firstLine) {
      try { return JSON.parse(firstLine); } catch { /* fall through */ }
    }
    throw new DiscoveryEngineError('Unparseable response from Discovery Engine', 502, text.slice(0, 200));
  }
}

function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Strip project-specific path segments from URLs before logging to avoid
// leaking resource names into structured log fields at the wrong verbosity.
function _redactUrl(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname.split('/').slice(0, 6).join('/')}/…`;
  } catch {
    return '(url)';
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * POST :answer — grounded answer with citations.
 *
 * @param {string} queryText
 * @param {string|null} sessionId  short session ID (not full resource path)
 * @param {{ maxResults?: number, filter?: string, modelVersion?: string }} opts
 */
async function answer(queryText, sessionId = null, {
  maxResults    = 10,
  filter        = null,
  modelVersion  = 'stable',
} = {}) {
  const body = {
    query: { text: queryText },
    session: sessionId ? config.sessionPath(sessionId) : undefined,
    answerGenerationSpec: {
      modelSpec:  { modelVersion },
      promptSpec: { preamble: config.promptPreamble },
      includeCitations: true,
    },
    groundingSpec: { includeGroundingSupports: true },
    relatedQuestionsSpec: { enable: true },
    searchSpec: {
      searchParams: {
        searchResultMode: 'CHUNKS',
        maxReturnResults: Math.min(maxResults, 20),
        chunkSpec: {
          numPreviousChunks: config.chunkContextPrev,
          numNextChunks:     config.chunkContextNext,
        },
        ...(filter ? { filter } : {}),
      },
    },
  };

  return _post(config.answerEndpoint, body);
}

/**
 * POST :search — pure document/chunk retrieval, no answer generation.
 *
 * @param {string} queryText
 * @param {{ maxResults?: number, filter?: string, searchMode?: 'CHUNKS'|'DOCUMENTS' }} opts
 */
async function search(queryText, {
  maxResults = 10,
  filter     = null,
  searchMode = 'CHUNKS',
} = {}) {
  const isChunks = searchMode === 'CHUNKS';

  const body = {
    query:    queryText,
    pageSize: Math.max(1, Math.min(maxResults, 20)),
    queryExpansionSpec:  { condition: 'AUTO' },
    spellCorrectionSpec: { mode: 'AUTO' },
    contentSearchSpec: {
      searchResultMode: searchMode,
      ...(isChunks
        ? {
            chunkSpec: {
              numPreviousChunks: config.chunkContextPrev,
              numNextChunks:     config.chunkContextNext,
            },
          }
        : {
            extractiveContentSpec: { maxExtractiveAnswerCount: 1, maxExtractiveSegmentCount: 1 },
            snippetSpec: { returnSnippet: true },
          }
      ),
    },
    facetSpecs: isChunks ? [
      { facetKey: { key: 'institution' },    limit: 20 },
      { facetKey: { key: 'document_type' },  limit: 20 },
      { facetKey: { key: 'year' },           limit: 50 },
    ] : undefined,
    ...(filter ? { filter } : {}),
  };

  // Guard: ensure every facet limit is valid (1–300) regardless of how the
  // array was constructed. Catches any future regression before it hits the API.
  if (body.facetSpecs) {
    body.facetSpecs.forEach(s => { s.limit = Math.max(1, s.limit || 20); });
  }

  log.info({ facetSpecs: body.facetSpecs, pageSize: body.pageSize, searchMode },
    'search request params');

  return _post(config.searchEndpoint, body);
}

/**
 * GET document chunks from the datastore.
 * Requires DATA_STORE_ID to be configured.
 *
 * @param {string} documentId
 */
async function getDocumentChunks(documentId) {
  if (!config.dataStoreBase) {
    throw new DiscoveryEngineError(
      'DATA_STORE_ID is not configured — chunk lookup unavailable.',
      501,
    );
  }
  if (!documentId) throw new DiscoveryEngineError('documentId is required', 400);
  // Normalise: decode first (handles IDs that are already percent-encoded by Discovery Engine),
  // then re-encode cleanly to avoid double-encoding (%20 → %2520).
  let encodedId;
  try { encodedId = encodeURIComponent(decodeURIComponent(documentId)); }
  catch { encodedId = encodeURIComponent(documentId); }
  const url = `${config.dataStoreBase}/branches/0/documents/${encodedId}/chunks?pageSize=100`;
  return _get(url);
}

/**
 * GET paginated list of all documents from the datastore.
 * Requires DATA_STORE_ID to be configured.
 *
 * @param {string|null} pageToken   Cursor token from a previous response
 * @param {number}      pageSize    Max documents per page (1–100, default 25)
 */
async function listDocuments(pageToken = null, pageSize = 25) {
  if (!config.dataStoreBase) {
    throw new DiscoveryEngineError(
      'DATA_STORE_ID is not configured — document listing unavailable.',
      501,
    );
  }
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  if (pageToken) params.set('pageToken', pageToken);
  const url = `${config.dataStoreBase}/branches/0/documents?${params}`;
  return _get(url);
}

/**
 * In-memory URI→ID cache populated by paginating all documents.
 * The listDocuments API does not support a filter parameter, so we scan once
 * and cache the result for the lifetime of the process.
 */
const _uriIdCache        = new Map();
let   _uriCacheReady     = false;
let   _uriCachePending   = null; // in-flight promise (avoid concurrent scans)

async function _buildUriCache() {
  if (_uriCacheReady) return;
  if (_uriCachePending) return _uriCachePending;
  _uriCachePending = (async () => {
    // Improvement #2: try loading the pre-built cache from GCS first so a full
    // DE pagination scan is avoided after every server restart.
    if (config.gcsBucket) {
      try {
        const obj  = await gcs.getObject(URI_CACHE_PATH);
        const text = await obj.text();
        const data = JSON.parse(text);
        for (const [uri, id] of Object.entries(data)) _uriIdCache.set(uri, id);
        log.info({ entries: _uriIdCache.size }, 'URI→ID cache loaded from GCS');
        _uriCacheReady   = true;
        _uriCachePending = null;
        return;
      } catch (e) {
        if (e.statusCode !== 404) log.warn({ err: e.message }, 'GCS URI cache unreadable; rebuilding from DE');
      }
    }

    // Full pagination scan from Discovery Engine
    let pageToken = null;
    do {
      const params = new URLSearchParams({ pageSize: '100' });
      if (pageToken) params.set('pageToken', pageToken);
      const url  = `${config.dataStoreBase}/branches/0/documents?${params}`;
      const data = await _get(url);
      for (const doc of (data.documents || [])) {
        const docUri = doc.content?.uri;
        const parts  = (doc.name || '').split('/');
        const id     = parts[parts.length - 1] || null;
        if (docUri && id) _uriIdCache.set(docUri, id);
      }
      pageToken = data.nextPageToken || null;
    } while (pageToken);

    // Persist to GCS so subsequent restarts skip the full scan
    if (config.gcsBucket) {
      try {
        const buf = Buffer.from(JSON.stringify(Object.fromEntries(_uriIdCache)), 'utf-8');
        await gcs.uploadObject(URI_CACHE_PATH, 'application/json', buf);
        log.info({ entries: _uriIdCache.size }, 'URI→ID cache saved to GCS');
      } catch (e) {
        log.warn({ err: e.message }, 'Failed to persist URI→ID cache to GCS');
      }
    }

    _uriCacheReady   = true;
    _uriCachePending = null;
  })();
  return _uriCachePending;
}

/**
 * Look up a DE document ID by its GCS URI.
 * Scans all documents on first call; O(1) afterwards.
 *
 * @param {string} uri  Full GCS URI, e.g. "gs://my-bucket/path/to/file.pdf"
 */
async function getDocumentIdByUri(uri) {
  if (!config.dataStoreBase) {
    throw new DiscoveryEngineError(
      'DATA_STORE_ID is not configured — chunk lookup unavailable.',
      501,
    );
  }
  if (_uriIdCache.has(uri)) return _uriIdCache.get(uri);
  await _buildUriCache();
  return _uriIdCache.get(uri) ?? null;
}

/**
 * GET a single document (including structData) from the datastore by ID.
 * Requires DATA_STORE_ID to be configured.
 *
 * @param {string} documentId
 */
async function getDocument(documentId) {
  if (!config.dataStoreBase) {
    throw new DiscoveryEngineError(
      'DATA_STORE_ID is not configured — document lookup unavailable.',
      501,
    );
  }
  if (!documentId) throw new DiscoveryEngineError('documentId is required', 400);
  let encodedId;
  try { encodedId = encodeURIComponent(decodeURIComponent(documentId)); }
  catch { encodedId = encodeURIComponent(documentId); }
  const url = `${config.dataStoreBase}/branches/0/documents/${encodedId}`;
  return _get(url);
}

/**
 * Merge a delta object into a document's structData using a read-modify-PATCH
 * cycle. The content URI and other document fields are preserved.
 *
 * Returns null (no-op) when DATA_STORE_ID is not configured.
 *
 * @param {string} documentId
 * @param {object} delta   Partial structData to merge in (null values remove keys)
 */
async function updateStructData(documentId, delta) {
  if (!config.dataStoreBase) return null;
  if (!documentId) return null;

  let encodedId;
  try { encodedId = encodeURIComponent(decodeURIComponent(documentId)); }
  catch { encodedId = encodeURIComponent(documentId); }

  const url     = `${config.dataStoreBase}/branches/0/documents/${encodedId}`;
  const current = await _get(url);

  const merged = { ...(current.structData || {}), ...delta };
  const clean  = Object.fromEntries(
    Object.entries(merged).filter(([, v]) => v !== null && v !== undefined && v !== ''),
  );

  // PATCH with updateMask=structData preserves content.uri and other fields
  const token      = await getAccessToken();
  const controller = new AbortController();
  const timerId    = setTimeout(() => controller.abort('timeout'), GET_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${url}?updateMask=structData`, {
      method: 'PATCH',
      headers: {
        Authorization:         `Bearer ${token}`,
        'Content-Type':        'application/json',
        'X-Goog-User-Project': config.projectId,
      },
      body:   JSON.stringify({ structData: clean }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timerId);
    throw new DiscoveryEngineError(err.message);
  }
  clearTimeout(timerId);

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new DiscoveryEngineError(
      `DE structData PATCH ${response.status}`,
      response.status,
      errText,
    );
  }

  return _parseResponse(response);
}

module.exports = { answer, search, getDocument, updateStructData, getDocumentChunks, listDocuments, getDocumentIdByUri, DiscoveryEngineError };
