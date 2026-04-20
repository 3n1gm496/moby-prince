'use strict';

/**
 * IngestionJob — immutable-style state machine for a single document's
 * ingestion lifecycle.
 *
 * State diagram:
 *
 *   PENDING ──[validate]──► VALIDATING ──[pass]──► SPLITTING? ──[split or skip]──► INDEXING ──► INDEXED
 *               │                │                       │                              │
 *               │             [fail]                  [fail]                         [fail]
 *               │                │                       │                              │
 *               └────────────────┴───────────────────────┴────────────────► FAILED ──[retry]──► PENDING
 *                                                                               │
 *                                                            [maxAttempts exceeded]
 *                                                                               │
 *                                                                         QUARANTINED (terminal)
 *
 * All methods return a new IngestionJob instance (no mutation).
 *
 * Known error codes that map to specific handling:
 *   FILE_READ_ERROR        — unreadable PDF or corrupt file (Discovery Engine)
 *   OVERSIZED              — file exceeds Discovery Engine size limit
 *   CHUNK_LIMIT_EXCEEDED   — too many chunks generated (split required)
 *   PDF_LARGE              — PDF >10 MB (high failure risk, warn)
 *   PDF_CRITICAL           — PDF >50 MB (must use Document AI, quarantine)
 *   PARSE_FAILURE          — text extraction failed
 *   INDEX_FAILURE          — Discovery Engine import rejected
 *   SPLIT_FAILURE          — splitting produced zero or invalid parts
 *   VALIDATION_FAILURE     — file does not meet ingestion prerequisites
 */

const TERMINAL_STATES = new Set(['INDEXED', 'QUARANTINED']);

// Error codes that are always non-retryable (quarantine immediately)
const NON_RETRYABLE_CODES = new Set(['PDF_CRITICAL', 'PARSE_FAILURE', 'VALIDATION_FAILURE']);

class IngestionJob {
  constructor(data) {
    Object.assign(this, data);
    Object.freeze(this);
  }

  // ── State transition helpers ────────────────────────────────────────────────

  _next(overrides) {
    return new IngestionJob({ ...this, updatedAt: _now(), ...overrides });
  }

  // ── Lifecycle transitions ───────────────────────────────────────────────────

  startValidating() {
    return this._next({ status: 'VALIDATING' });
  }

  startSplitting() {
    return this._next({ status: 'SPLITTING' });
  }

  setDocaiOperation(operationName) {
    return this._next({ docaiOperationName: operationName });
  }

  completeSplit(normalizedUris) {
    return this._next({
      status:         'SPLITTING',
      isSplit:        true,
      splitParts:     normalizedUris,
    });
  }

  startIndexing(normalizedUri = null) {
    return this._next({
      status:        'INDEXING',
      normalizedUri: normalizedUri ?? this.normalizedUri,
    });
  }

  complete(documentId = null) {
    return this._next({
      status:      'INDEXED',
      documentId:  documentId ?? this.documentId,
      completedAt: _now(),
    });
  }

  /**
   * Mark a job as failed. If non-retryable or at max attempts, quarantine instead.
   *
   * @param {string} errorCode
   * @param {string} errorMessage
   * @param {object} [opts]
   * @param {boolean} [opts.forceQuarantine]
   */
  fail(errorCode, errorMessage, { forceQuarantine = false } = {}) {
    const shouldQuarantine =
      forceQuarantine ||
      NON_RETRYABLE_CODES.has(errorCode) ||
      this.attempts >= this.maxAttempts;

    return this._next({
      status:       shouldQuarantine ? 'QUARANTINED' : 'FAILED',
      errorCode,
      errorMessage,
      completedAt:  shouldQuarantine ? _now() : null,
    });
  }

  /**
   * Reschedule a FAILED job for retry. Increments attempt counter.
   */
  reschedule() {
    if (this.status !== 'FAILED') {
      throw new Error(`Cannot reschedule job in state ${this.status}; only FAILED jobs can be rescheduled`);
    }
    if (this.attempts >= this.maxAttempts) {
      throw new Error(`Cannot reschedule job ${this.jobId}: attempts (${this.attempts}) >= maxAttempts (${this.maxAttempts})`);
    }
    return this._next({
      status:          'PENDING',
      attempts:        this.attempts + 1,
      lastAttemptAt:   _now(),
      errorCode:       null,
      errorMessage:    null,
    });
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  isTerminal()    { return TERMINAL_STATES.has(this.status); }
  isRetryable()   { return this.status === 'FAILED' && this.attempts < this.maxAttempts; }
  needsSplit()    { return this.isSplit === false && this.fileSizeBytes > 0; }

  toJSON() {
    return { ...this };
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a new IngestionJob from a source file URI (GCS or local path).
 *
 * @param {string} sourceUri    gs://bucket/path/file.pdf  or  /local/path/file.pdf
 * @param {object} [meta]       optional: { fileSizeBytes, mimeType, originalFilename }
 * @param {number} [maxAttempts]
 */
function createJob(sourceUri, meta = {}, maxAttempts = 3) {
  const now = _now();
  return new IngestionJob({
    jobId:            _uuid(),
    sourceUri,
    normalizedUri:    null,
    documentId:       null,

    status:           'PENDING',
    errorCode:        null,
    errorMessage:     null,

    attempts:         0,
    maxAttempts,
    lastAttemptAt:    null,

    isSplit:           false,
    splitParts:        [],
    parentJobId:       meta.parentJobId || null,
    docaiOperationName: null,

    originalFilename: meta.originalFilename || _basename(sourceUri),
    mimeType:         meta.mimeType || _guessMime(sourceUri),
    fileSizeBytes:    meta.fileSizeBytes || null,
    chunkCount:       null,

    createdAt:  now,
    updatedAt:  now,
    completedAt: null,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _now() { return new Date().toISOString(); }

function _uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // Fallback for older Node
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function _basename(uri) {
  return uri.split('/').pop() || uri;
}

function _guessMime(uri) {
  const ext = uri.split('.').pop()?.toLowerCase();
  return { pdf: 'application/pdf', txt: 'text/plain', json: 'application/json' }[ext] || 'application/octet-stream';
}

module.exports = { IngestionJob, createJob, NON_RETRYABLE_CODES, TERMINAL_STATES };
