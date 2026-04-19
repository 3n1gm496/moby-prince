'use strict';

const crypto = require('crypto');

/**
 * Attach a correlation ID to every request.
 *
 * Cloud Run injects X-Cloud-Trace-Context on every inbound request when
 * the service is behind a Google load balancer or direct traffic with
 * tracing enabled. We extract the trace ID from that header and use it as
 * the request ID so logs from a single request are correlated in Cloud Trace.
 *
 * Header priority:
 *   1. X-Cloud-Trace-Context: TRACE_ID/SPAN_ID;o=TRACE_FLAG  (Cloud Run / GFE)
 *   2. X-Request-ID                                           (custom / upstream proxy)
 *   3. crypto.randomUUID()                                    (fallback)
 *
 * Sets:
 *   req.requestId   — short ID used in log entries
 *   req.traceId     — full 32-char hex trace ID (null if not available)
 *   X-Request-ID    — echo back on the response
 */
function requestId(req, res, next) {
  const cloudTrace = req.headers['x-cloud-trace-context'];
  let traceId = null;

  if (cloudTrace) {
    // Format: TRACE_ID/SPAN_ID;o=TRACE_FLAG
    const m = cloudTrace.match(/^([0-9a-f]{32})\//i);
    if (m) traceId = m[1].toLowerCase();
  }

  const id = req.headers['x-request-id'] || traceId || crypto.randomUUID().replace(/-/g, '');

  req.requestId = id;
  req.traceId   = traceId;

  res.set('X-Request-ID', id);
  next();
}

module.exports = requestId;
