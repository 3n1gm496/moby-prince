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
      maxResults: clamp(maxResults, 1, 100, 20),
      filter:     buildFilterExpression(filters),
    });

    const normalized = normalizeAnswer(raw, filters || null);
    sendEvent('answer', normalized);

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

module.exports = router;
