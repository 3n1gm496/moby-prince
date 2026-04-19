'use strict';

/**
 * Job state stores.
 *
 * Interface contract — any store must implement:
 *   get(jobId)              → IngestionJob | null
 *   save(job)               → IngestionJob
 *   list(filter?)           → IngestionJob[]
 *   getByStatus(status)     → IngestionJob[]
 *   getBySourceUri(uri)     → IngestionJob | null
 *   delete(jobId)           → void
 *
 * Provided implementations:
 *   InMemoryStore  — ephemeral; useful for single-command CLI runs
 *   FileStore      — persists to a JSON file; default for local dev
 *
 * Planned (not yet implemented):
 *   FirestoreStore — production state in Cloud Firestore
 *   BigQueryStore  — append-only audit log in BigQuery
 *
 * FirestoreStore skeleton is documented at the bottom of this file.
 */

const fs   = require('fs');
const path = require('path');
const { IngestionJob } = require('./job');

// ── InMemoryStore ─────────────────────────────────────────────────────────────

class InMemoryStore {
  constructor() {
    this._jobs = new Map();
  }

  async get(jobId) {
    const data = this._jobs.get(jobId);
    return data ? new IngestionJob(data) : null;
  }

  async save(job) {
    this._jobs.set(job.jobId, job.toJSON());
    return job;
  }

  async list(filter = null) {
    const all = [...this._jobs.values()].map(d => new IngestionJob(d));
    return filter ? all.filter(filter) : all;
  }

  async getByStatus(status) {
    return this.list(j => j.status === status);
  }

  async getBySourceUri(uri) {
    const all = await this.list();
    return all.find(j => j.sourceUri === uri) || null;
  }

  async delete(jobId) {
    this._jobs.delete(jobId);
  }
}

// ── FileStore ─────────────────────────────────────────────────────────────────

class FileStore {
  /**
   * @param {string} stateDir  Directory for state files (created if absent)
   */
  constructor(stateDir) {
    this._dir = stateDir;
    fs.mkdirSync(stateDir, { recursive: true });
  }

  _filePath(jobId) {
    return path.join(this._dir, `${jobId}.json`);
  }

  async get(jobId) {
    const fp = this._filePath(jobId);
    if (!fs.existsSync(fp)) return null;
    try {
      return new IngestionJob(JSON.parse(fs.readFileSync(fp, 'utf8')));
    } catch {
      return null;
    }
  }

  async save(job) {
    fs.writeFileSync(this._filePath(job.jobId), JSON.stringify(job.toJSON(), null, 2));
    return job;
  }

  async list(filter = null) {
    if (!fs.existsSync(this._dir)) return [];
    const files = fs.readdirSync(this._dir).filter(f => f.endsWith('.json'));
    const jobs  = files.map(f => {
      try {
        return new IngestionJob(JSON.parse(fs.readFileSync(path.join(this._dir, f), 'utf8')));
      } catch { return null; }
    }).filter(Boolean);
    return filter ? jobs.filter(filter) : jobs;
  }

  async getByStatus(status) {
    return this.list(j => j.status === status);
  }

  async getBySourceUri(uri) {
    const all = await this.list();
    return all.find(j => j.sourceUri === uri) || null;
  }

  async delete(jobId) {
    const fp = this._filePath(jobId);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }

  /** Stats summary — useful for CLI status command */
  async summary() {
    const jobs = await this.list();
    const counts = {};
    for (const j of jobs) counts[j.status] = (counts[j.status] || 0) + 1;
    return { total: jobs.length, byStatus: counts };
  }
}

// ── FirestoreStore ────────────────────────────────────────────────────────────

class FirestoreStore {
  constructor(db, collectionPath = 'ingestion_jobs') {
    this._col = db.collection(collectionPath);
  }

  async get(jobId) {
    const doc = await this._col.doc(jobId).get();
    return doc.exists ? new IngestionJob(doc.data()) : null;
  }

  async save(job) {
    await this._col.doc(job.jobId).set(job.toJSON());
    return job;
  }

  async getByStatus(status) {
    const snap = await this._col.where('status', '==', status).get();
    return snap.docs.map(d => new IngestionJob(d.data()));
  }

  async list(filter = null) {
    const snap = await this._col.get();
    const jobs = snap.docs.map(d => new IngestionJob(d.data()));
    return filter ? jobs.filter(filter) : jobs;
  }

  async getBySourceUri(uri) {
    const snap = await this._col.where('sourceUri', '==', uri).limit(1).get();
    return snap.empty ? null : new IngestionJob(snap.docs[0].data());
  }

  async delete(jobId) {
    await this._col.doc(jobId).delete();
  }

  async summary() {
    const jobs = await this.list();
    const counts = {};
    for (const j of jobs) counts[j.status] = (counts[j.status] || 0) + 1;
    return { total: jobs.length, byStatus: counts };
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create the appropriate store for the current environment.
 *
 * - opts.type === 'memory'    → InMemoryStore (ephemeral, for tests)
 * - opts.type === 'firestore' or STORE_TYPE=firestore → FirestoreStore
 * - default                  → FileStore (local dev)
 *
 * FirestoreStore requires @google-cloud/firestore to be installed and GCP
 * credentials available (ADC). Falls back to FileStore if unavailable.
 */
function createStore(opts = {}) {
  if (opts.type === 'memory') return new InMemoryStore();

  const useFirestore = opts.type === 'firestore' || process.env.STORE_TYPE === 'firestore';
  if (useFirestore) {
    try {
      const { Firestore } = require('@google-cloud/firestore');
      const projectId = opts.projectId || require('../config').projectId;
      const db = new Firestore({ projectId });
      return new FirestoreStore(db, opts.collection || 'ingestion_jobs');
    } catch (err) {
      process.stderr.write(
        `[store] FirestoreStore unavailable (${err.message}); falling back to FileStore\n`
      );
    }
  }

  const stateDir = opts.stateDir || require('../config').localDirs.state;
  return new FileStore(stateDir);
}

module.exports = { InMemoryStore, FileStore, FirestoreStore, createStore };
