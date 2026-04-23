#!/usr/bin/env node
'use strict';

/**
 * batch-detect.js — Batch claim extraction + contradiction detection
 *
 * Fase 1 (claims): lista tutti i documenti da Vertex AI Search, recupera i
 *   chunk per ciascuno, chiede a Gemini di estrarre le affermazioni fattuali,
 *   le scrive in evidence.claims su BigQuery.
 *
 * Fase 2 (detect): carica tutti i claim da BQ, costruisce coppie candidate
 *   per sovrapposizione di entità, chiama Gemini per valutare le contraddizioni,
 *   scrive i risultati in evidence.contradictions.
 *
 * Utilizzo:
 *   node ingestion/scripts/batch-detect.js [opzioni]
 *
 * Opzioni:
 *   --dry-run          Stima token e costo senza chiamare le API
 *   --phase=claims     Solo estrazione claim
 *   --phase=detect     Solo detection (richiede claim già in BQ)
 *   --phase=all        Entrambe le fasi (default)
 *   --delay=800        ms di pausa tra chiamate Gemini (default: 800)
 *   --batch=5          Chunk per chiamata Gemini in fase claims (default: 5)
 *   --max-pairs=200    Coppie massime valutate in fase detect (default: 200)
 *   --resume           Salta documenti già processati (legge progress.json)
 *
 * Variabili d'ambiente (stesso backend/.env):
 *   GOOGLE_CLOUD_PROJECT  — obbligatorio
 *   DATA_STORE_ID         — obbligatorio per fase claims
 *   ENGINE_ID             — opzionale; se impostato usa l'endpoint di ricerca a livello engine
 *   GCP_LOCATION          — default: eu
 *   GEMINI_LOCATION       — default: us-central1
 *   BQ_DATASET_ID         — default: evidence
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const { getAccessToken } = require('../services/auth');
const gemini             = require('../services/gemini');

// ── Config ────────────────────────────────────────────────────────────────────

const PROJECT       = process.env.GOOGLE_CLOUD_PROJECT;
const LOCATION      = process.env.GCP_LOCATION      || 'eu';
const DATASET       = process.env.BQ_DATASET_ID     || 'evidence';
const DATA_STORE_ID = process.env.DATA_STORE_ID;
const ENGINE_ID     = process.env.ENGINE_ID;

if (!PROJECT) { console.error('GOOGLE_CLOUD_PROJECT non impostato.'); process.exit(1); }

const ARGS         = process.argv.slice(2);
const DRY_RUN      = ARGS.includes('--dry-run');
const _phaseRaw    = (ARGS.find(a => a.startsWith('--phase=')) || '--phase=all').split('=')[1];
const PHASE        = _phaseRaw === '1' ? 'claims' : _phaseRaw === '2' ? 'detect' : _phaseRaw;
const DELAY_MS     = parseInt((ARGS.find(a => a.startsWith('--delay='))     || '--delay=800').split('=')[1],  10);
const BATCH_SIZE   = parseInt((ARGS.find(a => a.startsWith('--batch='))     || '--batch=5').split('=')[1],   10);
const MAX_PAIRS    = parseInt((ARGS.find(a => a.startsWith('--max-pairs=')) || '--max-pairs=200').split('=')[1], 10);
const RESUME       = ARGS.includes('--resume');
const RESET_CLAIMS = ARGS.includes('--reset-claims');

const PROGRESS_FILE = path.join(__dirname, '../../.batch-detect-progress.json');

const DE_COLLECTION = `https://${LOCATION}-discoveryengine.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}/collections/default_collection`;
const DE_BASE       = `${DE_COLLECTION}/dataStores/${DATA_STORE_ID}`;
// Prefer engine-level search (same as backend); fall back to datastore-level.
const DE_SEARCH = ENGINE_ID
  ? `${DE_COLLECTION}/engines/${ENGINE_ID}/servingConfigs/default_serving_config:search`
  : `${DE_BASE}/servingConfigs/default_config:search`;
const BQ_BASE   = `https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT}/datasets/${DATASET}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function newId() {
  try { return require('crypto').randomUUID(); }
  catch { return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
}

function log(msg)  { console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`); }
function warn(msg) { console.warn(`[${new Date().toISOString().slice(11, 19)}] ⚠  ${msg}`); }
function ok(msg)   { console.log(`[${new Date().toISOString().slice(11, 19)}] ✔  ${msg}`); }

function loadProgress() {
  if (!RESUME || !fs.existsSync(PROGRESS_FILE)) return { processedDocIds: [] };
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8')); }
  catch { return { processedDocIds: [] }; }
}

function saveProgress(data) {
  try { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2)); }
  catch { /* ignore */ }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function _get(url) {
  const token = await getAccessToken();
  const res   = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'X-Goog-User-Project': PROJECT },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`GET ${url.slice(0, 120)} → ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

async function _post(url, body) {
  const token = await getAccessToken();
  const res   = await fetch(url, {
    method:  'POST',
    headers: {
      Authorization:         `Bearer ${token}`,
      'Content-Type':        'application/json',
      'X-Goog-User-Project': PROJECT,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`POST ${url.slice(0, 120)} → ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.json();
}

async function _bqQuery(sql) {
  const token = await getAccessToken();
  const res   = await fetch(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT}/queries`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ query: sql, location: 'EU', timeoutMs: 60_000, useLegacySql: false }),
    },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`BQ query failed (${res.status}): ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const schema = data.schema?.fields || [];
  return (data.rows || []).map(row =>
    Object.fromEntries(schema.map((f, i) => [f.name, row.f[i].v])),
  );
}

async function _bqInsert(tableId, rows) {
  if (DRY_RUN || rows.length === 0) return;
  const body  = { rows: rows.map(r => ({ insertId: newId(), json: r })) };
  // Retry on 404: table may not yet be visible after a recent CREATE (BQ propagation lag).
  const delays = [2000, 5000, 10000];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) {
      warn(`BQ insert ${tableId}: tabella non ancora disponibile, attendo ${delays[attempt-1]/1000}s...`);
      await new Promise(r => setTimeout(r, delays[attempt - 1]));
    }
    const token = await getAccessToken();
    const res   = await fetch(
      `${BQ_BASE}/tables/${tableId}/insertAll`,
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      },
    );
    if (res.status === 404) { lastErr = new Error(`Table ${tableId} not found (404)`); continue; }
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`BQ insert ${tableId} failed (${res.status}): ${t.slice(0, 200)}`);
    }
    const data = await res.json();
    if (data.insertErrors?.length) {
      warn(`BQ insert ${tableId}: ${data.insertErrors.length} errors`);
      for (const ie of data.insertErrors.slice(0, 3)) {
        for (const e of (ie.errors || [])) {
          warn(`  row[${ie.index}] ${e.reason}: ${e.message} (location: ${e.location})`);
        }
      }
    }
    return; // success
  }
  throw lastErr || new Error(`BQ insert ${tableId}: tabella non trovata dopo 3 tentativi`);
}

async function _bqDropAndRecreateClaims() {
  const token   = await getAccessToken();
  const baseUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT}/datasets/${DATASET}/tables`;

  // Drop (ignore 404 if table doesn't exist yet)
  const del = await fetch(`${baseUrl}/claims`, {
    method:  'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!del.ok && del.status !== 404) {
    throw new Error(`BQ drop claims failed (${del.status})`);
  }

  // Recreate with original partitioning + clustering
  const create = await fetch(baseUrl, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tableReference: { projectId: PROJECT, datasetId: DATASET, tableId: 'claims' },
      timePartitioning: { type: 'DAY', field: 'created_at' },
      clustering:       { fields: ['document_id', 'status', 'claim_type'] },
      schema: { fields: [
        { name: 'id',               type: 'STRING',    mode: 'REQUIRED' },
        { name: 'text',             type: 'STRING',    mode: 'REQUIRED' },
        { name: 'claim_type',       type: 'STRING',    mode: 'REQUIRED' },
        { name: 'document_id',      type: 'STRING',    mode: 'REQUIRED' },
        { name: 'chunk_id',         type: 'STRING',    mode: 'NULLABLE' },
        { name: 'page_reference',   type: 'INT64',     mode: 'NULLABLE' },
        { name: 'entity_ids',       type: 'STRING',    mode: 'REPEATED' },
        { name: 'event_id',         type: 'STRING',    mode: 'NULLABLE' },
        { name: 'confidence',       type: 'FLOAT64',   mode: 'NULLABLE' },
        { name: 'status',           type: 'STRING',    mode: 'NULLABLE' },
        { name: 'extraction_method',type: 'STRING',    mode: 'NULLABLE' },
        { name: 'created_at',       type: 'TIMESTAMP', mode: 'NULLABLE' },
        { name: 'updated_at',       type: 'TIMESTAMP', mode: 'NULLABLE' },
      ]},
    }),
  });
  if (!create.ok) {
    const t = await create.text().catch(() => '');
    throw new Error(`BQ recreate claims failed (${create.status}): ${t.slice(0, 200)}`);
  }
}

// ── Vertex AI Search: list documents + chunks ─────────────────────────────────

async function listAllDocuments() {
  if (!DATA_STORE_ID) throw new Error('DATA_STORE_ID non impostato — richiesto per la fase claims.');
  const docs = [];
  let pageToken = null;
  do {
    const params = new URLSearchParams({ pageSize: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await _get(`${DE_BASE}/branches/0/documents?${params}`);
    for (const d of data.documents || []) docs.push(d);
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return docs;
}

// Chunk resource names look like:
// .../documents/{documentId}/chunks/{chunkId}
// Extract documentId and compare with the target.
function _normaliseId(id) {
  try { return decodeURIComponent(id).replace(/\s/g, '_'); } catch { return id; }
}

function _chunkBelongsToDoc(chunk, docId) {
  const name  = chunk.name || '';
  const parts = name.split('/');
  const ci    = parts.lastIndexOf('chunks');
  if (ci > 0) {
    const chunkDocId = parts[ci - 1];
    if (chunkDocId === docId) return true;
    // Normalise both sides: decode %XX and unify spaces/underscores
    return _normaliseId(chunkDocId) === _normaliseId(docId);
  }
  return _normaliseId(name).includes(_normaliseId(docId));
}

async function getChunksForDocument(docId, encodedDocId, title) {
  // Try direct chunks sub-resource first (requires chunk storage enabled on the datastore).
  // Fall back to the :search endpoint filtered by document_id if it returns 404.
  try {
    const data = await _get(`${DE_BASE}/branches/0/documents/${encodedDocId}/chunks?pageSize=100`);
    const chunks = data.chunks || [];
    if (chunks.length > 0) return chunks;
  } catch (err) {
    if (!err.message.includes('404')) {
      warn(`Chunk fetch failed for ${encodedDocId}: ${err.message}`);
      return [];
    }
    // 404 → chunk storage not enabled; fall through to search API
  }

  // Search-based fallback: filter by document.id so we only get chunks from
  // this specific document regardless of semantic relevance.
  const toChunk = c => ({
    name:    c.name || c.id || '',
    content: { content: c.content || '' },
    documentMetadata: { title: c.documentMetadata?.title || title || '' },
  });

  // Attempt 1: filter by document id — try two syntaxes Discovery Engine may accept.
  // Always apply _chunkBelongsToDoc to verify the filter actually worked.
  for (const filterExpr of [`id: ANY("${docId}")`, `document.id: ANY("${docId}")`]) {
    try {
      const body = {
        query:    '.',
        pageSize: 100,
        filter:   filterExpr,
        contentSearchSpec: {
          searchResultMode: 'CHUNKS',
          chunkSpec: { numPreviousChunks: 0, numNextChunks: 0 },
        },
      };
      const data    = await _post(DE_SEARCH, body);
      const results = data.results || [];
      const chunks  = results.map(r => r.chunk).filter(Boolean)
                             .filter(c => _chunkBelongsToDoc(c, docId));
      if (chunks.length > 0) return chunks.map(toChunk);
    } catch (filterErr) {
      // this filter syntax not supported; try next
    }
  }

  // Attempt 2: title-based search + in-process filter by document ID.
  try {
    const body = {
      query:    title || docId,
      pageSize: 100,
      contentSearchSpec: {
        searchResultMode: 'CHUNKS',
        chunkSpec: { numPreviousChunks: 0, numNextChunks: 0 },
      },
    };
    const data    = await _post(DE_SEARCH, body);
    const results = data.results || [];

    const allChunks = results.map(r => r.chunk).filter(Boolean);
    const matched   = allChunks.filter(c => _chunkBelongsToDoc(c, docId));

    if (matched.length > 0) return matched.map(toChunk);

    // Diagnostic log when nothing matches.
    if (allChunks.length > 0) {
      warn(`  0/${allChunks.length} chunk corrispondono — cercato docId="${docId}"`);
      warn(`  Esempi chunk.name: ${allChunks.slice(0, 3).map(c => c.name).join(' | ')}`);
    } else {
      warn(`  Nessun chunk restituito dalla ricerca per query="${title}"`);
    }
    // No matched chunks — skip rather than returning unrelated chunks.
  } catch (err) {
    warn(`Search fallback failed for ${docId}: ${err.message}`);
  }

  return [];
}

// ── Gemini: claim extraction ──────────────────────────────────────────────────

function _claimPrompt(chunkTexts, documentTitle) {
  const numbered = chunkTexts.map((t, i) => `[Chunk ${i + 1}] ${t.slice(0, 600)}`).join('\n\n');
  return `
Sei un analista storico specializzato nel disastro del Moby Prince (10 aprile 1991).
Documento: "${documentTitle || 'senza titolo'}"

Estrai TUTTE le affermazioni fattuali verificabili dai seguenti passaggi.
Per ogni affermazione indica:
- text: la dichiarazione esatta (massimo 300 caratteri)
- claim_type: "fact" | "interpretation" | "allegation" | "conclusion"
- entities: array di nomi propri menzionati (persone, navi, enti — max 5)
- confidence: 0.0-1.0 (quanto è chiara e verificabile l'affermazione)

Testi:
${numbered}

Rispondi SOLO con JSON (nessun testo aggiuntivo):
{
  "claims": [
    { "text": "...", "claim_type": "fact", "entities": ["Nome1"], "confidence": 0.85 }
  ]
}
`.trim();
}

// ── Gemini: contradiction evaluation ─────────────────────────────────────────

function _pairPrompt(claimA, claimB) {
  return `
Sei un analista specializzato nel disastro del Moby Prince (10 aprile 1991).
Valuta se le due affermazioni si contraddicono.

Affermazione A (doc ${claimA.document_id?.slice(0, 8) || '?'}…): "${claimA.text?.slice(0, 300)}"
Affermazione B (doc ${claimB.document_id?.slice(0, 8) || '?'}…): "${claimB.text?.slice(0, 300)}"

Rispondi SOLO con JSON:
{
  "isContradiction": true/false,
  "contradictionType": "factual" | "temporal" | "testimonial" | "interpretive" | "procedural" | null,
  "severity": "minor" | "significant" | "major" | null,
  "description": "Spiega in 1-2 frasi (null se non si contraddicono)"
}
`.trim();
}

// ── PHASE 1: Extract claims from corpus ───────────────────────────────────────

async function runClaimsPhase() {
  log('=== FASE 1: Estrazione claim ===');

  if (RESET_CLAIMS && !DRY_RUN) {
    log('--reset-claims: drop + recreate tabella claims...');
    await _bqDropAndRecreateClaims();
    if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
    log('Tabella claims svuotata. Ripartenza da zero.');
  }

  const progress      = loadProgress();
  const processedIds  = new Set(progress.processedDocIds || []);

  const allDocs = await listAllDocuments();
  log(`Documenti trovati in Vertex AI Search: ${allDocs.length}`);

  let totalClaims  = 0;
  let totalGemCalls = 0;
  let skipped       = 0;
  const now = new Date().toISOString();

  for (let di = 0; di < allDocs.length; di++) {
    const doc   = allDocs[di];
    const parts = (doc.name || '').split('/');
    const docId = parts[parts.length - 1] || doc.id;

    if (processedIds.has(docId)) { skipped++; continue; }

    const uri     = doc.content?.uri || '';
    const fromUri = uri ? (uri.split('/').pop() || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() : '';
    const title   = fromUri || doc.structData?.title || docId;
    const encodedId = encodeURIComponent(decodeURIComponent(docId).replace(/\s/g, '_'));

    log(`[${di + 1}/${allDocs.length}] ${title.slice(0, 60)}`);

    const chunks = await getChunksForDocument(docId, encodedId, title);
    if (chunks.length === 0) {
      warn(`  Nessun chunk trovato — saltato`);
      processedIds.add(docId);
      saveProgress({ processedDocIds: [...processedIds] });
      continue;
    }

    log(`  ${chunks.length} chunk trovati`);

    const claimRows = [];
    for (let ci = 0; ci < chunks.length; ci += BATCH_SIZE) {
      const batch     = chunks.slice(ci, ci + BATCH_SIZE);
      const texts     = batch.map(c => c.content?.content || c.documentMetadata?.title || '');
      const chunkIds  = batch.map(c => (c.name || '').split('/').pop() || '');

      if (texts.every(t => !t.trim())) continue;

      const estimatedTokensIn  = texts.join('').length / 4 + 400;
      const estimatedTokensOut = 600;

      if (DRY_RUN) {
        totalGemCalls++;
        totalClaims += 3; // media stimata
        process.stdout.write('.');
        continue;
      }

      try {
        const result = await gemini.generateJson(_claimPrompt(texts, title), 8192);
        const claims = Array.isArray(result?.claims) ? result.claims : [];

        for (let idx = 0; idx < claims.length; idx++) {
          const c = claims[idx];
          if (!c?.text?.trim()) continue;
          claimRows.push({
            id:               newId(),
            text:             String(c.text).slice(0, 1000),
            claim_type:       ['fact','interpretation','allegation','conclusion'].includes(c.claim_type)
                              ? c.claim_type : 'fact',
            document_id:      docId,
            chunk_id:         chunkIds[0] || null,
            page_reference:   null,
            entity_ids:       Array.isArray(c.entities) ? c.entities.map(String).slice(0, 5) : [],
            event_id:         null,
            confidence:       typeof c.confidence === 'number'
                              ? Math.max(0, Math.min(1, c.confidence)) : 0.7,
            status:           'unverified',
            extraction_method:'llm_extracted',
            created_at:       now,
            updated_at:       now,
          });
        }

        totalGemCalls++;
        totalClaims += claims.length;
        process.stdout.write(claims.length > 0 ? `${claims.length}` : '·');
      } catch (err) {
        warn(`  Gemini error su chunk ${ci}–${ci + BATCH_SIZE}: ${err.message}`);
        process.stdout.write('!');
      }

      await sleep(DELAY_MS);
    }

    process.stdout.write('\n');

    if (!DRY_RUN && claimRows.length > 0) {
      // Insert in batches of 500 (BQ streaming limit)
      for (let bi = 0; bi < claimRows.length; bi += 500) {
        await _bqInsert('claims', claimRows.slice(bi, bi + 500));
      }
      ok(`  ${claimRows.length} claim scritti in BQ`);
    } else if (DRY_RUN) {
      log(`  [dry-run] ${totalClaims} claim stimati finora`);
    }

    processedIds.add(docId);
    saveProgress({ processedDocIds: [...processedIds] });

    // Breve pausa tra documenti
    if (!DRY_RUN) await sleep(200);
  }

  log('');
  log(`Fase claims completata:`);
  log(`  Documenti processati : ${allDocs.length - skipped}  (saltati: ${skipped})`);
  log(`  Chiamate Gemini      : ${totalGemCalls}`);
  log(`  Claim ${DRY_RUN ? 'stimati' : 'scritti'} : ${totalClaims}`);

  if (DRY_RUN) {
    const inputTokens  = totalGemCalls * 1200;
    const outputTokens = totalGemCalls * 600;
    const costInput    = (inputTokens  / 1_000_000) * 0.075;
    const costOutput   = (outputTokens / 1_000_000) * 0.30;
    log(`  Token input stimati  : ${(inputTokens / 1_000_000).toFixed(2)} M  → $${costInput.toFixed(3)}`);
    log(`  Token output stimati : ${(outputTokens / 1_000_000).toFixed(2)} M  → $${costOutput.toFixed(3)}`);
    log(`  Costo stimato FASE 1 : $${(costInput + costOutput).toFixed(3)}`);
  }
}

// ── PHASE 2: Detect contradictions across all claims ─────────────────────────

async function runDetectPhase() {
  log('=== FASE 2: Detection contraddizioni ===');

  // Load all claims from BQ
  log('Caricamento claim da BigQuery...');
  const rows = await _bqQuery(
    `SELECT id, text, claim_type, document_id, entity_ids, event_id, confidence
     FROM \`${PROJECT}.${DATASET}.claims\`
     WHERE status = 'unverified' AND confidence >= 0.6
     ORDER BY created_at DESC
     LIMIT 10000`,
  );
  log(`Claim caricati: ${rows.length}`);

  if (rows.length < 2) {
    warn('Meno di 2 claim disponibili — impossibile rilevare contraddizioni.');
    return;
  }

  // Build candidate pairs: claims that share an entity name via text overlap,
  // from DIFFERENT documents. Use simple keyword overlap as proxy since
  // entity_ids may not be populated yet.
  log('Costruzione coppie candidate...');
  const pairs = _buildCandidatePairs(rows);
  log(`Coppie candidate: ${pairs.length}  (max: ${MAX_PAIRS})`);

  if (DRY_RUN) {
    const inputTokens  = pairs.length * 600;
    const outputTokens = pairs.length * 100;
    const costInput    = (inputTokens  / 1_000_000) * 0.075;
    const costOutput   = (outputTokens / 1_000_000) * 0.30;
    log(`  Costo stimato FASE 2 : $${(costInput + costOutput).toFixed(3)}`);
    return;
  }

  const now = new Date().toISOString();
  let detected = 0;

  for (let pi = 0; pi < pairs.length; pi++) {
    const [a, b] = pairs[pi];

    if ((pi + 1) % 20 === 0) {
      log(`  ${pi + 1}/${pairs.length} coppie valutate — ${detected} contraddizioni rilevate`);
    }

    let result;
    try {
      result = await gemini.generateJson(_pairPrompt(a, b));
    } catch (err) {
      warn(`Gemini error coppia ${pi}: ${err.message}`);
      await sleep(DELAY_MS * 2);
      continue;
    }

    if (result?.isContradiction === true) {
      const VALID_TYPES = new Set(['factual','temporal','testimonial','interpretive','procedural']);
      const VALID_SEV   = new Set(['minor','significant','major']);
      const row = {
        id:                 newId(),
        claim_a_id:         a.id,
        claim_b_id:         b.id,
        document_a_id:      a.document_id,
        document_b_id:      b.document_id,
        contradiction_type: VALID_TYPES.has(result.contradictionType) ? result.contradictionType : null,
        severity:           VALID_SEV.has(result.severity) ? result.severity : 'minor',
        description:        typeof result.description === 'string'
                            ? result.description.slice(0, 500) : null,
        status:             'open',
        resolution:         null,
        detected_by:        'llm_flagged',
        detected_at:        now,
        resolved_at:        null,
        created_at:         now,
        updated_at:         now,
      };
      await _bqInsert('contradictions', [row]);
      detected++;
      ok(`  Contraddizione: ${row.severity} (${row.contradiction_type || 'n/d'}) — ${(result.description || '').slice(0, 80)}`);
    }

    await sleep(DELAY_MS);
  }

  log('');
  log(`Fase detection completata:`);
  log(`  Coppie valutate      : ${pairs.length}`);
  log(`  Contraddizioni       : ${detected}`);
}

function _buildCandidatePairs(claims) {
  const pairs = [];
  const seen  = new Set();

  // Build keyword sets for each claim (words ≥5 chars)
  const kwSets = claims.map(c =>
    new Set((c.text || '').toLowerCase().split(/\W+/).filter(w => w.length >= 5)),
  );

  for (let i = 0; i < claims.length && pairs.length < MAX_PAIRS; i++) {
    for (let j = i + 1; j < claims.length && pairs.length < MAX_PAIRS; j++) {
      const a = claims[i];
      const b = claims[j];

      // Must be from different documents
      if (a.document_id === b.document_id) continue;

      // Must share at least 2 significant keywords
      let shared = 0;
      for (const kw of kwSets[i]) {
        if (kwSets[j].has(kw)) { shared++; if (shared >= 2) break; }
      }
      if (shared < 2) continue;

      const key = [a.id, b.id].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([a, b]);
    }
  }
  return pairs;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Moby Prince — Batch claim + contradiction      ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  log(`Progetto    : ${PROJECT}`);
  log(`Datastore   : ${DATA_STORE_ID || '(non impostato)'}`);
  log(`Engine      : ${ENGINE_ID    || '(non impostato — usando endpoint datastore)'}`);
  log(`Dataset BQ  : ${DATASET}`);
  log(`Fase        : ${PHASE}`);
  log(`Delay       : ${DELAY_MS} ms`);
  log(`Chunk/batch : ${BATCH_SIZE}`);
  log(`Max coppie  : ${MAX_PAIRS}`);
  log(`Dry run     : ${DRY_RUN ? 'SÌ — nessuna scrittura' : 'no'}`);
  log(`Resume      : ${RESUME}`);
  console.log('');

  if (PHASE === 'claims' || PHASE === 'all') await runClaimsPhase();
  if (PHASE === 'detect' || PHASE === 'all') await runDetectPhase();

  console.log('');
  log('Script completato.');
  if (DRY_RUN) {
    log('Riesegui senza --dry-run per eseguire effettivamente le operazioni.');
  } else if (RESUME) {
    log(`Progresso salvato in: ${PROGRESS_FILE}`);
    log('Esegui di nuovo con --resume per continuare se interrotto.');
  }
}

main().catch(err => {
  console.error(`\nERRORE: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
