'use strict';

/**
 * Ingestion pipeline — orchestrates the worker chain for a single IngestionJob.
 *
 * Default worker chain: ValidatorWorker → SplitterWorker → IndexerWorker
 *
 * Each worker returns a WorkerResult { job, halt, outputs }.
 * If halt === true the pipeline stops immediately (typically after a failure).
 * Child jobs produced by the splitter (one per split part) are enqueued
 * recursively on the same pipeline.
 *
 * Usage (local):
 *   const { runPipeline, buildDefaultWorkers } = require('./pipeline');
 *   const workers = buildDefaultWorkers(config, logger);
 *   const result  = await runPipeline(job, store, workers, { logger });
 */

const { ValidatorWorker } = require('../workers/validator');
const { SplitterWorker }  = require('../workers/splitter');
const { IndexerWorker }   = require('../workers/indexer');
const { createLogger }    = require('../workers/base');

/**
 * Run the pipeline for a single job.
 *
 * @param {IngestionJob} job
 * @param {object} store         FileStore or InMemoryStore
 * @param {object[]} workers     ordered array of BaseWorker instances
 * @param {object} [opts]
 * @param {object} [opts.context]  shared context (storage provider, etc.)
 * @param {object} [opts.logger]
 * @returns {Promise<{ job: IngestionJob, childJobs: IngestionJob[] }>}
 */
async function runPipeline(job, store, workers, opts = {}) {
  const log      = opts.logger || createLogger('pipeline');
  const context  = opts.context || {};
  const allChildJobs = [];

  log.info({ jobId: job.jobId, status: job.status }, 'Pipeline start');

  let current = job;

  for (const worker of workers) {
    if (!worker.shouldRun(current)) {
      log.debug({ jobId: job.jobId, worker: worker.name }, 'Worker skipped');
      continue;
    }

    let result;
    try {
      result = await worker.run(current, context);
    } catch (err) {
      // Unhandled worker error — fail the job
      log.error({ jobId: job.jobId, worker: worker.name, error: err.message }, 'Worker threw');
      current = current.fail('INTERNAL_ERROR', err.message);
      await store.save(current);
      return { job: current, childJobs: allChildJobs };
    }

    current = result.job;
    await store.save(current);

    log.info(
      { jobId: job.jobId, worker: worker.name, status: current.status, halt: result.halt },
      'Worker complete'
    );

    // Collect child jobs from splitter and enqueue them
    if (result.outputs?.childJobs?.length) {
      for (const child of result.outputs.childJobs) {
        await store.save(child);
        allChildJobs.push(child);
        log.info({ childJobId: child.jobId, parentJobId: job.jobId }, 'Child job enqueued');
      }

      // Run pipeline on each child part
      for (const child of result.outputs.childJobs) {
        const childResult = await runPipeline(child, store, workers, opts);
        allChildJobs.push(...childResult.childJobs);
      }
    }

    if (result.halt) break;
  }

  log.info({ jobId: job.jobId, finalStatus: current.status }, 'Pipeline complete');
  return { job: current, childJobs: allChildJobs };
}

/**
 * Build the default worker chain for the given config.
 *
 * @param {object} config   from ../config.js
 * @param {object} [logger]
 */
function buildDefaultWorkers(config, logger) {
  return [
    new ValidatorWorker(config, logger),
    new SplitterWorker(config, logger),
    new IndexerWorker(config, logger),
  ];
}

module.exports = { runPipeline, buildDefaultWorkers };
