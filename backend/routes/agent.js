'use strict';

/**
 * Investigation Agent API
 *
 * POST /api/agent/investigate
 *
 * Runs a multi-step ReAct agent (Gemini 2.0 Flash + function calling) over
 * the Moby Prince evidence layer and streams progress as Server-Sent Events.
 *
 * Request body:
 *   query   string   required  max 2000 chars
 *
 * SSE event sequence:
 *   event: thinking    data: { stage: "reasoning", step?: N }
 *   event: tool_call   data: { tool, args, step }
 *   event: tool_result data: { tool, args, result, step, durationMs, error? }
 *   event: answer      data: { text, steps: [...] }
 *   event: error       data: { message }
 */

const { Router } = require('express');
const { investigate } = require('../services/agentRunner');
const { createLogger } = require('../logger');

const log    = createLogger('agent-route');
const router = Router();

const MAX_QUERY_LENGTH = 2000;

router.post('/investigate', async (req, res) => {
  const { query } = req.body || {};

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: '"query" is required.' });
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return res.status(400).json({ error: `"query" must be ≤ ${MAX_QUERY_LENGTH} characters.` });
  }

  // ── Set up Server-Sent Events ───────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (event, data) => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (_) { /* connection closed */ }
  };

  try {
    await investigate(query.trim(), sendEvent);
  } catch (err) {
    log.error({ error: err.message }, 'Agent investigate error (SSE)');
    sendEvent('error', { message: 'Errore interno dell\'agente. Riprova tra qualche secondo.' });
  }

  res.end();
});

module.exports = router;
