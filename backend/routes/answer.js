'use strict';

/**
 * POST /api/answer
 *
 * Grounded answer generation via Discovery Engine :answer API.
 * Response is streamed as Server-Sent Events so the frontend can show
 * a "thinking" indicator while Discovery Engine processes the query.
 *
 * SSE event sequence:
 *   event: thinking   data: { stage: "searching" }
 *   event: answer     data: <normalizeAnswer result>
 *   -- or on error --
 *   event: error      data: { message: "<italian user-facing message>" }
 *
 * Request body:
 *   query       string   required  max 2000 chars
 *   sessionId   string   optional  short session ID for multi-turn continuity
 *   maxResults  number   optional  1–20, default 10
 *   filters     object   optional  structured metadata filters
 */

const { Router } = require('express');
const de          = require('../services/discoveryEngine');
const { DiscoveryEngineError } = require('../services/discoveryEngine');
const { normalizeAnswer } = require('../transformers/answer');
const { validateQuery, validateSessionId } = require('../middleware/validate');
const { validateFilters }       = require('../middleware/validateFilters');
const { buildFilterExpression } = require('../filters/schema');
const { clamp } = require('../lib/utils');
const { sseHeaders, makeSender, makeHeartbeat } = require('../lib/sse');
const { createLogger } = require('../logger');
const contradictionsRepo        = require('../repos/contradictions');
const { isBigQueryEnabled }     = require('../services/bigquery');

const log    = createLogger('answer-route');
const router = Router();

router.post('/', [validateQuery, validateSessionId, validateFilters], async (req, res) => {
  const { query, sessionId, maxResults, filters } = req.body;
  const requestId = req.requestId;

  sseHeaders(res);
  const sendEvent = makeSender(res);
  const heartbeat = makeHeartbeat(res);

  try {
    // Notify the client that Discovery Engine is being called
    sendEvent('thinking', { stage: 'searching' });

    const raw = await de.answer(query, sessionId || null, {
      maxResults: clamp(maxResults, 1, 20, 20),
      filter:     buildFilterExpression(filters),
    });

    const normalized = normalizeAnswer(raw, filters || null);
    sendEvent('answer', normalized);

    // Best-effort: surface contradictions for documents cited in this answer.
    // Capped at 2s so a BQ cold-start never delays stream closure significantly.
    if (isBigQueryEnabled()) {
      try {
        const sourceUris = _extractSourceUris(raw);
        if (sourceUris.length > 0) {
          const bqTimeout    = new Promise((_, rej) => setTimeout(() => rej(new Error('bq-timeout')), 2_000));
          const contradictions = await Promise.race([
            contradictionsRepo.listBySourceUris(sourceUris, 3),
            bqTimeout,
          ]);
          if (contradictions.length > 0) {
            sendEvent('contradictions', { contradictions, total: contradictions.length });
          }
        }
      } catch (_) { /* BQ optional — silently skip on error or timeout */ }
    }

    heartbeat.stop();
    res.end();
  } catch (err) {
    // Headers already sent — handle errors inline rather than via errorHandler middleware
    log.warn({ requestId, err: err.message }, 'Answer route error (SSE)');

    let message = 'Errore interno del server.';
    if (err instanceof DiscoveryEngineError) {
      if (err.isTimeout) {
        message = 'Il servizio di ricerca non ha risposto in tempo. Riprova tra qualche secondo.';
      } else if (err.statusCode === 400) {
        message = 'Parametri di ricerca non validi.';
      } else if (err.statusCode === 403) {
        message = 'Autorizzazione al servizio di ricerca negata.';
      } else if (err.statusCode === 501) {
        message = err.message;
      } else {
        message = 'Il servizio di ricerca ha restituito un errore.';
      }
    }
    sendEvent('error', { message });
    heartbeat.stop();
    res.end();
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract GCS source URIs from the raw Discovery Engine answer response.
 * The response may carry URIs in searchResults or the answer's references.
 */
function _extractSourceUris(raw) {
  const uris = new Set();

  // Modern :answer response shape
  for (const ref of (raw?.answer?.references || [])) {
    const uri = ref?.chunkInfo?.documentMetadata?.uri || ref?.documentMetadata?.uri;
    if (uri?.startsWith('gs://')) uris.add(uri);
  }

  // :search response shape (when answer embeds search results)
  for (const result of (raw?.searchResults || [])) {
    const uri = result?.unstructuredDocumentInfo?.uri ||
                result?.document?.derivedStructData?.link;
    if (uri?.startsWith('gs://')) uris.add(uri);
  }

  return [...uris].slice(0, 10);
}

module.exports = router;
