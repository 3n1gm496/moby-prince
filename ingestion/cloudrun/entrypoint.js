#!/usr/bin/env node
'use strict';

/**
 * Cloud Run Job entrypoint.
 *
 * Commands (set via CMD or CLOUD_RUN_TASK_ARGS):
 *   retry              Retry all FAILED jobs (default)
 *   ingest <gs://uri>  Ingest a single document
 *   scan   [prefix]    Scan a GCS prefix for new files
 *
 * Environment variables:
 *   GOOGLE_CLOUD_PROJECT   GCP project ID (required)
 *   DATA_STORE_ID          Vertex AI Search datastore ID (required for indexing)
 *   STORE_TYPE             'firestore' (default) | 'file' | 'memory'
 *   DOCAI_PROCESSOR_ID     Document AI processor ID (required for large PDFs)
 *   DOCAI_LOCATION         Document AI location (default: eu)
 *   GCP_LOCATION           Discovery Engine location (default: eu)
 *   LOG_LEVEL              debug | info | warn (default: info)
 */

const path = require('path');

const config  = require('../config');
const { parseGcsUri } = require('../lib/gcs');
const { createStore }               = require('../state/store');
const { createLogger, createMetricsEmitter } = require('../workers/base');
const { createJob }                 = require('../state/job');
const { runPipeline, buildDefaultWorkers } = require('../pipeline/pipeline');
const { buildWorkersWithDocumentAI } = require('./workers');
const { retryFailed }               = require('../pipeline/retry');

const log     = createLogger('entrypoint');
const metrics = createMetricsEmitter(config.projectId);

const SCAN_CONCURRENCY = 5;

async function main() {
  const [,, cmd, ...args] = process.argv;

  // ── Initialise GCS Storage ────────────────────────────────────────────────
  let storage = null;
  try {
    const { Storage } = require('@google-cloud/storage');
    storage = new Storage({ projectId: config.projectId });
    log.info({}, 'GCS Storage client initialised');
  } catch (err) {
    log.warn({ error: err.message }, '@google-cloud/storage not available — local fs only');
  }

  // ── Initialise Document AI client ─────────────────────────────────────────
  let documentai = null;
  if (process.env.DOCAI_PROCESSOR_ID) {
    try {
      const { DocumentProcessorServiceClient } = require('@google-cloud/documentai').v1;
      documentai = new DocumentProcessorServiceClient({
        apiEndpoint: `${process.env.DOCAI_LOCATION || 'eu'}-documentai.googleapis.com`,
      });
      log.info({}, 'Document AI client initialised');
    } catch (err) {
      log.warn({ error: err.message }, '@google-cloud/documentai not available — large PDFs will be quarantined');
    }
  } else {
    log.warn(
      {},
      'DOCAI_PROCESSOR_ID is not set — PDFs larger than 50 MB will be quarantined instead of processed. ' +
      'Set DOCAI_PROCESSOR_ID to enable the Document AI pipeline for large files.',
    );
  }

  // ── Initialise state store ────────────────────────────────────────────────
  const storeType = process.env.STORE_TYPE || 'firestore';
  const store = createStore({ type: storeType, projectId: config.projectId });
  log.info({ storeType }, 'Store initialised');

  // Checkpoint: mid-pipeline state save so workers can persist LRO names
  // before long async operations (e.g. Document AI batch processing).
  async function checkpoint(updatedJob) {
    await store.save(updatedJob);
    log.debug({ jobId: updatedJob.jobId, status: updatedJob.status }, 'Job checkpointed');
  }

  const context = { storage, documentai, metrics, checkpoint };
  const opts    = { logger: log, context };

  switch (cmd) {
    case 'ingest': return cmdIngest(args[0], store, opts);
    case 'scan':   return cmdScan(args[0], store, opts);
    default:       return cmdRetry(store, opts);
  }
}

async function cmdRetry(store, opts) {
  log.info({}, 'Starting retry run');
  const result = await retryFailed(store, config, opts);
  log.info(result, 'Retry run complete');
}

async function cmdIngest(uri, store, opts) {
  if (!uri) {
    log.error({}, 'Usage: ingest <gs://uri or local path>');
    process.exit(1);
  }

  const { fileSizeBytes, mimeType } = await _statUri(uri, opts.context.storage);
  const job = createJob(uri, {
    originalFilename: path.basename(uri),
    fileSizeBytes,
    mimeType,
  }, config.retry.maxAttempts);

  await store.save(job);
  log.info({ jobId: job.jobId, uri, fileSizeBytes, mimeType }, 'Job created');

  const workers  = buildWorkersWithDocumentAI(config, opts.logger);
  const { job: result } = await runPipeline(job, store, workers, opts);
  log.info({ jobId: job.jobId, finalStatus: result.status }, 'Pipeline complete');
}

async function cmdScan(prefix, store, opts) {
  const storage = opts.context.storage;
  const scanPrefix = prefix || (config.buckets.raw ? `gs://${config.buckets.raw}/moby-prince/` : null);

  if (!scanPrefix || !scanPrefix.startsWith('gs://') || !storage) {
    log.warn({ scanPrefix }, 'GCS scan requires a gs:// prefix and Storage client; nothing to do');
    return;
  }

  const { bucket, name } = parseGcsUri(scanPrefix);
  const [files] = await storage.bucket(bucket).getFiles({ prefix: name });
  const candidates = files.filter(f => !f.name.endsWith('/'));
  log.info({ count: candidates.length, scanPrefix }, 'GCS scan: files found');

  let enqueued = 0;
  await _withBoundedConcurrency(candidates, SCAN_CONCURRENCY, async (file) => {
    const uri = `gs://${bucket}/${file.name}`;
    const existing = await store.getBySourceUri(uri);
    if (existing) {
      log.debug({ uri, status: existing.status }, 'Already tracked; skipping');
      return;
    }
    log.info({ uri }, 'New file — ingesting');
    await cmdIngest(uri, store, opts);
    enqueued++;
  });

  log.info({ enqueued }, 'GCS scan complete');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Run fn(item) for every item, keeping at most `limit` Promises in flight.
async function _withBoundedConcurrency(items, limit, fn) {
  const running = new Set();
  for (const item of items) {
    const p = fn(item).finally(() => running.delete(p));
    running.add(p);
    if (running.size >= limit) await Promise.race(running);
  }
  await Promise.all(running);
}

async function _statUri(uri, storage) {
  if (!uri.startsWith('gs://')) {
    const fs   = require('fs');
    const stat = fs.statSync(uri);
    return { fileSizeBytes: stat.size, mimeType: _guessMime(uri) };
  }
  if (!storage) return { fileSizeBytes: null, mimeType: null };
  const { bucket, name } = parseGcsUri(uri);
  const [meta] = await storage.bucket(bucket).file(name).getMetadata();
  return {
    fileSizeBytes: meta.size ? parseInt(meta.size, 10) : null,
    mimeType:      meta.contentType || null,
  };
}

function _guessMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = { '.pdf': 'application/pdf', '.txt': 'text/plain', '.html': 'text/html', '.htm': 'text/html' };
  return map[ext] || 'application/octet-stream';
}

main().catch(err => {
  process.stderr.write(
    JSON.stringify({ severity: 'ERROR', message: err.message, stack: err.stack }) + '\n'
  );
  process.exit(1);
});
