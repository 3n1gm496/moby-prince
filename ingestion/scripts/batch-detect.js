#!/usr/bin/env node
'use strict';

/**
 * batch-detect.js — Batch claim extraction for the structured evidence layer
 *
 * Fase 1 (claims): lista tutti i documenti da Vertex AI Search, recupera i
 *   chunk per ciascuno, chiede a Gemini di estrarre le affermazioni fattuali,
 *   le scrive in evidence.claims su BigQuery.
 *
 * Utilizzo:
 *   node ingestion/scripts/batch-detect.js [opzioni]
 *
 * Opzioni:
 *   --dry-run          Stima token e costo senza chiamare le API
 *   --phase=claims     Solo estrazione claim
 *   --phase=all        Alias di compatibilità, esegue comunque solo l'estrazione claim
 *   --delay=800        ms di pausa tra chiamate Gemini (default: 800)
 *   --batch=5          Chunk per chiamata Gemini in fase claims (default: 5)
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
const PHASE        = _phaseRaw === '1' || _phaseRaw === '2' ? 'claims' : _phaseRaw;
const DELAY_MS     = parseInt((ARGS.find(a => a.startsWith('--delay='))     || '--delay=800').split('=')[1],  10);
const BATCH_SIZE   = parseInt((ARGS.find(a => a.startsWith('--batch='))     || '--batch=5').split('=')[1],   10);
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
        { name: 'document_uri',     type: 'STRING',    mode: 'NULLABLE' },
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

function _fileClaimPrompt(documentTitle, mimeType) {
  const kind = mimeType.startsWith('video/') ? 'video'
             : mimeType.startsWith('audio/') ? 'audio'
             : mimeType.startsWith('image/') ? 'immagine'
             : 'documento';
  return `
Sei un analista storico specializzato nel disastro del Moby Prince (10 aprile 1991).
Documento: "${documentTitle || 'senza titolo'}" (${kind})

Analizza il contenuto del ${kind} allegato ed estrai TUTTE le affermazioni fattuali verificabili.
Per ogni affermazione indica:
- text: la dichiarazione esatta (massimo 300 caratteri)
- claim_type: "fact" | "interpretation" | "allegation" | "conclusion"
- entities: array di nomi propri menzionati (persone, navi, enti — max 5)
- confidence: 0.0-1.0

Rispondi SOLO con JSON (nessun testo aggiuntivo):
{
  "claims": [
    { "text": "...", "claim_type": "fact", "entities": ["Nome1"], "confidence": 0.85 }
  ]
}
`.trim();
}

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

function _inferMimeType(uri) {
  const lower = String(uri || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (/\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(lower)) return 'image/*';
  if (/\.(mp4|mov|mpeg|mpg|webm|avi)$/i.test(lower)) return 'video/*';
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(lower)) return 'audio/*';
  return null;
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

    const chunks   = await getChunksForDocument(docId, encodedId, title);
    const mimeType = doc.content?.mimeType || '';

    // Helper: turn raw Gemini claims into BQ rows
    const _buildRows = (claims, chunkId) => {
      const rows = [];
      const anchors = [];
      for (const c of claims.filter(claim => claim?.text?.trim())) {
        const claimId = newId();
        const pageReference = c.page_reference != null ? String(c.page_reference) : null;
        const text = String(c.text).slice(0, 1000);
        rows.push({
          id:               claimId,
          text,
          claim_type:       ['fact','interpretation','allegation','conclusion'].includes(c.claim_type)
                            ? c.claim_type : 'fact',
          document_id:      docId,
          document_uri:     uri || null,
          chunk_id:         chunkId || null,
          page_reference:   pageReference,
          entity_ids:       Array.isArray(c.entities) ? c.entities.map(String).slice(0, 5) : [],
          event_id:         null,
          confidence:       typeof c.confidence === 'number'
                            ? Math.max(0, Math.min(1, c.confidence)) : 0.7,
          status:           'unverified',
          extraction_method:'llm_extracted',
          created_at:       now,
          updated_at:       now,
        });

        const pageNumber = pageReference && /(\d{1,4})/.test(pageReference)
          ? Number(pageReference.match(/(\d{1,4})/)[1])
          : null;

        if (pageNumber != null) {
          anchors.push({
            id: `${claimId}-page`,
            document_id: docId,
            claim_id: claimId,
            event_id: null,
            anchor_type: 'page',
            page_number: pageNumber,
            text_quote: null,
            snippet: text.slice(0, 500),
            time_start_seconds: null,
            time_end_seconds: null,
            frame_reference: null,
            shot_reference: null,
            anchor_confidence: 0.8,
            source_uri: uri || null,
            mime_type: mimeType || _inferMimeType(uri),
            created_at: now,
            updated_at: now,
          });
        }

        anchors.push({
          id: `${claimId}-text`,
          document_id: docId,
          claim_id: claimId,
          event_id: null,
          anchor_type: 'text_span',
          page_number: pageNumber,
          text_quote: text.slice(0, 500),
          snippet: text.slice(0, 500),
          time_start_seconds: null,
          time_end_seconds: null,
          frame_reference: null,
          shot_reference: null,
          anchor_confidence: 0.55,
          source_uri: uri || null,
          mime_type: mimeType || _inferMimeType(uri),
          created_at: now,
          updated_at: now,
        });
      }
      return { rows, anchors };
    };

    if (chunks.length === 0) {
      // No text chunks — try Gemini multimodal directly on the GCS file.
      // This covers video, audio, images and PDFs not found in search results.
      if (uri && gemini.SUPPORTED_FILE_MIMES.has(mimeType)) {
        const mediaKind = mimeType.startsWith('video/') ? 'video'
                        : mimeType.startsWith('audio/') ? 'audio'
                        : mimeType.startsWith('image/') ? 'immagine' : 'file';
        log(`  Nessun chunk — elaborazione diretta ${mediaKind} via Vertex AI`);
        if (!DRY_RUN) {
          try {
            const result = await gemini.generateJsonFromFile(uri, mimeType, _fileClaimPrompt(title, mimeType));
            const claims = Array.isArray(result?.claims) ? result.claims : [];
            const { rows, anchors } = _buildRows(claims, null);
            if (rows.length > 0) {
              await _bqInsert('claims', rows);
              if (anchors.length > 0) await _bqInsert('source_anchors', anchors);
              log(`  ✔ ${rows.length} claim da ${mediaKind} scritti in BQ`);
              totalClaims  += rows.length;
              totalGemCalls++;
            } else {
              warn(`  Nessun claim estratto dal ${mediaKind}`);
            }
          } catch (fileErr) {
            warn(`  Elaborazione ${mediaKind} fallita: ${fileErr.message}`);
          }
        } else {
          totalGemCalls++;
          totalClaims += 3;
          process.stdout.write('M');
        }
      } else {
        warn(`  Nessun chunk e MIME non supportato (${mimeType || 'sconosciuto'}) — saltato`);
      }
      processedIds.add(docId);
      saveProgress({ processedDocIds: [...processedIds] });
      continue;
    }

    log(`  ${chunks.length} chunk trovati`);

    const claimRows = [];
    const anchorRows = [];
    for (let ci = 0; ci < chunks.length; ci += BATCH_SIZE) {
      const batch    = chunks.slice(ci, ci + BATCH_SIZE);
      const texts    = batch.map(c => c.content?.content || c.documentMetadata?.title || '');
      const chunkIds = batch.map(c => (c.name || '').split('/').pop() || '');

      if (texts.every(t => !t.trim())) continue;

      if (DRY_RUN) {
        totalGemCalls++;
        totalClaims += 3;
        process.stdout.write('.');
        continue;
      }

      try {
        const result = await gemini.generateJson(_claimPrompt(texts, title), 8192);
        const claims = Array.isArray(result?.claims) ? result.claims : [];
        const { rows, anchors } = _buildRows(claims, chunkIds[0] || null);
        claimRows.push(...rows);
        anchorRows.push(...anchors);

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
      for (let bi = 0; bi < anchorRows.length; bi += 500) {
        await _bqInsert('source_anchors', anchorRows.slice(bi, bi + 500));
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   Moby Prince — Batch claim extraction           ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  log(`Progetto    : ${PROJECT}`);
  log(`Datastore   : ${DATA_STORE_ID || '(non impostato)'}`);
  log(`Engine      : ${ENGINE_ID    || '(non impostato — usando endpoint datastore)'}`);
  log(`Dataset BQ  : ${DATASET}`);
  log(`Fase        : ${PHASE}`);
  log(`Delay       : ${DELAY_MS} ms`);
  log(`Chunk/batch : ${BATCH_SIZE}`);
  log(`Dry run     : ${DRY_RUN ? 'SÌ — nessuna scrittura' : 'no'}`);
  log(`Resume      : ${RESUME}`);
  console.log('');

  if (!['claims', 'all'].includes(PHASE)) {
    throw new Error(`Fase non supportata: ${PHASE}. Usa --phase=claims o --phase=all.`);
  }

  await runClaimsPhase();

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
