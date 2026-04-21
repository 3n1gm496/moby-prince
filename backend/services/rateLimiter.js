'use strict';

/**
 * In-memory daily budget circuit breaker for Gemini and BigQuery calls.
 *
 * Counters reset at midnight UTC.  Limits can be tuned via env vars:
 *   DAILY_GEMINI_LIMIT  (default: 500)
 *   DAILY_BQ_LIMIT      (default: 2000)
 *
 * Throws when a limit is exceeded so callers surface a clear error
 * rather than silently racking up cloud charges.
 */

const { createLogger } = require('../logger');

const log = createLogger('rate-limiter');

const DAILY_GEMINI_LIMIT = parseInt(process.env.DAILY_GEMINI_LIMIT || '500',  10);
const DAILY_BQ_LIMIT     = parseInt(process.env.DAILY_BQ_LIMIT     || '2000', 10);

function _nextMidnightUtc() {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime();
}

const _state = {
  gemini:  0,
  bq:      0,
  resetAt: _nextMidnightUtc(),
};

function _maybeReset() {
  if (Date.now() >= _state.resetAt) {
    log.info({ prevGemini: _state.gemini, prevBq: _state.bq }, 'Daily budget counters reset');
    _state.gemini  = 0;
    _state.bq      = 0;
    _state.resetAt = _nextMidnightUtc();
  }
}

function incrementGemini() {
  _maybeReset();
  _state.gemini += 1;
  if (_state.gemini > DAILY_GEMINI_LIMIT) {
    log.error({ count: _state.gemini, limit: DAILY_GEMINI_LIMIT }, 'Daily Gemini budget exceeded');
    throw new Error(`Daily Gemini call limit (${DAILY_GEMINI_LIMIT}) exceeded — riprova domani.`);
  }
}

function incrementBq() {
  _maybeReset();
  _state.bq += 1;
  if (_state.bq > DAILY_BQ_LIMIT) {
    log.error({ count: _state.bq, limit: DAILY_BQ_LIMIT }, 'Daily BigQuery budget exceeded');
    throw new Error(`Daily BigQuery call limit (${DAILY_BQ_LIMIT}) exceeded — riprova domani.`);
  }
}

function getCounters() {
  _maybeReset();
  return {
    gemini:  { count: _state.gemini, limit: DAILY_GEMINI_LIMIT },
    bq:      { count: _state.bq,     limit: DAILY_BQ_LIMIT     },
    resetAt: new Date(_state.resetAt).toISOString(),
  };
}

module.exports = { incrementGemini, incrementBq, getCounters };
