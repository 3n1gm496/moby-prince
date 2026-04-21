'use strict';

/**
 * Contradiction detector — uses Gemini Flash to evaluate whether pairs of
 * claims contradict each other, then inserts results into evidence.contradictions.
 *
 * Pairwise evaluation strategy:
 *   1. Receive a list of claims (already fetched from BQ).
 *   2. Build candidate pairs: claims that share at least one entity_id.
 *   3. For each pair (up to MAX_PAIRS), call Gemini with a structured prompt.
 *   4. Insert confirmed contradictions into BQ.
 *   5. Return the inserted EvidenceContradiction objects.
 *
 * This module is intentionally stateless — callers decide which claims to
 * compare; this module only performs the AI evaluation and BQ write.
 */

const bq     = require('./bigquery');
const gemini = require('./gemini');
const { createLogger } = require('../logger');

const log = createLogger('contradiction-detector');

// Minimum cosine similarity for a pair to be sent to Gemini.
// Contradiction claims share a topic (moderate similarity) but diverge in
// conclusions; 0.45 is intentionally permissive to avoid false negatives.
const SIM_THRESHOLD = 0.45;

const MAX_PAIRS = 8;   // Gemini calls per detect invocation
const VALID_TYPES     = new Set(['factual', 'temporal', 'testimonial', 'interpretive', 'procedural']);
const VALID_SEVERITIES = new Set(['minor', 'significant', 'major']);

// ── Gemini prompt ─────────────────────────────────────────────────────────────

function _buildPrompt(claimA, claimB) {
  return `
Sei un analista specializzato nel disastro del Moby Prince (10 aprile 1991).
Valuta se le due seguenti affermazioni documentali si contraddicono.

Affermazione A: "${claimA.text.slice(0, 300)}"
Affermazione B: "${claimB.text.slice(0, 300)}"

Rispondi SOLO con un oggetto JSON (nessun testo aggiuntivo):
{
  "isContradiction": true/false,
  "contradictionType": "factual" | "temporal" | "testimonial" | "interpretive" | "procedural" | null,
  "severity": "minor" | "significant" | "major" | null,
  "description": "Spiega in 1-2 frasi perché si contraddicono (oppure null se non si contraddicono)"
}
`.trim();
}

// ── Candidate pair finder ─────────────────────────────────────────────────────

/**
 * Dot-product cosine similarity between two float vectors.
 * Returns 0 for empty or mismatched vectors.
 */
function _cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Build pairs of claims that share at least one entity_id or event_id.
 * When embeddings are supplied, pairs with cosine similarity < SIM_THRESHOLD
 * are skipped before queuing a Gemini call.
 * Returns up to MAX_PAIRS pairs, deduped.
 *
 * @param {object[]}        claims
 * @param {number[][]|null} embeddings  Parallel array of embedding vectors, or null
 */
function _buildCandidatePairs(claims, embeddings = null) {
  const pairs = [];
  const seen  = new Set();

  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      if (pairs.length >= MAX_PAIRS) break;

      const a = claims[i];
      const b = claims[j];

      // Skip pairs from the same source document
      if (a.documentId === b.documentId) continue;

      const sharedEntities = (a.entityIds || []).filter(id => (b.entityIds || []).includes(id));
      const sharedEvent    = a.eventId && a.eventId === b.eventId;

      if (sharedEntities.length === 0 && !sharedEvent) continue;

      // Cosine similarity pre-filter — skip semantically unrelated pairs to
      // reduce wasted Gemini calls and false positive detections.
      if (embeddings) {
        const sim = _cosineSimilarity(embeddings[i], embeddings[j]);
        if (sim < SIM_THRESHOLD) continue;
      }

      const pairKey = [a.id, b.id].sort().join('|');
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      pairs.push([a, b]);
    }
    if (pairs.length >= MAX_PAIRS) break;
  }
  return pairs;
}

// ── Core API ──────────────────────────────────────────────────────────────────

/**
 * Evaluate a list of pre-fetched claims for contradictions.
 *
 * @param {object[]} claims  Normalized EvidenceClaim objects
 * @returns {Promise<object[]>}  Inserted EvidenceContradiction rows
 */
async function detectAmong(claims) {
  if (!claims || claims.length < 2) return [];

  // Fetch embeddings for all claims in one batch call so _buildCandidatePairs
  // can skip pairs that are semantically too distant to plausibly contradict.
  let embeddings = null;
  try {
    embeddings = await gemini.getEmbeddings(claims.map(c => c.text || ''));
  } catch (err) {
    log.warn({ error: err.message }, 'Embeddings unavailable — falling back to entity-overlap only');
  }

  const pairs       = _buildCandidatePairs(claims, embeddings);
  const now         = new Date().toISOString();
  const newContradictions = [];

  for (const [claimA, claimB] of pairs) {
    let result;
    try {
      result = await gemini.generateJson(_buildPrompt(claimA, claimB));
    } catch (err) {
      log.warn({ error: err.message }, 'Gemini contradiction eval failed — skipping pair');
      continue;
    }

    if (!result?.isContradiction) continue;

    const row = {
      id:                  _newId(),
      claim_a_id:          claimA.id,
      claim_b_id:          claimB.id,
      document_a_id:       claimA.documentId,
      document_b_id:       claimB.documentId,
      contradiction_type:  VALID_TYPES.has(result.contradictionType) ? result.contradictionType : null,
      severity:            VALID_SEVERITIES.has(result.severity) ? result.severity : 'minor',
      description:         typeof result.description === 'string' ? result.description.slice(0, 500) : null,
      status:              'open',
      resolution:          null,
      detected_by:         'llm_flagged',
      detected_at:         now,
      resolved_at:         null,
      created_at:          now,
      updated_at:          now,
    };

    newContradictions.push(row);
    log.info(
      { claimAId: claimA.id, claimBId: claimB.id, severity: row.severity },
      'Contradiction detected',
    );
  }

  if (newContradictions.length > 0) {
    try {
      await bq.insert('contradictions', newContradictions);
    } catch (err) {
      log.error({ error: err.message }, 'BQ insert contradictions failed');
      throw err;
    }
  }

  return newContradictions;
}

// ── Verify a single claim against stored claims ───────────────────────────────

/**
 * Classify the relationship between free text and a list of stored claims.
 * Returns a structured verification result.
 *
 * @param {string}   text       Free text to verify
 * @param {object[]} candidates Normalized EvidenceClaim objects to compare against
 * @returns {Promise<{ status: string, evidence: object[] }>}
 */
async function verifyClaim(text, candidates) {
  if (!candidates || candidates.length === 0) {
    return { status: 'inconclusive', evidence: [] };
  }

  const claimsBlock = candidates.slice(0, 5).map((c, i) =>
    `${i + 1}. [Doc: ${c.documentId.slice(0, 8)}…] "${c.text.slice(0, 200)}"`,
  ).join('\n');

  const prompt = `
Sei un analista del caso Moby Prince (disastro navale, 10 aprile 1991).

Testo da verificare: "${text.slice(0, 400)}"

Confronta questo testo con le seguenti affermazioni documentali e classifica la relazione:

${claimsBlock}

Rispondi con un array JSON (un elemento per affermazione):
[{"index": 1, "relationship": "supports" | "contradicts" | "neutral", "confidence": 0.0-1.0, "note": "breve spiegazione"}]
`.trim();

  let results;
  try {
    results = await gemini.generateJson(prompt);
    if (!Array.isArray(results)) results = [];
  } catch (err) {
    log.warn({ error: err.message }, 'Gemini claim verify failed');
    return { status: 'inconclusive', evidence: [] };
  }

  const evidence = results.map((r) => {
    const idx   = (r.index || 1) - 1;
    const claim = candidates[idx] || candidates[0];
    return {
      claimId:      claim?.id,
      documentId:   claim?.documentId,
      claimText:    claim?.text?.slice(0, 200),
      relationship: ['supports', 'contradicts', 'neutral'].includes(r.relationship)
        ? r.relationship
        : 'neutral',
      confidence:   typeof r.confidence === 'number' ? Math.max(0, Math.min(1, r.confidence)) : 0.5,
      note:         typeof r.note === 'string' ? r.note.slice(0, 300) : null,
    };
  });

  const supports    = evidence.filter(e => e.relationship === 'supports');
  const contradicts = evidence.filter(e => e.relationship === 'contradicts');
  const status      =
    contradicts.length > supports.length ? 'contradicted' :
    supports.length > 0                  ? 'supported'    :
    'inconclusive';

  return { status, evidence };
}

function _newId() {
  try { return require('crypto').randomUUID(); }
  catch { return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
}

module.exports = { detectAmong, verifyClaim };
