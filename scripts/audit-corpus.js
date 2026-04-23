#!/usr/bin/env node
'use strict';

/**
 * Corpus audit for the structured evidence layer.
 *
 * Produces a repeatable report across:
 * - GCS raw / normalized buckets
 * - Discovery Engine documents
 * - BigQuery evidence tables
 * - Core mismatch classes (orphans, missing links, unusable provenance)
 *
 * Usage:
 *   node scripts/audit-corpus.js
 *   node scripts/audit-corpus.js --format=json
 *   node scripts/audit-corpus.js --format=markdown --output=docs/reports/corpus-audit.md
 */

const fs = require('fs');
const path = require('path');

loadEnv(path.join(__dirname, '../backend/.env'));

const { getAccessToken } = require('../backend/services/auth');
const bq = require('../backend/services/bigquery');
const de = require('../backend/services/discoveryEngine');

const PROJECT = process.env.BQ_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const DATASET = process.env.BQ_DATASET_ID || 'evidence';
const LOCATION = process.env.BQ_LOCATION || 'EU';
const RAW_BUCKET = process.env.BUCKET_RAW || process.env.GCS_BUCKET || null;
const NORMALIZED_BUCKET = process.env.BUCKET_NORMALIZED || null;
const FORMAT = valueOf('--format', 'text');
const OUTPUT = valueOf('--output', '');

if (!PROJECT) {
  console.error('GOOGLE_CLOUD_PROJECT/BQ_PROJECT_ID non impostato.');
  process.exit(1);
}

async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    project: PROJECT,
    dataset: DATASET,
    location: LOCATION,
    buckets: {
      raw: RAW_BUCKET,
      normalized: NORMALIZED_BUCKET,
    },
    counts: await collectCounts(),
    mismatches: await collectMismatches(),
  };

  const rendered = render(report, FORMAT);
  if (OUTPUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUTPUT)), { recursive: true });
    fs.writeFileSync(path.resolve(OUTPUT), rendered, 'utf8');
  }
  process.stdout.write(rendered);
}

async function collectCounts() {
  const [gcsRaw, gcsNormalized, deDocuments, bqCounts] = await Promise.all([
    RAW_BUCKET ? listBucketCounts(RAW_BUCKET) : Promise.resolve(null),
    NORMALIZED_BUCKET ? listBucketCounts(NORMALIZED_BUCKET) : Promise.resolve(null),
    listDeDocumentCount(),
    listBqCounts(),
  ]);

  return {
    gcs: {
      raw: gcsRaw,
      normalized: gcsNormalized,
    },
    discoveryEngine: {
      documents: deDocuments,
    },
    bigQuery: bqCounts,
  };
}

async function collectMismatches() {
  const rows = await Promise.all([
    safeQuerySingleValue(['events', 'claims'], `
      SELECT COUNT(*) AS cnt
      FROM (
        SELECT e.id
        FROM \`${PROJECT}.${DATASET}.events\` e
        LEFT JOIN UNNEST(IFNULL(e.source_claim_ids, ARRAY<STRING>[])) claim_id
        LEFT JOIN \`${PROJECT}.${DATASET}.claims\` c ON c.id = claim_id
        GROUP BY e.id
        HAVING COUNT(c.id) = 0
      )
    `),
    safeQuerySingleValue(['events', 'entities'], `
      SELECT COUNT(*) AS cnt
      FROM \`${PROJECT}.${DATASET}.events\` e,
      UNNEST(IFNULL(e.entity_ids, ARRAY<STRING>[])) entity_id
      LEFT JOIN \`${PROJECT}.${DATASET}.entities\` ent ON ent.id = entity_id
      WHERE ent.id IS NULL
    `),
    safeQuerySingleValue(['claims', 'documents'], `
      SELECT COUNT(*) AS cnt
      FROM \`${PROJECT}.${DATASET}.claims\` c
      LEFT JOIN \`${PROJECT}.${DATASET}.documents\` d ON d.id = c.document_id
      WHERE d.id IS NULL
    `),
    safeQuerySingleValue(['source_anchors', 'documents'], `
      SELECT COUNT(*) AS cnt
      FROM \`${PROJECT}.${DATASET}.source_anchors\` a
      LEFT JOIN \`${PROJECT}.${DATASET}.documents\` d ON d.id = a.document_id
      WHERE d.id IS NULL
    `),
    safeQuerySingleValue(['source_anchors'], `
      SELECT COUNT(*) AS cnt
      FROM \`${PROJECT}.${DATASET}.source_anchors\`
      WHERE anchor_type = 'page'
    `),
    safeQuerySingleValue(['events'], `
      SELECT COUNT(*) AS cnt
      FROM \`${PROJECT}.${DATASET}.events\`
      WHERE occurred_at IS NULL
        AND REGEXP_CONTAINS(
          LOWER(COALESCE(date_text, '')),
          r'\\b\\d{1,2}\\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\\s+(19|20)\\d{2}\\b'
        )
    `),
    safeQuerySingleValue(['documents'], `
      SELECT COUNT(*) AS cnt
      FROM \`${PROJECT}.${DATASET}.documents\`
      WHERE source_uri IS NULL OR TRIM(source_uri) = ''
    `),
    safeQuerySingleValue(['entity_profiles'], `
      SELECT COUNT(*) AS cnt
      FROM \`${PROJECT}.${DATASET}.entity_profiles\`
      WHERE summary IS NULL OR TRIM(summary) = ''
    `),
  ]);

  const [eventsWithoutRealSources, invalidEventEntityIds, claimsWithoutDocuments, anchorsWithoutDocuments,
    pageAnchors, nullDateWithItalianDay, documentsWithoutSourceUri, emptyEntityProfiles] = rows;

  const samples = await Promise.all([
    safeQueryRows(['events', 'claims'], `
      SELECT id, title, date_text
      FROM \`${PROJECT}.${DATASET}.events\` e
      LEFT JOIN UNNEST(IFNULL(e.source_claim_ids, ARRAY<STRING>[])) claim_id
      LEFT JOIN \`${PROJECT}.${DATASET}.claims\` c ON c.id = claim_id
      GROUP BY id, title, date_text
      HAVING COUNT(c.id) = 0
      LIMIT 10
    `),
    safeQueryRows(['entities'], `
      SELECT id, canonical_name, entity_type
      FROM \`${PROJECT}.${DATASET}.entities\`
      ORDER BY updated_at DESC
      LIMIT 10
    `),
  ]);

  return {
    eventsWithoutRealSources,
    invalidEventEntityIds,
    claimsWithoutDocuments,
    anchorsWithoutDocuments,
    pageAnchors,
    nullDateWithItalianDay,
    documentsWithoutSourceUri,
    emptyEntityProfiles,
    samples: {
      eventsWithoutSources: samples[0],
      entities: samples[1],
    },
  };
}

async function listBqCounts() {
  const tables = ['documents', 'claims', 'events', 'entities', 'source_anchors', 'entity_profiles', 'evidence_links'];
  const entries = await Promise.all(tables.map(async (table) => {
    if (!(await bq.tableExists(table).catch(() => false))) return [table, null];
    const rows = await bq.query(`SELECT COUNT(*) AS row_count FROM \`${PROJECT}.${DATASET}.${table}\``);
    return [table, Number(rows[0]?.row_count || 0)];
  }));
  return Object.fromEntries(entries);
}

async function listDeDocumentCount() {
  let count = 0;
  let pageToken = null;
  do {
    const data = await de.listDocuments(pageToken, 100);
    count += (data.documents || []).length;
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return count;
}

async function listBucketCounts(bucket) {
  let count = 0;
  let pageToken = null;
  do {
    const data = await listBucketObjects(bucket, pageToken);
    count += (data.items || []).length;
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return count;
}

async function listBucketObjects(bucket, pageToken = null) {
  const token = await getAccessToken();
  const params = new URLSearchParams({
    maxResults: '1000',
    projection: 'noAcl',
    fields: 'nextPageToken,items(name)',
  });
  if (pageToken) params.set('pageToken', pageToken);
  const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`GCS list failed for ${bucket} (${res.status}): ${detail.slice(0, 200)}`);
  }
  return res.json();
}

async function querySingleValue(sql) {
  const rows = await queryRows(sql);
  return Number(rows[0]?.cnt || 0);
}

async function queryRows(sql) {
  return bq.query(sql);
}

async function safeQuerySingleValue(requiredTables, sql) {
  if (!(await allTablesExist(requiredTables))) return null;
  return querySingleValue(sql);
}

async function safeQueryRows(requiredTables, sql) {
  if (!(await allTablesExist(requiredTables))) return [];
  return queryRows(sql);
}

async function allTablesExist(tables) {
  const checks = await Promise.all(tables.map((table) => bq.tableExists(table).catch(() => false)));
  return checks.every(Boolean);
}

function render(report, format) {
  if (format === 'json') return `${JSON.stringify(report, null, 2)}\n`;
  if (format === 'markdown' || format === 'md') return renderMarkdown(report);
  return renderText(report);
}

function renderText(report) {
  const lines = [];
  lines.push(`Corpus audit — ${report.generatedAt}`);
  lines.push(`Project: ${report.project}`);
  lines.push(`Dataset: ${report.dataset}`);
  lines.push('');
  lines.push('Counts');
  lines.push(`- GCS raw: ${report.counts.gcs.raw ?? 'n/a'}`);
  lines.push(`- GCS normalized: ${report.counts.gcs.normalized ?? 'n/a'}`);
  lines.push(`- DE documents: ${report.counts.discoveryEngine.documents}`);
  for (const [key, value] of Object.entries(report.counts.bigQuery)) {
    lines.push(`- BQ ${key}: ${value}`);
  }
  lines.push('');
  lines.push('Mismatches');
  for (const [key, value] of Object.entries(report.mismatches)) {
    if (key === 'samples') continue;
    lines.push(`- ${key}: ${value}`);
  }
  return `${lines.join('\n')}\n`;
}

function renderMarkdown(report) {
  return [
    `# Corpus Audit`,
    '',
    `Generato: ${report.generatedAt}`,
    '',
    `## Counts`,
    '',
    `| Area | Count |`,
    `|---|---:|`,
    `| GCS raw | ${report.counts.gcs.raw ?? 'n/a'} |`,
    `| GCS normalized | ${report.counts.gcs.normalized ?? 'n/a'} |`,
    `| Discovery Engine documents | ${report.counts.discoveryEngine.documents} |`,
    ...Object.entries(report.counts.bigQuery).map(([key, value]) => `| BigQuery ${key} | ${value} |`),
    '',
    `## Mismatches`,
    '',
    `| Check | Value |`,
    `|---|---:|`,
    ...Object.entries(report.mismatches)
      .filter(([key]) => key !== 'samples')
      .map(([key, value]) => `| ${key} | ${value} |`),
    '',
    `## Samples`,
    '',
    '```json',
    JSON.stringify(report.mismatches.samples, null, 2),
    '```',
    '',
  ].join('\n');
}

function valueOf(flag, fallback) {
  const arg = process.argv.slice(2).find((item) => item.startsWith(`${flag}=`));
  return arg ? arg.slice(flag.length + 1) : fallback;
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

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
