'use strict';

/**
 * Structured logger — Cloud Logging compatible.
 *
 * Production (NODE_ENV=production or non-TTY stdout):
 *   Emits NDJSON to stdout/stderr. Cloud Run ingests these lines directly into
 *   Cloud Logging, parsing `severity`, `message`, `timestamp`, and any extra
 *   fields as structured log entries.
 *
 *   Cloud Trace propagation: if `traceId` is present in the log entry, it is
 *   mapped to `logging.googleapis.com/trace` automatically so logs appear
 *   under the correct trace in Cloud Trace.
 *
 * Development (TTY + not NODE_ENV=production):
 *   Emits human-readable coloured lines to stdout/stderr.
 *
 * Usage:
 *   const { logger } = require('./logger');
 *   logger.info({ userId: 'abc' }, 'Request received');
 *
 *   // Per-request child logger (attaches requestId to every entry):
 *   const reqLog = logger.child({ requestId: req.requestId });
 *   reqLog.warn({ statusCode: 429 }, 'Rate limit approaching');
 *
 * No external dependencies.
 */

const LEVELS   = { debug: 0, info: 1, warn: 2, error: 3 };
const SEVERITY = { debug: 'DEBUG', info: 'INFO', warn: 'WARNING', error: 'ERROR' };

// ANSI colours for TTY output only
const COLOR = { DEBUG: '\x1b[35m', INFO: '\x1b[36m', WARNING: '\x1b[33m', ERROR: '\x1b[31m' };
const RESET = '\x1b[0m';

const isProd   = process.env.NODE_ENV === 'production' || !process.stdout.isTTY;
const minLevel = LEVELS[(process.env.LOG_LEVEL || '').toLowerCase()] ?? LEVELS.info;

const projectId = process.env.GOOGLE_CLOUD_PROJECT || null;

/**
 * Create a logger bound to a component name and optional static fields.
 *
 * @param {string} component  Short label shown in every log line
 * @param {object} staticFields  Fields merged into every log entry
 */
function createLogger(component, staticFields = {}) {
  function write(level, fields, message) {
    if (LEVELS[level] < minLevel) return;

    const severity  = SEVERITY[level];
    const timestamp = new Date().toISOString();

    // Normalise arguments: write(level, 'message') or write(level, {fields}, 'message')
    const isFieldsObj = fields !== null && typeof fields === 'object';
    const msgText     = message ?? (isFieldsObj ? '' : String(fields ?? ''));
    const extra       = isFieldsObj ? fields : {};

    if (!isProd) {
      // ── Developer output ──────────────────────────────────────────────────
      const col  = COLOR[severity] ?? '';
      const comp = component ? `[${component}] ` : '';
      const kv   = Object.keys(extra).length ? '  ' + JSON.stringify(extra) : '';
      const out  = `${col}${severity.padEnd(7)}${RESET} ${timestamp} ${comp}${msgText}${kv}\n`;
      ;(level === 'error' ? process.stderr : process.stdout).write(out);
    } else {
      // ── Production NDJSON (Cloud Logging) ─────────────────────────────────
      const entry = {
        severity,
        message:   msgText || (Object.keys(extra).length ? JSON.stringify(extra) : ''),
        timestamp,
        ...staticFields,
        ...(component ? { component } : {}),
        ...extra,
      };

      // Cloud Trace integration: map traceId → logging.googleapis.com/trace
      if (extra.traceId && projectId) {
        entry['logging.googleapis.com/trace'] =
          `projects/${projectId}/traces/${extra.traceId}`;
      }

      ;(level === 'error' ? process.stderr : process.stdout)
        .write(JSON.stringify(entry) + '\n');
    }
  }

  return {
    debug: (f, m) => write('debug', f, m),
    info:  (f, m) => write('info',  f, m),
    warn:  (f, m) => write('warn',  f, m),
    error: (f, m) => write('error', f, m),

    /** Create a child logger that merges extra static fields into every entry. */
    child: (fields) => createLogger(component, { ...staticFields, ...fields }),
  };
}

const logger = createLogger('app');

module.exports = { createLogger, logger };
