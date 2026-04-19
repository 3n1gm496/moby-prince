'use strict';

/**
 * BaseWorker — interface contract for all pipeline workers.
 *
 * Each worker receives an IngestionJob, performs one stage of processing,
 * and returns a WorkerResult containing the (possibly updated) job and any
 * side-effect metadata.
 *
 * Workers must NOT mutate the job directly — call job.startX() / job.fail()
 * methods to get a new instance and return it in the result.
 *
 * WorkerResult shape:
 * {
 *   job:      IngestionJob,   updated job after this stage
 *   halt:     boolean,        true = stop the pipeline after this worker
 *   outputs:  object,         worker-specific side-effect data for logging
 * }
 */

class BaseWorker {
  constructor(name, logger) {
    this.name   = name;
    this.logger = logger || _defaultLogger(name);
  }

  /**
   * Whether this worker should run given the current job state.
   * Override in subclasses to skip irrelevant stages.
   *
   * @param {IngestionJob} job
   * @returns {boolean}
   */
  // eslint-disable-next-line no-unused-vars
  shouldRun(job) { return true; }

  /**
   * Execute the worker's logic.
   * Must be overridden.
   *
   * @param {IngestionJob} job
   * @param {object} [context]  shared pipeline context (storage provider, config, etc.)
   * @returns {Promise<WorkerResult>}
   */
  // eslint-disable-next-line no-unused-vars
  async run(job, context) {
    throw new Error(`${this.name}.run() is not implemented`);
  }

  ok(job, outputs = {}) {
    return { job, halt: false, outputs };
  }

  halt(job, outputs = {}) {
    return { job, halt: true, outputs };
  }
}

// ── Logger ────────────────────────────────────────────────────────────────────

/**
 * Minimal structured logger.
 * In production, replace with pino or Cloud Logging client.
 * Format is newline-delimited JSON so Cloud Run log ingestion parses it natively.
 */
function createLogger(component) {
  const level = (process.env.LOG_LEVEL || 'info').toLowerCase();
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const current = levels[level] ?? 1;

  function write(severity, data, message) {
    if (levels[severity] < current) return;
    const entry = {
      severity: severity.toUpperCase(),
      component,
      message,
      timestamp: new Date().toISOString(),
      ...data,
    };
    // Cloud Logging parses JSON lines from stdout/stderr automatically
    const stream = severity === 'error' ? process.stderr : process.stdout;
    stream.write(JSON.stringify(entry) + '\n');
  }

  return {
    debug: (data, msg) => write('debug', data, msg ?? (typeof data === 'string' ? data : '')),
    info:  (data, msg) => write('info',  data, msg ?? (typeof data === 'string' ? data : '')),
    warn:  (data, msg) => write('warn',  data, msg ?? (typeof data === 'string' ? data : '')),
    error: (data, msg) => write('error', data, msg ?? (typeof data === 'string' ? data : '')),
  };
}

function _defaultLogger(name) {
  return createLogger(name);
}

module.exports = { BaseWorker, createLogger };
