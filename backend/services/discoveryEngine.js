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
    relatedQuestionsSpec: { enable: true },
    searchSpec: {
      searchParams: {
        searchResultMode: 'CHUNKS',
        maxReturnResults: Math.min(maxResults, 20),
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
    pageSize: Math.min(maxResults, 20),
    queryExpansionSpec:  { condition: 'AUTO' },
    spellCorrectionSpec: { mode: 'AUTO' },
    contentSearchSpec: {
      searchResultMode: searchMode,
      ...(isChunks
        ? { chunkSpec: { numPreviousChunks: 0, numNextChunks: 0 } }
        : {
            extractiveContentSpec: { maxExtractiveAnswerCount: 1, maxExtractiveSegmentCount: 1 },
            snippetSpec: { returnSnippet: true },
          }
      ),
    },
    ...(filter ? { filter } : {}),
  };

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
  const url = `${config.dataStoreBase}/branches/0/documents/${encodeURIComponent(documentId)}/chunks`;
  return _get(url);
}

module.exports = { answer, search, getDocumentChunks, DiscoveryEngineError };
