'use strict';

/**
 * EntityExtractionWorker — extracts named entities from document text using the
 * Cloud Natural Language API and adds them to job.meta so IndexerWorker writes
 * them to Discovery Engine structData.
 *
 * Also dual-writes `personsCount` to GCS object custom metadata so operators
 * can see enrichment status without querying DE.
 *
 * Activated when:
 *   - job.isSplit is false (process leaves/child parts, not the split parent)
 *   - job.mimeType is a text type (text/plain, text/html, etc.)
 *   - job.status is VALIDATING or INDEXING
 *
 * This worker is intentionally soft — if the NL API is unavailable or the
 * text cannot be read, it logs a warning and lets the pipeline continue.
 *
 * Required env vars:
 *   GOOGLE_CLOUD_PROJECT   used to identify the project for NL API billing
 *
 * Infrastructure prerequisite:
 *   gcloud services enable language.googleapis.com
 *   IAM: roles/language.user on the service account
 */

const { BaseWorker } = require('./base');
const { parseGcsUri } = require('../lib/gcs');

// NL API character limit (bytes). Truncate safely before sending.
const NL_MAX_CHARS = 800_000;

// Only extract entities with salience >= this threshold to reduce noise.
const MIN_SALIENCE = 0.008;

// Italian honorifics stripped before storing person names
const TITLE_RE = /^(cap\.?\s*|capitano\s*|comandante\s*|amm\.?\s*|ammiraglio\s*|col\.?\s*|colonnello\s*|gen\.?\s*|generale\s*|dott\.?\s*|dr\.?\s*|ing\.?\s*|on\.?\s*|onorevole\s*|sen\.?\s*|senatore\s*|prof\.?\s*|professore\s*|avv\.?\s*|avvocato\s*|sig\.?\s*|signor[ae]?\s*|vice\s*)+/i;

const TEXT_MIMES = new Set([
  'text/plain', 'text/html', 'text/xml', 'text/markdown',
]);

class EntityExtractionWorker extends BaseWorker {
  constructor(config, logger) {
    super('entity-extraction', logger);
    this._config = config;
  }

  shouldRun(job) {
    if (job.isSplit) return false;
    return (
      TEXT_MIMES.has(job.mimeType) &&
      ['VALIDATING', 'INDEXING'].includes(job.status)
    );
  }

  async run(job, context = {}) {
    const { storage } = context;
    const uri = job.normalizedUri || job.sourceUri;

    // ── Read text content ──────────────────────────────────────────────────────
    let text = '';
    try {
      text = await _readText(uri, storage);
    } catch (err) {
      this.logger.warn(
        { jobId: job.jobId, uri, error: err.message },
        'Entity extraction: could not read text — skipping',
      );
      return this.ok(job);
    }

    if (!text.trim()) return this.ok(job);

    // ── Call NL API ────────────────────────────────────────────────────────────
    let entities = [];
    try {
      entities = await _analyzeEntities(text.slice(0, NL_MAX_CHARS), this._config.projectId);
    } catch (err) {
      this.logger.warn(
        { jobId: job.jobId, error: err.message },
        'Natural Language API unavailable — skipping entity extraction',
      );
      return this.ok(job);
    }

    // ── Group by entity type ───────────────────────────────────────────────────
    const persons       = new Set();
    const organizations = new Set();
    const locations     = new Set();

    for (const e of entities) {
      if ((e.salience || 0) < MIN_SALIENCE) continue;
      const name = (e.name || '').trim();
      if (!name) continue;
      switch (e.type) {
        case 'PERSON': {
          const n = _normalizePerson(name);
          if (n) persons.add(n);
          break;
        }
        case 'ORGANIZATION': organizations.add(name); break;
        case 'LOCATION':     locations.add(name);     break;
      }
    }

    this.logger.info(
      {
        jobId: job.jobId,
        persons: persons.size,
        organizations: organizations.size,
        locations: locations.size,
      },
      'Entities extracted',
    );

    // ── Merge into job.meta ────────────────────────────────────────────────────
    const existingMeta = job.meta || {};
    const updatedMeta  = { ...existingMeta };

    if (persons.size > 0) {
      updatedMeta.persons_mentioned = [...persons].join(', ');
    }
    if (organizations.size > 0) {
      updatedMeta.organizations_mentioned = [...organizations].join(', ');
    }
    // Only fill locations_detected if not already set by media processor
    if (locations.size > 0 && !existingMeta.locations_detected) {
      updatedMeta.locations_detected = [...locations].join(', ');
    }

    // ── GCS dual-write: personsCount in object custom metadata ────────────────
    if (storage && uri && uri.startsWith('gs://')) {
      try {
        const { bucket, name } = parseGcsUri(uri);
        await storage.bucket(bucket).file(name).setMetadata({
          metadata: { personsCount: String(persons.size) },
        });
      } catch (err) {
        this.logger.warn({ error: err.message }, 'Could not write personsCount to GCS metadata');
      }
    }

    const updated = job._next({ meta: updatedMeta });
    return this.ok(updated);
  }
}

// ── NL API helper (REST, using ingestion auth) ────────────────────────────────

async function _analyzeEntities(text, projectId) {
  const { getAccessToken } = require('../services/auth');
  const token = await getAccessToken();
  const res   = await fetch('https://language.googleapis.com/v1/documents:analyzeEntities', {
    method:  'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Goog-User-Project': projectId,
    },
    body: JSON.stringify({
      document:     { type: 'PLAIN_TEXT', language: 'it', content: text },
      encodingType: 'UTF8',
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`NL API HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.entities || [];
}

// ── Text content reader ───────────────────────────────────────────────────────

async function _readText(uri, storage) {
  if (!uri) throw new Error('No URI to read');

  if (uri.startsWith('gs://')) {
    const { bucket, name } = parseGcsUri(uri);
    const [buf] = await storage.bucket(bucket).file(name).download();
    return buf.toString('utf8');
  }

  // Local file
  return require('fs').readFileSync(uri, 'utf8');
}

// ── Name normalizer ───────────────────────────────────────────────────────────

function _normalizePerson(name) {
  const n = name.replace(TITLE_RE, '').trim();
  return n.length >= 2 ? n : null;
}

module.exports = { EntityExtractionWorker };
