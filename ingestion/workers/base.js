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

// ── Cloud Monitoring metric emitter ──────────────────────────────────────────

/**
 * Returns a metrics emitter backed by @google-cloud/monitoring when the
 * package is installed and projectId is set. Falls back to a no-op emitter
 * so the pipeline never crashes on missing credentials or packages.
 *
 * @param {string|null} projectId
 * @returns {{ record, recordJobFailed, recordJobQuarantined }}
 */
function createMetricsEmitter(projectId) {
  if (!projectId) return _noopEmitter();

  let client;
  try {
    const { MetricServiceClient } = require('@google-cloud/monitoring');
    client = new MetricServiceClient();
  } catch {
    return _noopEmitter();
  }

  const projectName = `projects/${projectId}`;

  async function record(metricType, value, labels = {}) {
    try {
      const seconds = Math.floor(Date.now() / 1000);
      await client.createTimeSeries({
        name: projectName,
        timeSeries: [{
          metric: {
            type: `custom.googleapis.com/ingestion/${metricType}`,
            labels: Object.fromEntries(
              Object.entries(labels).map(([k, v]) => [k, String(v)])
            ),
          },
          resource: { type: 'global', labels: { project_id: projectId } },
          points: [{
            interval: { endTime: { seconds } },
            value: { int64Value: String(value) },
          }],
        }],
      });
    } catch (err) {
      process.stderr.write(
        JSON.stringify({ severity: 'WARN', message: `Metric emit failed: ${err.message}` }) + '\n'
      );
    }
  }

  return {
    record,
    recordJobFailed:      (jobId, errorCode) => record('jobs_failed',      1, { job_id: jobId, error_code: errorCode || 'UNKNOWN' }),
    recordJobQuarantined: (jobId, errorCode) => record('quarantine_count', 1, { job_id: jobId, error_code: errorCode || 'UNKNOWN' }),
  };
}

function _noopEmitter() {
  const noop = async () => {};
  return { record: noop, recordJobFailed: noop, recordJobQuarantined: noop };
}

module.exports = { BaseWorker, createLogger, createMetricsEmitter };
