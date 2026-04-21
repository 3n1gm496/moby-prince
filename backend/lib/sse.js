'use strict';

/**
 * SSE (Server-Sent Events) utilities shared by all streaming routes.
 *
 * Usage:
 *   const { sseHeaders, makeSender } = require('../lib/sse');
 *
 *   sseHeaders(res);                        // set headers + flushHeaders()
 *   const sendEvent = makeSender(res);      // returns (event, data) => void
 *   sendEvent('thinking', { stage: '…' });  // writes formatted SSE frame
 */

function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx proxy buffering
  res.flushHeaders();
}

function makeSender(res) {
  return function sendEvent(event, data) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (_) { /* connection already closed */ }
  };
}

/**
 * Start an SSE heartbeat: write a comment ping every `intervalMs` milliseconds
 * to prevent proxies and mobile networks from dropping idle connections.
 * Returns a `stop()` function — call it when the response ends.
 *
 * @param {import('http').ServerResponse} res
 * @param {number} intervalMs  Default 25 000 ms (25 s — safely under typical 30 s proxy timeouts)
 * @returns {{ stop: () => void }}
 */
function makeHeartbeat(res, intervalMs = 25_000) {
  const timer = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) { /* closed */ }
  }, intervalMs);
  return { stop: () => clearInterval(timer) };
}

module.exports = { sseHeaders, makeSender, makeHeartbeat };
