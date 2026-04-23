#!/usr/bin/env node
'use strict';

/**
 * Backfill the BigQuery evidence layer from the currently indexed corpus.
 *
 * This script is intentionally conservative:
 * - Discovery Engine is the source for the document registry.
 * - Existing claims are preserved and used as source evidence.
 * - Source anchors are rebuilt from claim snippets and page references when
 *   available.
 * - Entity canonicalisation is AI-assisted, high-threshold, and rejects noisy
 *   OCR fragments.
 *
 * Usage:
 *   node ingestion/scripts/backfill-structured-layer.js --replace
 *   node ingestion/scripts/backfill-structured-layer.js --phases=documents,anchors
 *   node ingestion/scripts/backfill-structured-layer.js --dry-run --phases=entities
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

loadEnv(path.join(__dirname, '../../backend/.env'));

const { getAccessToken } = require('../services/auth');
const bq = require('../services/bigquery');
const gemini = require('../services/gemini');

const PROJECT = process.env.BQ_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const DATASET = process.env.BQ_DATASET_ID || 'evidence';
const LOCATION = process.env.BQ_LOCATION || 'EU';
const DE_LOCATION = process.env.GCP_LOCATION || 'eu';
const DATA_STORE_ID = process.env.DATA_STORE_ID;
const ENGINE_ID = process.env.ENGINE_ID;

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const REPLACE = ARGS.includes('--replace');
const PHASES = new Set(
  (ARGS.find((arg) => arg.startsWith('--phases=')) || '--phases=documents,anchors,entities,events,profiles')
    .split('=')[1]
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);
const ENTITY_LIMIT = Math.min(parseInt(valueOf('--entity-limit', '500'), 10) || 500, 2000);
const ENTITY_THRESHOLD = parseFloat(valueOf('--entity-threshold', '0.82')) || 0.82;
const EVENT_LIMIT = parseInt(valueOf('--event-limit', '0'), 10) || 0;
const EVENT_OFFSET = parseInt(valueOf('--event-offset', '0'), 10) || 0;
const EVENT_BATCH_SIZE = Math.min(parseInt(valueOf('--event-batch', '45'), 10) || 45, 80);
const EVENT_THRESHOLD = parseFloat(valueOf('--event-threshold', '0.84')) || 0.84;
const EVENT_PROGRESSIVE = !ARGS.includes('--events-final-insert');

if (!PROJECT) fail('GOOGLE_CLOUD_PROJECT/BQ_PROJECT_ID non impostato.');
if (!DATA_STORE_ID && PHASES.has('documents')) fail('DATA_STORE_ID non impostato.');

const DE_COLLECTION =
  `https://${DE_LOCATION}-discoveryengine.googleapis.com/v1/projects/${PROJECT}` +
  `/locations/${DE_LOCATION}/collections/default_collection`;
const DE_BASE = `${DE_COLLECTION}/dataStores/${DATA_STORE_ID}`;

function valueOf(flag, fallback) {
  return (ARGS.find((arg) => arg.startsWith(`${flag}=`)) || `${flag}=${fallback}`).split('=')[1];
}

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function sqlString(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function idFor(prefix, value) {
  const slug = String(value || prefix)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const hash = crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 8);
  return `${prefix}-${slug || hash}-${hash}`.slice(0, 63);
}

function documentIdFromName(name) {
  return String(name || '').split('/').pop() || null;
}

function titleFromUri(uri) {
  const decoded = decodeURIComponent(String(uri || '').split('/').pop() || '');
  return decoded.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function inferDocumentType(uri) {
  const lower = String(uri || '').toLowerCase();
  if (lower.includes('resocont')) return 'testimony';
  if (lower.includes('relazione') || lower.includes('dossier')) return 'report';
  if (lower.includes('sentenza') || lower.includes('archiviazione') || lower.includes('istanza')) return 'judicial_act';
  if (lower.includes('delibera') || lower.includes('regolamento')) return 'parliamentary_act';
  return 'document';
}

function inferInstitution(uri) {
  const lower = String(uri || '').toLowerCase();
  if (lower.includes('fonti parlamentari')) return 'commissione_parlamentare';
  if (lower.includes('fonti giudiziarie')) return 'autorita_giudiziaria';
  if (lower.includes('registri tecnici')) return 'registro_tecnico';
  return 'other';
}

function inferYear(uri) {
  const match = String(uri || '').match(/(?:19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

function inferLegislature(uri) {
  const match = String(uri || '').match(/leg[_\s-]*(\d{2})/i);
  return match ? match[1] : null;
}

function inferMimeType(uri) {
  const lower = String(uri || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

function normalizeDateIso(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}$/.test(text)) return `${text}-01`;
  if (/^\d{4}$/.test(text)) return `${text}-01-01`;
  return null;
}

function inferDateIsoFromItalianText(value) {
  const text = String(value || '').toLowerCase();
  const months = {
    gennaio: '01',
    febbraio: '02',
    marzo: '03',
    aprile: '04',
    maggio: '05',
    giugno: '06',
    luglio: '07',
    agosto: '08',
    settembre: '09',
    ottobre: '10',
    novembre: '11',
    dicembre: '12',
  };
  const match = text.match(/\b(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+((?:19|20)\d{2})\b/);
  if (!match) return null;
  const day = String(Number(match[1])).padStart(2, '0');
  return `${match[3]}-${months[match[2]]}-${day}`;
}

function normalizeEventType(value) {
  const allowed = new Set([
    'collision', 'fire', 'rescue', 'communication', 'navigation',
    'administrative', 'judicial', 'parliamentary', 'investigation',
    'technical', 'event',
  ]);
  const type = String(value || '').toLowerCase().trim();
  return allowed.has(type) ? type : 'event';
}

function normalizePrecision(value, hasDate) {
  const allowed = new Set(['exact', 'day', 'month', 'year', 'approximate', 'inferred']);
  const precision = String(value || '').toLowerCase().trim();
  if (allowed.has(precision)) return precision;
  return hasDate ? 'day' : 'approximate';
}

function isKnownDisasterDateOcrError(event) {
  const date = `${event.dateIso || ''} ${event.dateText || ''}`.toLowerCase();
  if (!date.includes('1991-11-10') && !date.includes('10 novembre 1991')) return false;

  const type = normalizeEventType(event.event_type);
  const isOperationalType = new Set([
    'collision', 'fire', 'rescue', 'navigation', 'communication', 'technical', 'event',
  ]).has(type);
  if (!isOperationalType) return false;

  const text = `${event.title || ''} ${event.description || ''}`.toLowerCase();
  const hasCoreContext = [
    'moby prince',
    'agip abruzzo',
    'collisione',
    'incendio',
    'soccors',
    'rada di livorno',
    'petroliera',
    'nave cisterna',
  ].some((term) => text.includes(term));

  return hasCoreContext;
}

async function query(sql) {
  const token = await getAccessToken();
  const res = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT}/queries`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, location: LOCATION, timeoutMs: 60000, useLegacySql: false }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`BQ query failed (${res.status}): ${detail.slice(0, 400)}`);
  }
  const data = await res.json();
  const fields = data.schema?.fields || [];
  return (data.rows || []).map((row) =>
    Object.fromEntries(fields.map((field, index) => [field.name, mapBqCell(field, row.f[index]?.v)])),
  );
}

function mapBqCell(field, raw) {
  if (raw == null) return null;
  if (field.mode === 'REPEATED') {
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.map((item) => item?.v ?? item);
  }
  if (field.type === 'INTEGER' || field.type === 'INT64') return Number(raw);
  if (field.type === 'FLOAT' || field.type === 'FLOAT64') return Number(raw);
  if (field.type === 'BOOLEAN' || field.type === 'BOOL') return raw === true || raw === 'true';
  return raw;
}

async function dml(sql) {
  if (DRY_RUN) {
    log(`[dry-run] DML: ${sql.slice(0, 140).replace(/\s+/g, ' ')}...`);
    return;
  }
  await bq.dml(sql);
}

async function insertBatches(table, rows, batchSize = 500) {
  if (DRY_RUN || rows.length === 0) {
    log(`${DRY_RUN ? '[dry-run] ' : ''}${table}: ${rows.length} righe`);
    return;
  }
  for (let i = 0; i < rows.length; i += batchSize) {
    await bq.insert(table, rows.slice(i, i + batchSize));
  }
}

async function existingIds(table, ids) {
  if (ids.length === 0) return new Set();
  const found = new Set();
  for (let i = 0; i < ids.length; i += 500) {
    const batch = ids.slice(i, i + 500);
    const rows = await query(`
      SELECT id
      FROM \`${PROJECT}.${DATASET}.${table}\`
      WHERE id IN (${batch.map(sqlString).join(', ')})
    `);
    for (const row of rows) found.add(row.id);
  }
  return found;
}

async function insertNewRows(table, rows) {
  if (rows.length === 0) return 0;
  if (DRY_RUN) {
    log(`[dry-run] ${table}: ${rows.length} nuove righe`);
    return rows.length;
  }
  const existing = await existingIds(table, rows.map((row) => row.id));
  const fresh = rows.filter((row) => !existing.has(row.id));
  if (table === 'events') {
    await insertEventRows(fresh);
  } else {
    await insertBatches(table, fresh);
  }
  return fresh.length;
}

async function insertEventRows(rows) {
  if (DRY_RUN || rows.length === 0) {
    log(`${DRY_RUN ? '[dry-run] ' : ''}events: ${rows.length} righe`);
    return;
  }

  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    await dml(`
      INSERT INTO \`${PROJECT}.${DATASET}.events\`
        (id, title, description, event_type, occurred_at, date_text, date_precision,
         location, latitude, longitude, entity_ids, source_claim_ids, is_disputed,
         dispute_notes, created_at, updated_at)
      VALUES
        ${batch.map(eventSqlTuple).join(',\n        ')}
    `);
  }
}

function eventSqlTuple(row) {
  return `(${[
    sqlValue(row.id),
    sqlValue(row.title),
    sqlValue(row.description),
    sqlValue(row.event_type),
    sqlTimestamp(row.occurred_at),
    sqlValue(row.date_text),
    sqlValue(row.date_precision),
    sqlValue(row.location),
    sqlNumber(row.latitude),
    sqlNumber(row.longitude),
    sqlArray(row.entity_ids),
    sqlArray(row.source_claim_ids),
    row.is_disputed ? 'TRUE' : 'FALSE',
    sqlValue(row.dispute_notes),
    sqlTimestamp(row.created_at),
    sqlTimestamp(row.updated_at),
  ].join(', ')})`;
}

function sqlValue(value) {
  if (value == null || value === '') return 'NULL';
  return sqlString(String(value));
}

function sqlTimestamp(value) {
  if (!value) return 'NULL';
  return `TIMESTAMP(${sqlString(new Date(value).toISOString())})`;
}

function sqlNumber(value) {
  return Number.isFinite(value) ? String(value) : 'NULL';
}

function sqlArray(values) {
  if (!Array.isArray(values) || values.length === 0) return '[]';
  return `[${values.map((value) => sqlString(String(value))).join(', ')}]`;
}

async function listDiscoveryDocuments() {
  const docs = [];
  let pageToken = null;
  do {
    const params = new URLSearchParams({ pageSize: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const token = await getAccessToken();
    const res = await fetch(`${DE_BASE}/branches/0/documents?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Discovery list failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    docs.push(...(data.documents || []));
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return docs;
}

async function backfillDocuments() {
  log('Backfill documents da Discovery Engine...');
  const docs = await listDiscoveryDocuments();
  const now = new Date().toISOString();
  const rows = docs.map((doc) => {
    const sourceUri = doc.content?.uri || null;
    const id = documentIdFromName(doc.name) || idFor('doc', sourceUri);
    return {
      id,
      vertex_document_id: id,
      parent_document_id: null,
      title: doc.structData?.title || titleFromUri(sourceUri) || id,
      source_uri: sourceUri,
      normalized_uri: null,
      document_type: doc.structData?.document_type || inferDocumentType(sourceUri),
      institution: doc.structData?.institution || inferInstitution(sourceUri),
      year: doc.structData?.year ? Number(doc.structData.year) : inferYear(sourceUri),
      legislature: doc.structData?.legislature || inferLegislature(sourceUri),
      topic: doc.structData?.topic || null,
      ocr_quality: doc.structData?.ocr_quality || null,
      is_split: false,
      chunk_count: null,
      word_count: null,
      ingested_at: now,
      ingestion_job_id: 'discovery-engine-backfill',
      created_at: now,
      updated_at: now,
    };
  });

  if (REPLACE) await dml(`DELETE FROM \`${DATASET}.documents\` WHERE TRUE`);
  await insertBatches('documents', rows);
  log(`Documents: ${rows.length}`);
}

async function backfillAnchors() {
  log('Backfill source_anchors da claims...');
  const rows = await query(`
    SELECT id, document_id, document_uri, text, page_reference, created_at, updated_at
    FROM \`${PROJECT}.${DATASET}.claims\`
    ORDER BY created_at ASC
  `);
  const anchors = [];
  for (const row of rows) {
    const text = String(row.text || '').slice(0, 500);
    const pageNumber = row.page_reference != null ? Number(row.page_reference) : null;
    if (pageNumber) {
      anchors.push(anchorRow(row, 'page', `${row.id}-page`, text, pageNumber, 0.75));
    }
    if (text) {
      anchors.push(anchorRow(row, 'text_span', `${row.id}-text`, text, pageNumber, 0.55));
    }
  }
  if (REPLACE) await dml(`DELETE FROM \`${DATASET}.source_anchors\` WHERE TRUE`);
  await insertBatches('source_anchors', anchors);
  log(`Source anchors: ${anchors.length}`);
}

function anchorRow(row, type, id, text, pageNumber, confidence) {
  return {
    id,
    document_id: row.document_id,
    claim_id: row.id,
    event_id: null,
    anchor_type: type,
    page_number: pageNumber || null,
    text_quote: type === 'text_span' ? text : null,
    snippet: text,
    time_start_seconds: null,
    time_end_seconds: null,
    frame_reference: null,
    shot_reference: null,
    anchor_confidence: confidence,
    source_uri: row.document_uri || null,
    mime_type: inferMimeType(row.document_uri),
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString(),
  };
}

async function backfillEntities() {
  log(`Backfill entities AI-assisted, limit=${ENTITY_LIMIT}, threshold=${ENTITY_THRESHOLD}...`);
  const candidates = await query(`
    SELECT raw, COUNT(*) AS mention_count
    FROM \`${PROJECT}.${DATASET}.claims\`, UNNEST(entity_ids) AS raw
    WHERE raw IS NOT NULL AND LENGTH(TRIM(raw)) >= 2
    GROUP BY raw
    ORDER BY mention_count DESC, raw ASC
    LIMIT ${ENTITY_LIMIT}
  `);

  const accepted = [];
  const rawToEntityId = new Map();
  for (let i = 0; i < candidates.length; i += 80) {
    const batch = candidates.slice(i, i + 80);
    const result = await gemini.generateJson(entityPrompt(batch), 8192);
    const entities = Array.isArray(result?.entities) ? result.entities : [];
    for (const entity of entities) {
      if (!entity || Number(entity.confidence || 0) < ENTITY_THRESHOLD) continue;
      if (!['PERSON', 'ORGANIZATION', 'VESSEL', 'LOCATION'].includes(entity.entity_type)) continue;
      const canonical = String(entity.canonical_name || '').trim();
      if (canonical.length < 2) continue;
      const id = idFor(entity.entity_type.toLowerCase(), canonical);
      const aliases = [...new Set([...(entity.aliases || []), ...(entity.raw_names || [])].map(String).filter(Boolean))];
      accepted.push({
        id,
        entity_type: entity.entity_type,
        canonical_name: canonical,
        aliases,
        description: entity.description || null,
        role: entity.role || null,
        nationality: null,
        birth_year: null,
        death_year: null,
        org_type: entity.entity_type === 'ORGANIZATION' ? (entity.org_type || null) : null,
        vessel_type: entity.entity_type === 'VESSEL' ? (entity.vessel_type || null) : null,
        imo_number: null,
        latitude: null,
        longitude: null,
        location_type: entity.entity_type === 'LOCATION' ? (entity.location_type || null) : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      for (const raw of aliases) rawToEntityId.set(norm(raw), id);
    }
    log(`Entità batch ${Math.floor(i / 80) + 1}: accettate=${accepted.length}`);
  }

  const deduped = Array.from(new Map(accepted.map((row) => [row.id, row])).values());
  if (REPLACE) await dml(`DELETE FROM \`${DATASET}.entities\` WHERE TRUE`);
  await insertBatches('entities', deduped);
  await rewriteClaimEntityIds(rawToEntityId);
  log(`Entities: ${deduped.length}`);
}

function entityPrompt(candidates) {
  return `
Sei un archivista investigativo sul caso Moby Prince. Canonizza entità estratte automaticamente dai claim.

Obiettivo: alta precisione, poco rumore. Rifiuta frammenti OCR, pronomi, frasi comuni, ruoli generici non identificativi e nomi ambigui.

Tipi ammessi:
- PERSON
- ORGANIZATION
- VESSEL
- LOCATION

Regole:
- Accorpa alias evidenti nello stesso record.
- Mantieni navi come VESSEL anche se contengono sigle tipo M/C.
- Mantieni enti istituzionali come ORGANIZATION.
- Usa confidence >= 0.82 solo se sei abbastanza sicuro.
- Non inventare dati biografici.

Candidati raw con conteggio:
${candidates.map((c, idx) => `${idx + 1}. ${c.raw} (${c.mention_count})`).join('\n')}

Rispondi SOLO in JSON:
{
  "entities": [
    {
      "canonical_name": "Moby Prince",
      "entity_type": "VESSEL",
      "aliases": ["MOBY PRINCE"],
      "raw_names": ["MOBY PRINCE"],
      "role": "traghetto coinvolto nel disastro",
      "description": "Entità rilevante nel corpus",
      "org_type": null,
      "vessel_type": "ferry",
      "location_type": null,
      "confidence": 0.95
    }
  ]
}`.trim();
}

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

async function rewriteClaimEntityIds(rawToEntityId) {
  if (rawToEntityId.size === 0) return;
  const entries = Array.from(rawToEntityId.entries());
  for (let i = 0; i < entries.length; i += 250) {
    const batch = entries.slice(i, i + 250);
    const structs = batch
      .map(([raw, id]) => `STRUCT(${sqlString(raw)} AS raw_norm, ${sqlString(id)} AS entity_id)`)
      .join(', ');
    await dml(`
      UPDATE \`${DATASET}.claims\`
      SET entity_ids = ARRAY(
        SELECT DISTINCT COALESCE(m.entity_id, raw)
        FROM UNNEST(entity_ids) AS raw
        LEFT JOIN UNNEST([${structs}]) AS m
          ON LOWER(TRIM(raw)) = m.raw_norm
      )
      WHERE EXISTS (
        SELECT 1
        FROM UNNEST(entity_ids) AS raw
        WHERE LOWER(TRIM(raw)) IN (${batch.map(([raw]) => sqlString(raw)).join(', ')})
      )
    `);
  }
}

async function materializeProfiles() {
  log('Materializzazione profili entità...');
  const entities = await query(`
    SELECT e.id, e.entity_type, e.canonical_name, e.aliases, e.role, e.description,
           COALESCE(c.mention_count, 0) AS mention_count
    FROM \`${PROJECT}.${DATASET}.entities\` e
    LEFT JOIN (
      SELECT eid, COUNT(*) AS mention_count
      FROM \`${PROJECT}.${DATASET}.claims\`, UNNEST(entity_ids) AS eid
      GROUP BY eid
    ) c ON c.eid = e.id
    ORDER BY mention_count DESC, e.canonical_name ASC
    LIMIT 500
  `);
  if (REPLACE) await dml(`DELETE FROM \`${DATASET}.entity_profiles\` WHERE TRUE`);
  const rows = [];
  for (const entity of entities) {
    rows.push({
      entity_id: entity.id,
      summary: profileSummary(entity),
      aliases: Array.isArray(entity.aliases) ? entity.aliases : [],
      role: entity.role || null,
      summary_version: 1,
      source_claim_ids: [],
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  await insertBatches('entity_profiles', rows);
  log(`Entity profiles: ${rows.length}`);
}

async function backfillEvents() {
  log(`Backfill events AI-assisted, threshold=${EVENT_THRESHOLD}, batch=${EVENT_BATCH_SIZE}, progressive=${EVENT_PROGRESSIVE}...`);
  const limitClause = EVENT_LIMIT > 0
    ? `LIMIT ${EVENT_LIMIT} OFFSET ${EVENT_OFFSET}`
    : (EVENT_OFFSET > 0 ? `LIMIT 100000 OFFSET ${EVENT_OFFSET}` : '');
  const claims = await query(`
    SELECT id, text, document_id, document_uri, entity_ids, confidence, created_at
    FROM \`${PROJECT}.${DATASET}.claims\`
    WHERE REGEXP_CONTAINS(
      LOWER(text),
      r'(19[0-9]{2}|20[0-9]{2}|10 aprile|aprile 1991|\\bore\\b|\\balle\\b|\\b[0-2]?[0-9][:.][0-5][0-9]\\b|collisione|incendio|soccor|audizione|commissione|sentenza|relazione|delibera|perizia)'
    )
    ORDER BY document_id, created_at ASC
    ${limitClause}
  `);

  log(`Claim candidati per eventi: ${claims.length}`);
  const byKey = new Map();
  let insertedProgressively = 0;

  if (REPLACE) await dml(`DELETE FROM \`${DATASET}.events\` WHERE TRUE`);

  for (let i = 0; i < claims.length; i += EVENT_BATCH_SIZE) {
    const batch = claims.slice(i, i + EVENT_BATCH_SIZE);
    const batchClaimsById = new Map(batch.map((claim) => [claim.id, claim]));
    const beforeKeys = new Set(byKey.keys());
    let result;
    try {
      result = await gemini.generateJson(eventPrompt(batch), 8192);
    } catch (err) {
      console.warn(`Batch eventi ${Math.floor(i / EVENT_BATCH_SIZE) + 1} fallito: ${err.message}`);
      continue;
    }
    const events = Array.isArray(result?.events) ? result.events : [];
    for (const event of events) {
      const confidence = Number(event.confidence || 0);
      if (confidence < EVENT_THRESHOLD) continue;
      const sourceClaimIds = Array.isArray(event.source_claim_ids)
        ? event.source_claim_ids.filter(Boolean).map(String).filter((id) => batchClaimsById.has(id))
        : [];
      if (sourceClaimIds.length === 0) continue;

      const rawDateIso = normalizeDateIso(event.date_iso);
      const dateText = String(event.date_text || rawDateIso || '').trim();
      const dateIso = rawDateIso || inferDateIsoFromItalianText(dateText);
      if (!dateIso && !dateText) continue;

      const title = String(event.title || '').trim().slice(0, 180);
      if (title.length < 4) continue;
      const description = String(event.description || '').trim().slice(0, 1000) || null;
      if (isKnownDisasterDateOcrError({ ...event, title, description, dateIso, dateText })) continue;

      const key = [
        dateIso || dateText.toLowerCase(),
        title.toLowerCase().replace(/[^a-z0-9àèéìòóù]+/gi, ' ').trim(),
      ].join('|');

      const entityIds = new Set(
        Array.isArray(event.entity_ids)
          ? event.entity_ids.map(String).filter((id) => /^(person|organization|vessel|location)-/.test(id))
          : [],
      );
      for (const claim of sourceClaimIds.map((id) => batchClaimsById.get(id)).filter(Boolean)) {
        for (const entityId of claim.entity_ids || []) {
          if (/^(person|organization|vessel|location)-/.test(String(entityId))) entityIds.add(entityId);
        }
      }

      if (!byKey.has(key)) {
        byKey.set(key, {
          id: idFor('event', key),
          title,
          description,
          event_type: normalizeEventType(event.event_type),
          occurred_at: dateIso ? `${dateIso}T00:00:00.000Z` : null,
          date_text: dateText || null,
          date_precision: normalizePrecision(event.date_precision, Boolean(dateIso)),
          location: event.location ? String(event.location).trim().slice(0, 200) : null,
          latitude: null,
          longitude: null,
          entity_ids: [],
          source_claim_ids: [],
          is_disputed: false,
          dispute_notes: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          _entitySet: entityIds,
          _claimSet: new Set(sourceClaimIds),
        });
      } else {
        const current = byKey.get(key);
        for (const claimId of sourceClaimIds) current._claimSet.add(claimId);
        for (const entityId of entityIds) current._entitySet.add(entityId);
      }
    }

    if (EVENT_PROGRESSIVE) {
      const newRows = Array.from(byKey.entries())
        .filter(([key]) => !beforeKeys.has(key))
        .map(([, event]) => eventToRow(event));
      insertedProgressively += await insertNewRows('events', newRows);
    }

    log(
      `Eventi batch ${Math.floor(i / EVENT_BATCH_SIZE) + 1}/${Math.ceil(claims.length / EVENT_BATCH_SIZE)}: ` +
      `${byKey.size} estratti, ${insertedProgressively} scritti`,
    );
  }

  const rows = Array.from(byKey.values()).map(eventToRow)
    .sort((a, b) => String(a.occurred_at || a.date_text).localeCompare(String(b.occurred_at || b.date_text)));

  if (!EVENT_PROGRESSIVE) await insertBatches('events', rows);
  log(`Events: ${EVENT_PROGRESSIVE ? insertedProgressively : rows.length}`);
}

function eventToRow(event) {
  const { _entitySet, _claimSet, ...row } = event;
  row.entity_ids = Array.from(_entitySet);
  row.source_claim_ids = Array.from(_claimSet);
  return row;
}

function eventPrompt(claims) {
  return `
Sei un archivista investigativo sul caso Moby Prince. Estrai SOLO eventi storici verificabili dai claim.

Alta precisione:
- non creare eventi se il claim è troppo vago
- non fondere presidenti, commissioni o ruoli se appartengono a date/legislature diverse
- includi date inferite solo se forti e marca date_precision="inferred"
- preferisci meno eventi ma puliti
- source_claim_ids deve contenere gli ID claim che supportano l'evento

Tipi evento ammessi:
collision, fire, rescue, communication, navigation, administrative, judicial, parliamentary, investigation, technical, event

Claim:
${claims.map((claim, index) => `${index + 1}. [${claim.id}] ${claim.text}`).join('\n')}

Rispondi SOLO in JSON:
{
  "events": [
    {
      "title": "Collisione tra Moby Prince e Agip Abruzzo",
      "description": "Sintesi prudente di 1-2 frasi.",
      "event_type": "collision",
      "date_iso": "1991-04-10",
      "date_text": "10 aprile 1991",
      "date_precision": "day",
      "location": "Rada di Livorno",
      "entity_ids": [],
      "source_claim_ids": ["claim-id"],
      "confidence": 0.91
    }
  ]
}`.trim();
}

function profileSummary(entity) {
  const role = entity.role ? ` ${entity.role}` : '';
  const type = {
    PERSON: 'persona',
    ORGANIZATION: 'ente',
    VESSEL: 'nave',
    LOCATION: 'luogo',
  }[entity.entity_type] || 'entità';
  return `${entity.canonical_name} è una ${type}${role ? ` collegata al caso Moby Prince come ${role.trim()}` : ' citata nel corpus Moby Prince'}.`;
}

async function main() {
  log(`Backfill strutturato avviato. phases=${Array.from(PHASES).join(',')} replace=${REPLACE} dryRun=${DRY_RUN}`);
  if (PHASES.has('documents')) await backfillDocuments();
  if (PHASES.has('anchors')) await backfillAnchors();
  if (PHASES.has('entities')) await backfillEntities();
  if (PHASES.has('events')) await backfillEvents();
  if (PHASES.has('profiles')) await materializeProfiles();
  log('Backfill strutturato completato.');
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
