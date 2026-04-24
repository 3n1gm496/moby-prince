#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

loadEnv(path.join(__dirname, '../backend/.env'));

const backendBq = require('../backend/services/bigquery');

const PROJECT = process.env.BQ_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const DATASET = process.env.BQ_DATASET_ID || 'evidence';
const INVENTORY_PATH = valueOf('--inventory', path.join(__dirname, '../docs/reports/corpus-inventory-latest.json'));
const LIMIT = parseInt(valueOf('--limit', '0'), 10) || 0;
const OFFSET = parseInt(valueOf('--offset', '0'), 10) || 0;
const EXECUTE = process.argv.includes('--execute');
const ONLY_MISSING = !process.argv.includes('--include-reprocessed');
const STOP_ON_ERROR = process.argv.includes('--stop-on-error');
const BACKFILL_ANCHORS = process.argv.includes('--backfill-anchors');
const REPORT_JSON = valueOf('--json-output', path.join(__dirname, '../docs/reports/pdf-reprocessing-batch-latest.json'));
const REPORT_MD = valueOf('--output', path.join(__dirname, '../docs/reports/pdf-reprocessing-batch-latest.md'));
const ARCHIVE_REPORTS = EXECUTE && !process.argv.includes('--no-archive-report');

if (!PROJECT) {
  console.error('GOOGLE_CLOUD_PROJECT/BQ_PROJECT_ID non impostato.');
  process.exit(1);
}

async function main() {
  if (!fs.existsSync(INVENTORY_PATH)) {
    throw new Error(`Inventory file non trovato: ${INVENTORY_PATH}`);
  }

  const inventoryReport = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
  const inventory = Array.isArray(inventoryReport.inventory) ? inventoryReport.inventory : [];
  const corpusPdfs = inventory
    .filter((row) => row.classification === 'corpus' && row.ext === 'pdf')
    .sort((a, b) => String(a.uri).localeCompare(String(b.uri)));

  const stateByUri = await loadDocumentStatesByUri();
  const candidates = corpusPdfs.filter((row) => {
    if (!ONLY_MISSING) return true;
    const states = stateByUri.get(row.uri) || [];
    return !states.some((state) =>
      state.normalized_uri && state.reprocessing_state === 'normalized_children_ready'
    );
  });
  const selected = candidates.slice(OFFSET, LIMIT > 0 ? OFFSET + LIMIT : undefined);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: EXECUTE ? 'execute' : 'dry-run',
    project: PROJECT,
    dataset: DATASET,
    inventoryPath: INVENTORY_PATH,
    totalCorpusPdfs: corpusPdfs.length,
    candidatesAfterFiltering: candidates.length,
    offset: OFFSET,
    limit: LIMIT,
    selectedCount: selected.length,
    onlyMissing: ONLY_MISSING,
    stopOnError: STOP_ON_ERROR,
    backfillAnchors: BACKFILL_ANCHORS,
    anchorBackfill: null,
    results: [],
  };

  for (const [index, doc] of selected.entries()) {
    const item = {
      index: OFFSET + index,
      uri: doc.uri,
      documentId: doc.documentId,
      title: doc.title,
      status: EXECUTE ? 'pending' : 'planned',
      startedAt: null,
      finishedAt: null,
      exitCode: null,
    };
    report.results.push(item);

    if (!EXECUTE) continue;

    item.startedAt = new Date().toISOString();
    const exitCode = await runIngest(doc.uri);
    item.finishedAt = new Date().toISOString();
    item.exitCode = exitCode;
    item.status = exitCode === 0 ? 'completed' : 'failed';

    writeReports(report);
    if (exitCode !== 0 && STOP_ON_ERROR) break;
  }

  if (EXECUTE && BACKFILL_ANCHORS) {
    const completedDocumentIds = report.results
      .filter((row) => row.status === 'completed' && row.documentId)
      .map((row) => row.documentId);
    report.anchorBackfill = await runAnchorBackfill(completedDocumentIds);
  }

  writeReports(report);
  process.stdout.write(renderText(report));
}

async function loadDocumentStatesByUri() {
  const rows = await backendBq.query(`
    SELECT id, source_uri, normalized_uri, reprocessing_state
    FROM \`${PROJECT}.${DATASET}.documents\`
  `);
  const byUri = new Map();
  for (const row of rows) {
    if (!row.source_uri) continue;
    if (!byUri.has(row.source_uri)) byUri.set(row.source_uri, []);
    byUri.get(row.source_uri).push(row);
  }
  return byUri;
}

function runIngest(uri) {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      DOCAI_FORCE_ALL_PDFS: 'true',
      INDEX_SKIP_NORMALIZED_CHILDREN: 'true',
      BUCKET_RAW: process.env.BUCKET_RAW || process.env.GCS_BUCKET || 'moby-prince',
      BUCKET_NORMALIZED: process.env.BUCKET_NORMALIZED || `${process.env.GCS_BUCKET || 'moby-prince'}-normalized`,
      BUCKET_QUARANTINE: process.env.BUCKET_QUARANTINE || `${process.env.GCS_BUCKET || 'moby-prince'}-quarantine`,
      DOCAI_LOCATION: process.env.DOCAI_LOCATION || 'eu',
    };
    const child = spawn(
      process.execPath,
      ['ingestion/cloudrun/entrypoint.js', 'ingest', uri],
      {
        cwd: path.join(__dirname, '..'),
        env,
        stdio: 'inherit',
      },
    );
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

function runAnchorBackfill(documentIds) {
  return new Promise((resolve) => {
    const uniqueIds = [...new Set(documentIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      resolve({ status: 'skipped', documentIds: [], exitCode: 0 });
      return;
    }
    const child = spawn(
      process.execPath,
      [
        'ingestion/scripts/backfill-source-anchors.js',
        ...uniqueIds.map((id) => `--document-id=${id}`),
      ],
      {
        cwd: path.join(__dirname, '..'),
        env: process.env,
        stdio: 'inherit',
      },
    );
    child.on('close', (code) => resolve({
      status: code === 0 ? 'completed' : 'failed',
      documentIds: uniqueIds,
      exitCode: code ?? 1,
    }));
    child.on('error', (err) => resolve({
      status: 'failed',
      documentIds: uniqueIds,
      exitCode: 1,
      error: err.message,
    }));
  });
}

function writeReports(report) {
  if (REPORT_JSON) {
    fs.mkdirSync(path.dirname(path.resolve(REPORT_JSON)), { recursive: true });
    fs.writeFileSync(path.resolve(REPORT_JSON), JSON.stringify(report, null, 2), 'utf8');
  }
  if (REPORT_MD) {
    fs.mkdirSync(path.dirname(path.resolve(REPORT_MD)), { recursive: true });
    fs.writeFileSync(path.resolve(REPORT_MD), renderMarkdown(report), 'utf8');
  }
  if (ARCHIVE_REPORTS) {
    const stamp = report.generatedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z').toLowerCase();
    const archiveBase = path.join(__dirname, `../docs/reports/pdf-reprocessing-batch-${stamp}`);
    fs.writeFileSync(`${archiveBase}.json`, JSON.stringify(report, null, 2), 'utf8');
    fs.writeFileSync(`${archiveBase}.md`, renderMarkdown(report), 'utf8');
  }
}

function renderText(report) {
  const completed = report.results.filter((row) => row.status === 'completed').length;
  const failed = report.results.filter((row) => row.status === 'failed').length;
  return [
    `PDF reprocessing batch - ${report.generatedAt}`,
    `mode: ${report.mode}`,
    `totalCorpusPdfs: ${report.totalCorpusPdfs}`,
    `candidatesAfterFiltering: ${report.candidatesAfterFiltering}`,
    `selectedCount: ${report.selectedCount}`,
    `completed: ${completed}`,
    `failed: ${failed}`,
    `anchorBackfill: ${report.anchorBackfill?.status || 'not-run'}`,
    `reportJson: ${REPORT_JSON}`,
    `reportMarkdown: ${REPORT_MD}`,
    '',
  ].join('\n');
}

function renderMarkdown(report) {
  const completed = report.results.filter((row) => row.status === 'completed').length;
  const failed = report.results.filter((row) => row.status === 'failed').length;
  return [
    '# PDF Reprocessing Batch',
    '',
    `Generato: ${report.generatedAt}`,
    '',
    '| Campo | Valore |',
    '|---|---:|',
    `| mode | ${report.mode} |`,
    `| totalCorpusPdfs | ${report.totalCorpusPdfs} |`,
    `| candidatesAfterFiltering | ${report.candidatesAfterFiltering} |`,
    `| selectedCount | ${report.selectedCount} |`,
    `| completed | ${completed} |`,
    `| failed | ${failed} |`,
    `| anchorBackfill | ${report.anchorBackfill?.status || 'not-run'} |`,
    '',
    '## Results',
    '',
    '| # | Status | Document ID | Title |',
    '|---:|---|---|---|',
    ...report.results.map((row) => `| ${row.index} | ${row.status} | ${row.documentId || ''} | ${escapePipes(row.title || row.uri)} |`),
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

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
