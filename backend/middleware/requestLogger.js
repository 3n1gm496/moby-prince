'use strict';

const { createLogger } = require('../logger');

const log = createLogger('http');

/**
 * Log every HTTP request and its outcome.
 *
 * Skips GET /api/health to avoid polluting logs with health-check probe
 * traffic from Cloud Run, load balancers, and uptime monitors.
 *
 * Log fields:
 *   requestId   — correlation ID (from requestId middleware)
 *   method      — GET, POST, …
 *   path        — request path (no query string to avoid PII in logs)
 *   status      — HTTP response status code
 *   durationMs  — wall-clock request duration in milliseconds
 *   ip          — client IP (masked to /24 for privacy)
 */
function requestLogger(req, res, next) {
  if (req.method === 'GET' && req.path === '/api/health') return next();

  const start = Date.now();

  res.on('finish', () => {
    const ms     = Date.now() - start;
    const status = res.statusCode;
    const level  = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

    log[level](
      {
        requestId:  req.requestId,
        traceId:    req.traceId,
        method:     req.method,
        path:       req.path,
        status,
        durationMs: ms,
      },
      `${req.method} ${req.path} ${status} ${ms}ms`,
    );
  });

  next();
}

module.exports = requestLogger;
