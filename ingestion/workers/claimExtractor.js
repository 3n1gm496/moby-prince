'use strict';

/**
 * ClaimExtractorWorker — extracts factual claims from document text using
 * Gemini 2.0 Flash and streams them into the BigQuery evidence.claims table.
 *
 * Activated when:
 *   - job.isSplit is false (leaf nodes only — don't extract from split parents)
 *   - job.mimeType is a text type (text/plain, etc.)
 *   - job.status is VALIDATING or INDEXING
 *   - BQ is configured (GOOGLE_CLOUD_PROJECT present)
 *   - Gemini is configured (GOOGLE_CLOUD_PROJECT + GEMINI_LOCATION available)
 *
 * This worker is soft — Gemini/BQ failures are logged as warnings, and the
 * pipeline continues.  The document is indexed regardless.
 *
 * BQ table written: evidence.claims
 * Fields: id, text, claim_type, document_id, document_uri, confidence, status,
 *         extraction_method, created_at, updated_at
 *
 * Required env vars:
 *   GOOGLE_CLOUD_PROJECT   BQ project + Gemini billing project
 *   GEMINI_LOCATION        Vertex AI region (default: us-central1)
 *   BQ_DATASET_ID          (default: evidence)
 */

const { BaseWorker }  = require('./base');
const bq              = require('../services/bigquery');
const gemini          = require('../services/gemini');
const crypto          = require('crypto');

// Text MIME types this worker processes
const TEXT_MIMES = new Set(['text/plain', 'text/html', 'text/xml', 'text/markdown']);

// Maximum characters sent to Gemini per call
const MAX_CHARS = 24_000;

// Maximum claims extracted per chunk
const MAX_CLAIMS = 15;

// Gemini prompt template
const PROMPT_TMPL = (text) => `
Sei un assistente specializzato nell'analisi di documenti storici sul caso Moby Prince (disastro navale del 10 aprile 1991).

Analizza il seguente testo ed estrai le affermazioni fattuali più rilevanti.

Per ogni affermazione restituisci un oggetto JSON con:
- "text": il testo della affermazione (frase completa, in italiano, max 200 caratteri)
- "claimType": uno tra "fact" | "interpretation" | "allegation" | "conclusion"
- "entities": array di nomi propri principali esplicitamente presenti nel testo (max 5)
- "confidence": un valore da 0.0 a 1.0 che indica quanto l'affermazione è chiara e supportata dal testo

Regole:
- Estrai tra 3 e ${MAX_CLAIMS} affermazioni, privilegiando quelle più specifiche e verificabili
- Non includere generalità ovvie o affermazioni impossibili da verificare
- Ometti dubbi, domande e ipotesi vaghe
- Rispondi con un array JSON (nessun testo aggiuntivo)

Testo:
${text.slice(0, MAX_CHARS)}
`.trim();

class ClaimExtractorWorker extends BaseWorker {
  constructor(config, logger) {
    super('claim-extraction', logger);
    this._config = config;
  }

  shouldRun(job) {
    if (job.isSplit) return false;
    if (!bq.isEnabled()) return false;
    return (
      TEXT_MIMES.has(job.mimeType) &&
      // INDEXED is the normal path (runs after IndexerWorker so job.documentId
      // is already set to the real DE document ID).  VALIDATING/INDEXING kept
      // for pipelines that skip Document AI (e.g. local dev without data store).
      ['VALIDATING', 'INDEXING', 'INDEXED'].includes(job.status)
    );
  }

  async run(job, context = {}) {
    const { storage } = context;
    const uri = job.normalizedUri || job.sourceUri;
    const canonicalDocumentId = job.documentId || job.meta?.canonical_document_id || job.jobId;
    const canonicalSourceUri = job.meta?.canonical_source_uri || job.sourceUri || uri;

    // ── Read text ──────────────────────────────────────────────────────────────
    let text = '';
    try {
      text = await _readText(uri, storage);
    } catch (err) {
      this.logger.warn(
        { jobId: job.jobId, uri, error: err.message },
        'Claim extraction: could not read text — skipping',
      );
      return this.ok(job);
    }

    if (!text.trim()) return this.ok(job);

    // ── Call Gemini Flash ──────────────────────────────────────────────────────
    let rawClaims = [];
    try {
      rawClaims = await gemini.generateJson(PROMPT_TMPL(text));
      if (!Array.isArray(rawClaims)) rawClaims = [];
    } catch (err) {
      this.logger.warn(
        { jobId: job.jobId, error: err.message },
        'Claim extraction: Gemini unavailable — skipping',
      );
      return this.ok(job);
    }

    if (rawClaims.length === 0) return this.ok(job);

    // ── Validate and normalise claims ──────────────────────────────────────────
    const now    = new Date().toISOString();
    const claims = rawClaims
      .filter(c => c && typeof c.text === 'string' && c.text.trim().length >= 10)
      .slice(0, MAX_CLAIMS)
      .map(c => ({
        id:                _claimId({
          documentId: canonicalDocumentId,
          pageReference: job.meta?.page_start,
          text: c.text,
        }),
        text:              c.text.trim().slice(0, 500),
        claim_type:        _sanitizeClaimType(c.claimType),
        document_id:       canonicalDocumentId,
        document_uri:      canonicalSourceUri || null,
        chunk_id:          null,
        page_reference:    job.meta?.page_start != null ? String(job.meta.page_start) : null,
        entity_ids:        Array.isArray(c.entities) ? c.entities.map(String).slice(0, 5) : [],
        event_id:          null,
        confidence:        typeof c.confidence === 'number'
          ? Math.max(0, Math.min(1, c.confidence))
          : 0.5,
        status:            'unverified',
        extraction_method: 'llm_extracted',
        created_at:        now,
        updated_at:        now,
      }));

    if (claims.length === 0) return this.ok(job);

    // ── Purge stale claims for this document before re-inserting ──────────────
    // Prevents duplicates when a document is re-ingested (e.g. corpus backfill).
    const shouldPurgeClaims = job.meta?.purge_claims !== false;
    if (shouldPurgeClaims) {
      try {
        const dataset = process.env.BQ_DATASET_ID || 'evidence';
        await bq.dml(
          `DELETE FROM \`${dataset}.claims\` WHERE document_id = @documentId`,
          { documentId: canonicalDocumentId },
        );
      } catch (err) {
        this.logger.warn(
          { jobId: job.jobId, error: err.message, documentId: canonicalDocumentId },
          'Claim extraction: could not purge existing claims — proceeding anyway',
        );
      }
    }

    // ── Insert into BQ ─────────────────────────────────────────────────────────
    try {
      await bq.insert('claims', claims);
      this.logger.info(
        { jobId: job.jobId, claimsCount: claims.length, documentId: canonicalDocumentId },
        'Claims extracted and inserted into BQ',
      );
    } catch (err) {
      this.logger.warn(
        { jobId: job.jobId, error: err.message },
        'Claim extraction: BQ insert failed — skipping',
      );
      return this.ok(job);
    }

    // ── Store claim IDs in job.meta for downstream reference ──────────────────
    const updatedMeta = {
      ...(job.meta || {}),
      claimIds:    claims.map(c => c.id),
      claimCount:  claims.length,
    };

    return this.ok(job._next({ meta: updatedMeta }));
  }
}

// ── Text reader ───────────────────────────────────────────────────────────────

async function _readText(uri, storage) {
  if (!uri) throw new Error('No URI to read');

  if (uri.startsWith('gs://')) {
    const { parseGcsUri } = require('../lib/gcs');
    const { bucket, name } = parseGcsUri(uri);
    const [buf] = await storage.bucket(bucket).file(name).download();
    return buf.toString('utf8');
  }

  return require('fs').readFileSync(uri, 'utf8');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_CLAIM_TYPES = new Set(['fact', 'interpretation', 'allegation', 'conclusion', 'retraction']);

function _sanitizeClaimType(raw) {
  const s = typeof raw === 'string' ? raw.toLowerCase().trim() : '';
  return VALID_CLAIM_TYPES.has(s) ? s : 'fact';
}

function _claimId({ documentId, pageReference, text }) {
  const normalizedText = String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const input = [
    documentId || 'document',
    pageReference == null ? 'page-unknown' : `page-${pageReference}`,
    normalizedText,
  ].join('|');
  return `claim-${crypto.createHash('sha1').update(input).digest('hex').slice(0, 24)}`;
}

module.exports = { ClaimExtractorWorker, _claimId };
