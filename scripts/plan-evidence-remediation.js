#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

loadEnv(path.join(__dirname, '../backend/.env'));

const bq = require('../backend/services/bigquery');

const PROJECT = process.env.BQ_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const DATASET = process.env.BQ_DATASET_ID || 'evidence';
const FORMAT = valueOf('--format', 'text');
const OUTPUT = valueOf('--output', '');

if (!PROJECT) {
  console.error('GOOGLE_CLOUD_PROJECT/BQ_PROJECT_ID non impostato.');
  process.exit(1);
}

async function main() {
  const [
    orphanEvents,
    orphanAnchorsByDocument,
    duplicateDocuments,
    normalizedDocuments,
  ] = await Promise.all([
    query(`
      SELECT e.id, e.title, e.date_text, e.occurred_at, e.source_claim_ids
      FROM \`${PROJECT}.${DATASET}.events\` e
      LEFT JOIN UNNEST(IFNULL(e.source_claim_ids, ARRAY<STRING>[])) claim_id
      LEFT JOIN \`${PROJECT}.${DATASET}.claims\` c ON c.id = claim_id
      GROUP BY e.id, e.title, e.date_text, e.occurred_at, e.source_claim_ids
      HAVING COUNT(c.id) = 0
      ORDER BY e.occurred_at ASC NULLS LAST, e.title ASC
    `),
    query(`
      SELECT a.document_id, COUNT(*) AS orphan_anchors, COUNT(DISTINCT a.claim_id) AS orphan_claim_ids
      FROM \`${PROJECT}.${DATASET}.source_anchors\` a
      LEFT JOIN \`${PROJECT}.${DATASET}.claims\` c ON c.id = a.claim_id
      WHERE a.claim_id IS NOT NULL AND c.id IS NULL
      GROUP BY a.document_id
      ORDER BY orphan_anchors DESC, document_id
    `),
    query(`
      SELECT source_uri, COUNT(*) AS row_count, ARRAY_AGG(id ORDER BY created_at ASC LIMIT 10) AS document_ids
      FROM \`${PROJECT}.${DATASET}.documents\`
      WHERE source_uri IS NOT NULL AND TRIM(source_uri) != ''
      GROUP BY source_uri
      HAVING COUNT(*) > 1
      ORDER BY row_count DESC, source_uri
    `),
    query(`
      SELECT id, title, source_uri, normalized_uri, chunk_count, reprocessing_state
      FROM \`${PROJECT}.${DATASET}.documents\`
      WHERE normalized_uri IS NOT NULL AND TRIM(normalized_uri) != ''
      ORDER BY updated_at DESC
    `),
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    project: PROJECT,
    dataset: DATASET,
    summary: {
      orphanEvents: orphanEvents.length,
      orphanAnchorDocuments: orphanAnchorsByDocument.length,
      orphanAnchors: orphanAnchorsByDocument.reduce((sum, row) => sum + Number(row.orphan_anchors || 0), 0),
      duplicateSourceUris: duplicateDocuments.length,
      normalizedDocuments: normalizedDocuments.length,
    },
    orphanEvents,
    orphanAnchorsByDocument,
    duplicateDocuments,
    normalizedDocuments,
    recommendedOrder: [
      'Stop broad corpus batches until claim IDs are deterministic in production code.',
      'For already reprocessed documents, wait for BigQuery streaming buffers to drain before destructive cleanup.',
      'Delete orphan source_anchors where claim_id no longer exists, scoped by affected document_id.',
      'Resolve duplicate documents by migrating or dropping the filename-derived duplicate after checking dependent claims/events.',
      'Regenerate events from the fully reprocessed claims layer, then replace the historical events table in one controlled window.',
      'Run audit-corpus and require orphanEvents=0, anchorsWithoutClaims=0, duplicateDocumentSourceUris=0 before demo use.',
    ],
  };

  const rendered = FORMAT === 'json' ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report);
  if (OUTPUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUTPUT)), { recursive: true });
    fs.writeFileSync(path.resolve(OUTPUT), rendered, 'utf8');
  }
  process.stdout.write(rendered);
}

function renderMarkdown(report) {
  return [
    '# Evidence Remediation Plan',
    '',
    `Generato: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    '| Check | Value |',
    '|---|---:|',
    ...Object.entries(report.summary).map(([key, value]) => `| ${key} | ${value} |`),
    '',
    '## Recommended Order',
    '',
    ...report.recommendedOrder.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Orphan Events',
    '',
    '| Event ID | Date | Title |',
    '|---|---|---|',
    ...report.orphanEvents.slice(0, 50).map((row) =>
      `| ${row.id} | ${row.date_text || row.occurred_at || ''} | ${escapePipes(row.title || '')} |`
    ),
    '',
    '## Orphan Anchors By Document',
    '',
    '| Document ID | Orphan anchors | Orphan claim IDs |',
    '|---|---:|---:|',
    ...report.orphanAnchorsByDocument.map((row) =>
      `| ${row.document_id} | ${row.orphan_anchors} | ${row.orphan_claim_ids} |`
    ),
    '',
    '## Duplicate Documents',
    '',
    '```json',
    JSON.stringify(report.duplicateDocuments, null, 2),
    '```',
    '',
    '## Normalized Documents',
    '',
    '| Document ID | Chunks | State | Title |',
    '|---|---:|---|---|',
    ...report.normalizedDocuments.map((row) =>
      `| ${row.id} | ${row.chunk_count || ''} | ${row.reprocessing_state || ''} | ${escapePipes(row.title || '')} |`
    ),
    '',
  ].join('\n');
}

function escapePipes(value) {
  return String(value).replace(/\|/g, '\\|');
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

function query(sql) {
  return bq.query(sql);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
