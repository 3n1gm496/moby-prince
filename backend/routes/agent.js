'use strict';

/**
 * Investigation Agent API
 *
 * POST /api/agent/investigate
 *
 * Runs a multi-step ReAct agent (Gemini 2.0 Flash + function calling) over
 * the Moby Prince evidence layer and streams progress as Server-Sent Events.
 * Each investigation is persisted as a Firestore session so the user can
 * retrieve the reasoning trace after a page reload.
 *
 * Request body:
 *   query      string   required  max 2000 chars
 *   sessionId  string   optional  resume an existing session
 *
 * SSE event sequence:
 *   event: session     data: { sessionId }          ← first event, always
 *   event: thinking    data: { stage: "reasoning", step?: N }
 *   event: tool_call   data: { tool, args, step }
 *   event: tool_result data: { tool, args, result, step, durationMs, error? }
 *   event: answer      data: { text, steps: [...] }
 *   event: error       data: { message }
 */

const { Router } = require('express');
const { investigate } = require('../services/agentRunner');
const fs             = require('../services/firestore');
const { createLogger } = require('../logger');

const log    = createLogger('agent-route');
const router = Router();

const MAX_QUERY_LENGTH = 2000;
const COLLECTION       = 'sessions';

function _newId() {
  try { return require('crypto').randomUUID(); }
  catch { return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
}

router.post('/investigate', async (req, res) => {
  const { query, sessionId: resumeId } = req.body || {};

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

  // ── Create or resume Firestore session ─────────────────────────────────────
  const now       = new Date().toISOString();
  let sessionId   = resumeId || null;

  try {
    if (sessionId) {
      const existing = await fs.getDocument(COLLECTION, sessionId);
      if (!existing) sessionId = null; // session not found — create new
    }
    if (!sessionId) {
      sessionId = _newId();
      await fs.createDocument(COLLECTION, sessionId, {
        title:      query.trim().slice(0, 80),
        messages:   [],
        createdAt:  now,
        updatedAt:  now,
      });
    }
  } catch (err) {
    log.warn({ error: err.message }, 'Could not create/resume Firestore session — continuing without persistence');
    sessionId = null;
  }

  // Announce sessionId as the first SSE event so the frontend can link to it
  sendEvent('session', { sessionId });

  // ── Persist user query ──────────────────────────────────────────────────────
  if (sessionId) {
    const userMsg = { _mid: _newId(), role: 'user', text: query.trim(), ts: now };
    fs.appendToArray(COLLECTION, sessionId, 'messages', [userMsg]).catch(() => {});
  }

  // ── Wrap sendEvent to persist tool results and final answer ────────────────
  const sendEventAndPersist = (event, data) => {
    sendEvent(event, data);
    if (!sessionId) return;
    if (event === 'tool_result') {
      const msg = {
        _mid: _newId(),
        role: 'tool',
        text: `${data.tool}(${JSON.stringify(data.args || {}).slice(0, 100)}) → ${JSON.stringify(data.result || {}).slice(0, 400)}`,
        ts:   new Date().toISOString(),
        steps: [data],
      };
      fs.appendToArray(COLLECTION, sessionId, 'messages', [msg]).catch(() => {});
    } else if (event === 'answer') {
      const msg = {
        _mid:  _newId(),
        role:  'assistant',
        text:  data.text || '',
        ts:    new Date().toISOString(),
        steps: data.steps || [],
      };
      fs.appendToArray(COLLECTION, sessionId, 'messages', [msg]).catch(() => {});
    }
  };

  try {
    await investigate(query.trim(), sendEventAndPersist);
  } catch (err) {
    log.error({ error: err.message }, 'Agent investigate error (SSE)');
    sendEvent('error', { message: 'Errore interno dell\'agente. Riprova tra qualche secondo.' });
  }

  res.end();
});

module.exports = router;
