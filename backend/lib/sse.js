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

module.exports = { sseHeaders, makeSender };
