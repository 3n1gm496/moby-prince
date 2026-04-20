'use strict';

/**
 * Ingestion pipeline configuration.
 *
 * All values are environment-driven so the same code runs locally (with a
 * local FileStore + local filesystem), in a staging Cloud Run Job (with GCS +
 * Firestore), and in production without code changes.
 *
 * GCS is optional locally: when bucket env vars are absent the pipeline uses
 * the local filesystem and logs a warning.
 */

function optional(name, fallback = null) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

function required(name) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing required env var: ${name}`);
  return v.trim();
}

// ── GCS bucket names ──────────────────────────────────────────────────────────

const project = optional('GOOGLE_CLOUD_PROJECT');

const config = {
  // GCP project (used for Discovery Engine import)
  projectId:  project,
  location:   optional('GCP_LOCATION', 'eu'),
  dataStoreId: optional('DATA_STORE_ID'),
  engineId:   optional('ENGINE_ID'),

  // GCS bucket names (leave unset to run against local filesystem)
  buckets: {
    raw:        optional('BUCKET_RAW',        project ? `${project}-corpus-raw`        : null),
    normalized: optional('BUCKET_NORMALIZED', project ? `${project}-corpus-normalized` : null),
    quarantine: optional('BUCKET_QUARANTINE', project ? `${project}-corpus-quarantine` : null),
  },

  // Local filesystem directories used when GCS buckets are not configured
  localDirs: {
    raw:        optional('LOCAL_DIR_RAW',        './corpus/raw'),
    normalized: optional('LOCAL_DIR_NORMALIZED', './corpus/normalized'),
    quarantine: optional('LOCAL_DIR_QUARANTINE', './corpus/quarantine'),
    state:      optional('LOCAL_DIR_STATE',      './corpus/.state'),
  },

  // Splitting thresholds
  split: {
    // Discovery Engine: max unstructured document size is 2.5 MB
    maxBytesPerPart:  parseInt(optional('SPLIT_MAX_BYTES',  String(2_000_000)), 10),
    // Safe character budget per part (~200k tokens at 4 chars/token)
    maxCharsPerPart:  parseInt(optional('SPLIT_MAX_CHARS',  String(800_000)),  10),
    // PDFs over this size reliably produce FILE_READ_ERROR in Discovery Engine
    pdfWarnBytes:     parseInt(optional('SPLIT_PDF_WARN',   String(10_000_000)), 10),
    // PDFs over this must go through Document AI — no direct ingest possible
    pdfCriticalBytes: parseInt(optional('SPLIT_PDF_FATAL',  String(50_000_000)), 10),
  },

  // Retry policy
  retry: {
    maxAttempts:    parseInt(optional('RETRY_MAX_ATTEMPTS', '3'), 10),
    initialDelayMs: parseInt(optional('RETRY_INITIAL_DELAY_MS', '2000'), 10),
    maxDelayMs:     parseInt(optional('RETRY_MAX_DELAY_MS', '60000'), 10),
  },

  // Logging
  logLevel: optional('LOG_LEVEL', 'info'),

  // Dry-run: skip actual Discovery Engine import (for local dev / CI)
  dryRun: optional('INDEX_DRY_RUN', 'false') === 'true',
};

module.exports = config;
