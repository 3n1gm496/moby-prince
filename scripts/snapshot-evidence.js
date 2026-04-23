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
const EXPIRATION_DAYS = Number(valueOf('--expiration-days', '30'));
const LABEL = sanitizeLabel(valueOf('--label', `pre_reprocessing_${timestampCompact()}`));
const DRY_RUN = process.argv.includes('--dry-run');

const TABLES = [
  'documents',
  'claims',
  'events',
  'entities',
  'source_anchors',
  'entity_profiles',
  'evidence_links',
];

if (!PROJECT) {
  console.error('GOOGLE_CLOUD_PROJECT/BQ_PROJECT_ID non impostato.');
  process.exit(1);
}

async function main() {
  const createdAt = new Date().toISOString();
  const results = [];

  for (const table of TABLES) {
    const exists = await bq.tableExists(table).catch(() => false);
    if (!exists) {
      results.push({ sourceTable: table, snapshotTable: null, rowCount: null, status: 'skipped_missing' });
      continue;
    }

    const snapshotTable = `${table}__${LABEL}`;
    const rowCount = await countRows(table);

    if (!DRY_RUN) {
      await bq.query(`
        CREATE SNAPSHOT TABLE \`${PROJECT}.${DATASET}.${snapshotTable}\`
        CLONE \`${PROJECT}.${DATASET}.${table}\`
        OPTIONS (
          expiration_timestamp = TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL ${EXPIRATION_DAYS} DAY)
        )
      `);
    }

    results.push({ sourceTable: table, snapshotTable, rowCount, status: DRY_RUN ? 'planned' : 'created' });
  }

  const report = {
    createdAt,
    project: PROJECT,
    dataset: DATASET,
    label: LABEL,
    expirationDays: EXPIRATION_DAYS,
    dryRun: DRY_RUN,
    snapshots: results,
  };

  const rendered = render(report, FORMAT);
  if (OUTPUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUTPUT)), { recursive: true });
    fs.writeFileSync(path.resolve(OUTPUT), rendered, 'utf8');
  }
  process.stdout.write(rendered);
}

async function countRows(table) {
  const rows = await bq.query(`SELECT COUNT(*) AS row_count FROM \`${PROJECT}.${DATASET}.${table}\``);
  return Number(rows[0]?.row_count || 0);
}

function render(report, format) {
  if (format === 'json') return `${JSON.stringify(report, null, 2)}\n`;
  if (format === 'markdown' || format === 'md') {
    return [
      '# Evidence Snapshot',
      '',
      `Generato: ${report.createdAt}`,
      '',
      `- progetto: \`${report.project}\``,
      `- dataset: \`${report.dataset}\``,
      `- label: \`${report.label}\``,
      `- expirationDays: \`${report.expirationDays}\``,
      `- dryRun: \`${report.dryRun}\``,
      '',
      '| Source table | Snapshot table | Rows | Status |',
      '|---|---|---:|---|',
      ...report.snapshots.map((row) =>
        `| ${row.sourceTable} | ${row.snapshotTable || 'n/a'} | ${row.rowCount ?? 'n/a'} | ${row.status} |`),
      '',
    ].join('\n');
  }

  const lines = [
    `Evidence snapshot — ${report.createdAt}`,
    `project: ${report.project}`,
    `dataset: ${report.dataset}`,
    `label: ${report.label}`,
    `expirationDays: ${report.expirationDays}`,
    `dryRun: ${report.dryRun}`,
    '',
  ];
  for (const row of report.snapshots) {
    lines.push(`- ${row.sourceTable}: ${row.snapshotTable || 'n/a'} (${row.rowCount ?? 'n/a'} rows) [${row.status}]`);
  }
  return `${lines.join('\n')}\n`;
}

function valueOf(flag, fallback) {
  const arg = process.argv.slice(2).find((item) => item.startsWith(`${flag}=`));
  return arg ? arg.slice(flag.length + 1) : fallback;
}

function timestampCompact() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    't',
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join('');
}

function sanitizeLabel(label) {
  return label.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
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
