#!/usr/bin/env node
'use strict';

/**
 * moby-ingest — local ingestion pipeline CLI
 *
 * Commands:
 *   scan        [dir]            Scan directory for files with ingestion issues
 *   split       <file> [outdir]  Split an oversized text file into parts
 *   analyze     <file>           Show ingestion analysis for a single file
 *   ingest      <file>           Run full pipeline on a single file
 *   status      [jobId]          Show pipeline state for all jobs, or one job
 *   retry                        Re-run all FAILED jobs
 *   quarantine                   List all quarantined jobs
 *   requeue     <jobId>          Reset a quarantined job to PENDING
 *
 * All state is stored in ./corpus/.state/ by default.
 * Set LOCAL_DIR_STATE=<path> to override.
 *
 * Run without GCP credentials: set INDEX_DRY_RUN=true (default when
 * DATA_STORE_ID is not configured).
 */

// Load backend .env if available (graceful — ingestion runs independently)
try {
  require('dotenv').config({ path: require('path').join(__dirname, '../../backend/.env') });
} catch { /* dotenv not installed in ingestion; that's fine */ }

const path = require('path');
const fs   = require('fs');

const config  = require('../config');
const { createJob }         = require('../state/job');
const { createStore }       = require('../state/store');
const { createLogger }      = require('../workers/base');
const { analyzeFile, splitTextIntoParts, scanDirectory } = require('../workers/splitter');
const { runPipeline, buildDefaultWorkers } = require('../pipeline/pipeline');
const { retryFailed }       = require('../pipeline/retry');
const { QuarantineManager } = require('../quarantine/quarantine');

const log   = createLogger('cli');
const store = createStore();
const qm    = new QuarantineManager(config, log);

// ── Command dispatch ──────────────────────────────────────────────────────────

const [,, cmd, ...args] = process.argv;

(async () => {
  switch (cmd) {
    case 'scan':      return cmdScan(args[0] || '.');
    case 'analyze':   return cmdAnalyze(args[0]);
    case 'split':     return cmdSplit(args[0], args[1]);
    case 'ingest':    return cmdIngest(args[0]);
    case 'status':    return cmdStatus(args[0]);
    case 'retry':     return cmdRetry();
    case 'quarantine':return cmdQuarantine();
    case 'requeue':   return cmdRequeue(args[0]);
    default:          return cmdHelp();
  }
})().catch(err => {
  process.stderr.write(JSON.stringify({ severity: 'ERROR', message: err.message, stack: err.stack }) + '\n');
  process.exit(1);
});

// ── Commands ──────────────────────────────────────────────────────────────────

function cmdHelp() {
  console.log(`
moby-ingest — Moby Prince corpus ingestion utility

Usage:
  node ingestion/cli/run.js <command> [args]

Commands:
  scan        [dir]           Scan directory for ingestion issues (default: .)
  analyze     <file>          Show analysis for a single file
  split       <file> [outdir] Split an oversized text file into parts
  ingest      <file>          Run full pipeline on a file (dry-run if no DATA_STORE_ID)
  status      [jobId]         Show all job states, or detail for one job
  retry                       Retry all FAILED jobs
  quarantine                  List quarantined jobs
  requeue     <jobId>         Reset a quarantined job to PENDING

Environment:
  DATA_STORE_ID               Vertex AI Search datastore ID (enables real indexing)
  INDEX_DRY_RUN=true          Force dry-run mode (never indexes)
  LOCAL_DIR_STATE=<path>      State directory (default: ./corpus/.state)
  LOG_LEVEL=debug|info|warn   Log verbosity (default: info)
`);
}

function cmdScan(dir) {
  const absDir = path.resolve(dir);
  if (!fs.existsSync(absDir)) {
    die(`Directory not found: ${absDir}`);
  }

  console.log(`\nScanning ${absDir} for ingestion issues...\n`);
  const results = scanDirectory(absDir, config.split);

  if (results.length === 0) {
    console.log('✓ No issues found — all files within Discovery Engine limits.');
    return;
  }

  console.log(`Found ${results.length} file(s) with issues:\n`);

  for (const { file, analysis } of results) {
    const rel = path.relative(process.cwd(), file);
    console.log(`  ${rel}`);
    console.log(`    Size: ${_mb(analysis.sizeBytes)} MB  Type: ${analysis.mimeType}`);
    for (const issue of analysis.issues) {
      const icon = issue.code.includes('CRITICAL') ? '✗' : '⚠';
      console.log(`    ${icon} [${issue.code}] ${issue.detail}`);
    }
    console.log();
  }

  const critical = results.filter(r => r.analysis.issues.some(i => i.code.includes('CRITICAL')));
  if (critical.length > 0) {
    console.log(`  ${critical.length} file(s) are non-indexable and require Document AI.`);
    console.log('  See docs/ingestion-architecture.md §Document AI Integration.\n');
  }
}

function cmdAnalyze(filePath) {
  if (!filePath) die('Usage: analyze <file>');
  const abs      = path.resolve(filePath);
  const analysis = analyzeFile(abs, config.split);

  console.log(`\nFile: ${abs}`);
  console.log(`Size: ${_mb(analysis.sizeBytes)} MB (${analysis.sizeBytes.toLocaleString()} bytes)`);
  console.log(`Type: ${analysis.mimeType}`);
  console.log(`Needs split: ${analysis.needsSplit}`);

  if (analysis.issues.length === 0) {
    console.log('Issues: none — file is within Discovery Engine limits');
  } else {
    console.log(`Issues (${analysis.issues.length}):`);
    for (const issue of analysis.issues) {
      console.log(`  [${issue.code}] ${issue.detail}`);
    }
  }
  console.log();
}

function cmdSplit(filePath, outDir) {
  if (!filePath) die('Usage: split <file> [outdir]');

  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) die(`File not found: ${abs}`);

  const ext = path.extname(abs).toLowerCase();
  if (ext === '.pdf') {
    die('Cannot split PDFs locally. Route through Document AI pipeline.\nSee docs/ingestion-architecture.md §Document AI Integration.');
  }

  const analysis = analyzeFile(abs, config.split);
  if (!analysis.needsSplit) {
    console.log(`File is ${_mb(analysis.sizeBytes)} MB — within limits, no split needed.`);
    return;
  }

  const text  = fs.readFileSync(abs, 'utf8');
  const parts = splitTextIntoParts(text, { maxChars: config.split.maxCharsPerPart });

  const destDir = outDir ? path.resolve(outDir) : path.join(path.dirname(abs), 'split');
  fs.mkdirSync(destDir, { recursive: true });

  const stem = path.basename(abs, path.extname(abs));

  console.log(`\nSplitting ${path.basename(abs)} (${_mb(analysis.sizeBytes)} MB) into ${parts.length} parts...\n`);

  for (let i = 0; i < parts.length; i++) {
    const partName = `${stem}_part_${String(i + 1).padStart(3, '0')}.txt`;
    const destPath = path.join(destDir, partName);
    fs.writeFileSync(destPath, parts[i], 'utf8');
    const partBytes = Buffer.byteLength(parts[i], 'utf8');
    console.log(`  → ${partName}  (${_mb(partBytes)} MB, ${parts[i].length.toLocaleString()} chars)`);
  }

  console.log(`\nWrote ${parts.length} parts to ${destDir}/`);
  console.log('Next: ingest each part file, or run the pipeline on the parent document.\n');
}

async function cmdIngest(filePath) {
  if (!filePath) die('Usage: ingest <file>');

  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) die(`File not found: ${abs}`);

  const stat = fs.statSync(abs);
  const job  = createJob(abs, {
    originalFilename: path.basename(abs),
    fileSizeBytes:    stat.size,
  }, config.retry.maxAttempts);

  await store.save(job);
  console.log(`\nJob created: ${job.jobId}`);
  console.log(`File: ${abs}  (${_mb(stat.size)} MB)\n`);

  const workers = buildDefaultWorkers(config, log);
  const { job: result, childJobs } = await runPipeline(job, store, workers, { logger: log });

  _printJobSummary(result);

  if (childJobs.length > 0) {
    console.log(`\nChild jobs (${childJobs.length} split parts):`);
    for (const child of childJobs) {
      // Re-read from store to get the final post-pipeline state
      const current = await store.get(child.jobId) || child;
      _printJobSummary(current, '  ');
    }
  }
  console.log();
}

async function cmdStatus(jobId) {
  if (jobId) {
    const job = await store.get(jobId);
    if (!job) die(`Job not found: ${jobId}`);
    console.log(JSON.stringify(job.toJSON(), null, 2));
    return;
  }

  const summary = await store.summary();
  const jobs    = await store.list();

  console.log(`\nIngestion state (${summary.total} jobs)\n`);
  console.log('Status breakdown:');
  for (const [status, count] of Object.entries(summary.byStatus)) {
    const icon = { INDEXED: '✓', QUARANTINED: '✗', FAILED: '⚠', PENDING: '○' }[status] || '·';
    console.log(`  ${icon} ${status.padEnd(15)} ${count}`);
  }

  if (jobs.length > 0) {
    console.log('\nRecent jobs (newest first):');
    const sorted = [...jobs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 20);
    for (const j of sorted) {
      const icon = { INDEXED: '✓', QUARANTINED: '✗', FAILED: '⚠', PENDING: '○' }[j.status] || '·';
      console.log(`  ${icon} ${j.jobId.slice(0, 8)}…  ${j.status.padEnd(13)} ${j.originalFilename}` +
                  (j.errorCode ? `  [${j.errorCode}]` : ''));
    }
  }
  console.log();
}

async function cmdRetry() {
  console.log('\nRetrying failed jobs...\n');
  const { retried, quarantined, succeeded } = await retryFailed(store, config, { logger: log });
  console.log(`\nResult: retried=${retried}  quarantined=${quarantined}  succeeded=${succeeded}\n`);
}

async function cmdQuarantine() {
  const items = await qm.list(store);
  if (items.length === 0) {
    console.log('\nNo quarantined jobs.\n');
    return;
  }

  console.log(`\nQuarantined jobs (${items.length}):\n`);
  for (const item of items) {
    console.log(`  ${item.jobId}`);
    console.log(`    File:  ${item.originalFilename}`);
    console.log(`    Error: [${item.errorCode}] ${item.errorMessage}`);
    console.log(`    After: ${item.attempts} attempt(s)  ·  ${item.quarantinedAt}`);
    console.log();
  }

  console.log('To requeue after manual repair: node ingestion/cli/run.js requeue <jobId>\n');
}

async function cmdRequeue(jobId) {
  if (!jobId) die('Usage: requeue <jobId>');
  const job = await store.get(jobId);
  if (!job) die(`Job not found: ${jobId}`);

  const requeued = await qm.requeue(job, store);
  console.log(`\nJob ${jobId} requeued to PENDING (${requeued.updatedAt})\n`);
  console.log('Run `ingest` or wait for the retry scheduler to pick it up.\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _printJobSummary(job, indent = '') {
  const icon = { INDEXED: '✓', QUARANTINED: '✗', FAILED: '⚠', PENDING: '○' }[job.status] || '·';
  console.log(`${indent}${icon} ${job.jobId.slice(0, 8)}…  ${job.status}  ${job.originalFilename}`);
  if (job.errorCode) {
    console.log(`${indent}  Error: [${job.errorCode}] ${job.errorMessage}`);
  }
}

function _mb(bytes) {
  if (!bytes) return '0.0';
  return (bytes / 1_000_000).toFixed(1);
}

function die(msg) {
  process.stderr.write(msg + '\n');
  process.exit(1);
}
