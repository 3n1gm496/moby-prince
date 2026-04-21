'use strict';

/**
 * Configure a global undici keepalive dispatcher so all outbound `fetch`
 * calls (to Firestore, BigQuery, Vertex AI) reuse TCP connections instead
 * of opening a new one per request.  Reduces ~30 ms of TCP+TLS handshake
 * latency on every GCP API call.
 *
 * Call once at server startup before any fetch calls are made.
 */

const { createLogger } = require('../logger');

const log = createLogger('http-agent');

module.exports = function setupHttpAgent() {
  let Agent, setGlobalDispatcher;
  try {
    ({ Agent, setGlobalDispatcher } = require('undici'));
  } catch {
    log.warn({}, 'undici not available — HTTP keepalive not configured');
    return;
  }

  setGlobalDispatcher(new Agent({
    connections:            10,
    pipelining:             1,
    keepAliveTimeout:       30_000,
    keepAliveMaxTimeout:    60_000,
  }));

  log.debug({}, 'HTTP keepalive agent configured (undici, 10 connections)');
};
