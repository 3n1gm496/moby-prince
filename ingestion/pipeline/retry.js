'use strict';

/**
 * Retry scheduler — finds FAILED jobs and re-runs the pipeline with
 * exponential backoff.
 *
 * Retry eligibility:
 *   - status === 'FAILED'
 *   - attempts < maxAttempts
 *
 * Non-retryable error codes (PDF_CRITICAL, PARSE_FAILURE, VALIDATION_FAILURE)
 * are quarantined immediately by the state machine — they never reach FAILED
 * and therefore never reach this scheduler.
 *
 * In production (Cloud Run Job), this runs as a scheduled job (Cloud Scheduler
 * → Cloud Run Job) or is triggered by Pub/Sub / Eventarc on a FAILED write to
 * Firestore.
 */

const { createLogger } = require('../workers/base');
const { runPipeline, buildDefaultWorkers } = require('./pipeline');

/**
 * Process all retryable jobs in the store.
 *
 * @param {object} store
 * @param {object} config
 * @param {object} [opts]
 * @param {object} [opts.logger]
 * @param {object} [opts.context]   shared pipeline context (storage, etc.)
 * @returns {Promise<{ retried: number, quarantined: number, succeeded: number }>}
 */
async function retryFailed(store, config, opts = {}) {
  const log = opts.logger || createLogger('retry');
  const workers = buildDefaultWorkers(config, log);

  const failed = await store.getByStatus('FAILED');
  log.info({ count: failed.length }, 'Retrying failed jobs');

  let retried = 0, quarantined = 0, succeeded = 0;

  for (const job of failed) {
    if (!job.isRetryable()) {
      // Max attempts exceeded — quarantine
      const q = job.fail(job.errorCode || 'MAX_RETRIES_EXCEEDED',
                         `Exceeded ${job.maxAttempts} attempts`, { forceQuarantine: true });
      await store.save(q);
      quarantined++;
      log.warn({ jobId: job.jobId, attempts: job.attempts }, 'Quarantined: max retries exceeded');
      continue;
    }

    // Exponential backoff before retrying
    const delayMs = _backoff(job.attempts, config.retry.initialDelayMs, config.retry.maxDelayMs);
    log.info({ jobId: job.jobId, attempt: job.attempts + 1, delayMs }, 'Scheduling retry');
    await _sleep(delayMs);

    const rescheduled = job.reschedule();
    await store.save(rescheduled);
    retried++;

    try {
      const { job: result } = await runPipeline(rescheduled, store, workers, opts);
      if (result.status === 'INDEXED') succeeded++;
    } catch (err) {
      log.error({ jobId: job.jobId, error: err.message }, 'Retry threw unexpectedly');
    }
  }

  log.info({ retried, quarantined, succeeded }, 'Retry run complete');
  return { retried, quarantined, succeeded };
}

function _backoff(attempt, initialMs, maxMs) {
  return Math.min(initialMs * Math.pow(2, attempt), maxMs);
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { retryFailed };
