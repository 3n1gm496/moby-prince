'use strict';

/**
 * Auto-ingest service.
 *
 * Spawns the ingestion pipeline as a child process for a single GCS document.
 * Tracks job progress in memory (cleared on server restart).
 *
 * Used by storage.js when AUTO_INGEST=true is set in the environment.
 */

const { spawn }        = require('child_process');
const path             = require('path');
const { createLogger } = require('../logger');

const log = createLogger('ingest-svc');

const ENTRYPOINT = path.resolve(__dirname, '../../ingestion/cloudrun/entrypoint.js');

// In-memory registry — survives as long as the server process is running.
const _jobs = new Map();

/**
 * Start ingestion for a GCS URI in a background child process.
 * Returns a jobId immediately; use getStatus() to poll progress.
 *
 * @param {string} gcsUri  e.g. gs://my-bucket/path/file.pdf
 * @returns {string}       jobId (UUID)
 */
function triggerIngest(gcsUri) {
  const jobId = crypto.randomUUID();

  _jobs.set(jobId, {
    jobId,
    gcsUri,
    status:      'running',
    createdAt:   new Date().toISOString(),
    completedAt: null,
    exitCode:    null,
  });

  const child = spawn(process.execPath, [ENTRYPOINT, 'ingest', gcsUri], {
    // STORE_TYPE=memory: the ingestion pipeline tracks its own per-job state
    // in-process; we track aggregate success/failure via the exit code only.
    env:      { ...process.env, STORE_TYPE: 'memory' },
    stdio:    'pipe',
    detached: false,
  });

  log.info({ jobId, gcsUri, pid: child.pid }, 'Ingestion child process started');

  child.stdout?.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      log.debug({ jobId, line }, 'ingest stdout');
    }
  });

  child.stderr?.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      log.warn({ jobId, line }, 'ingest stderr');
    }
  });

  child.on('exit', (code) => {
    const job = _jobs.get(jobId);
    if (!job) return;
    _jobs.set(jobId, {
      ...job,
      status:      code === 0 ? 'indexed' : 'failed',
      exitCode:    code,
      completedAt: new Date().toISOString(),
    });
    log.info({ jobId, gcsUri, exitCode: code }, 'Ingestion child process exited');
  });

  child.on('error', (err) => {
    const job = _jobs.get(jobId);
    if (!job) return;
    _jobs.set(jobId, {
      ...job,
      status:      'failed',
      completedAt: new Date().toISOString(),
      exitCode:    -1,
    });
    log.error({ jobId, error: err.message }, 'Ingestion child process error');
  });

  return jobId;
}

/**
 * @param {string} jobId
 * @returns {{ jobId, gcsUri, status, createdAt, completedAt, exitCode } | null}
 */
function getStatus(jobId) {
  return _jobs.get(jobId) ?? null;
}

module.exports = { triggerIngest, getStatus };
