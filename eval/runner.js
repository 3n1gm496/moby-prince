#!/usr/bin/env node
'use strict';

/**
 * eval/runner.js — Benchmark runner for the Moby Prince RAG backend.
 *
 * Reads eval/benchmark.jsonl, calls the backend APIs, scores responses
 * with automated signals, and writes a results JSONL file for further
 * analysis and manual review.
 *
 * Usage:
 *   node eval/runner.js [options]
 *
 * Options:
 *   --backend  <url>    Backend base URL       (default: http://localhost:3001)
 *   --input    <file>   Benchmark JSONL path   (default: eval/benchmark.jsonl)
 *   --output   <file>   Results path           (default: eval/results/run-<ISO>.jsonl)
 *   --category <cat>    Only run this category (factual|comparative|source_lookup|
 *                                              timeline|contradiction|out_of_corpus)
 *   --id       <id>     Only run this query ID (e.g. factual-001)
 *   --search            Also call /api/search for retrieval-only signals
 *   --delay    <ms>     Delay between requests (default: 500)
 *   --dry-run           Print queries without calling the API, then exit
 */

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');
const { scoreResponse, scoreSearchResponse, printSummary } = require('./scorer');

// ── CLI argument parsing ──────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2);
  const args = {
    backend:  'http://localhost:3001',
    input:    path.join(__dirname, 'benchmark.jsonl'),
    output:   null,
    category: null,
    id:       null,
    search:   false,
    delay:    500,
    dryRun:   false,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--backend':   args.backend  = argv[++i]; break;
      case '--input':     args.input    = argv[++i]; break;
      case '--output':    args.output   = argv[++i]; break;
      case '--category':  args.category = argv[++i]; break;
      case '--id':        args.id       = argv[++i]; break;
      case '--delay':     args.delay    = parseInt(argv[++i], 10); break;
      case '--search':    args.search   = true; break;
      case '--dry-run':   args.dryRun   = true; break;
      default:
        console.error(`Unknown option: ${argv[i]}`);
        process.exit(1);
    }
  }

  if (!args.output) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    args.output = path.join(__dirname, 'results', `run-${ts}.jsonl`);
  }

  return args;
}

// ── I/O helpers ───────────────────────────────────────────────────────────────

async function readBenchmark(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Benchmark file not found: ${file}`);
  }
  const entries = [];
  const rl = readline.createInterface({
    input:     fs.createReadStream(file),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('#')) {
      try {
        entries.push(JSON.parse(trimmed));
      } catch (err) {
        console.warn(`Warning: skipping malformed line: ${trimmed.slice(0, 80)}`);
      }
    }
  }
  return entries;
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function callAnswer(backendUrl, query) {
  const start = Date.now();
  const res = await fetch(`${backendUrl}/api/answer`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query, maxResults: 10 }),
    signal:  AbortSignal.timeout(90_000),
  });
  const ms = Date.now() - start;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}${body ? ': ' + body.slice(0, 200) : ''}`);
  }
  return { data: await res.json(), ms };
}

async function callSearch(backendUrl, query) {
  const start = Date.now();
  const res = await fetch(`${backendUrl}/api/search`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query, maxResults: 10 }),
    signal:  AbortSignal.timeout(30_000),
  });
  const ms = Date.now() - start;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}${body ? ': ' + body.slice(0, 200) : ''}`);
  }
  return { data: await res.json(), ms };
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtPct(v) {
  return v === null ? '  n/a' : `${String(Math.round(v * 100)).padStart(3)}%`;
}

function printRow(entry, signals, extra) {
  const s       = signals || {};
  const ms      = s.response_ms != null ? `${s.response_ms}ms` : 'err';
  const cit     = s.citation_count != null ? `cit:${s.citation_count}` : '';
  const srcR    = s.source_recall != null ? `src:${fmtPct(s.source_recall)}` : '';
  const ansR    = s.contains_expected != null ? `ans:${fmtPct(s.contains_expected)}` : '';
  const decline = entry.must_decline
    ? (s.declined_appropriately ? '✓ declined' : '✗ did-not-decline')
    : '';
  const review  = s.needs_review ? ' [review]' : '';

  const parts = [ms, cit, srcR, ansR, decline, extra || ''].filter(Boolean);
  console.log(`  → ${parts.join('  ')}${review}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs();

  let entries = await readBenchmark(args.input);

  if (args.category) entries = entries.filter(e => e.category === args.category);
  if (args.id)       entries = entries.filter(e => e.id       === args.id);

  if (entries.length === 0) {
    console.error('No benchmark entries match the specified filters.');
    process.exit(1);
  }

  // ── Dry run ────────────────────────────────────────────────────────────────
  if (args.dryRun) {
    console.log(`\nDry run — ${entries.length} queries (backend: ${args.backend})\n`);
    for (const e of entries) {
      console.log(`  [${e.id}]  ${e.category}  ${e.difficulty}`);
      console.log(`    ${e.query}`);
      if (e.must_decline) console.log(`    must_decline: true`);
    }
    console.log();
    return;
  }

  // ── Health check ───────────────────────────────────────────────────────────
  try {
    const r = await fetch(`${args.backend}/api/health`, { signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const h = await r.json();
    if (h.status !== 'ok') {
      console.warn(`Warning: backend reports status '${h.status}' — auth may be degraded.`);
    }
  } catch (err) {
    console.error(`Cannot reach backend at ${args.backend}: ${err.message}`);
    console.error('Start the backend first: cd backend && node server.js');
    process.exit(1);
  }

  // ── Prepare output ─────────────────────────────────────────────────────────
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  const outStream = fs.createWriteStream(args.output);

  const allResults = [];
  const runAt = new Date().toISOString();

  console.log(`\nRunning ${entries.length} queries against ${args.backend}`);
  if (args.category) console.log(`  category filter: ${args.category}`);
  if (args.id)       console.log(`  id filter: ${args.id}`);
  console.log();

  // ── Run queries ────────────────────────────────────────────────────────────
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    process.stdout.write(`[${String(i + 1).padStart(2)}/${entries.length}] ${entry.id.padEnd(24)}`);

    const result = {
      id:           entry.id,
      category:     entry.category,
      difficulty:   entry.difficulty,
      query:        entry.query,
      must_decline: entry.must_decline,
      run_at:       runAt,
    };

    try {
      // Answer endpoint
      const { data: answerData, ms: answerMs } = await callAnswer(args.backend, entry.query);
      result.answer = {
        text:          answerData.answer?.text          || '',
        citation_count: answerData.answer?.citations?.length ?? 0,
        evidence_count: answerData.answer?.evidence?.length  ?? 0,
        unique_docs:    answerData.meta?.uniqueDocumentsCount ?? 0,
        evidence_titles: (answerData.answer?.evidence || []).map(e => e.title).filter(Boolean),
      };
      result.signals = scoreResponse(entry, answerData, answerMs);

      process.stdout.write('\n');
      printRow(entry, result.signals);

      // Search endpoint (optional)
      if (args.search) {
        const { data: searchData, ms: searchMs } = await callSearch(args.backend, entry.query);
        result.search = {
          results_count:  searchData.results?.length ?? 0,
          top_titles:     (searchData.results || []).slice(0, 3).map(r => r.document?.title).filter(Boolean),
        };
        result.search_signals = scoreSearchResponse(entry, searchData, searchMs);
      }

    } catch (err) {
      process.stdout.write('\n');
      console.log(`  → ERROR: ${err.message}`);
      result.error   = err.message;
      result.signals = null;
    }

    // Slot for manual review — intentionally null until a human fills it in
    result.manual_review = {
      correctness:           null,  // 0 absent | 1 wrong | 2 partial | 3 correct
      groundedness:          null,  // 0 absent | 1 ungrounded | 2 mostly | 3 fully grounded
      citation_quality:      null,  // 0 absent | 1 useless | 2 partial | 3 useful
      ooc_handling:          entry.must_decline ? null : undefined, // only for must_decline entries
      hallucination_flag:    null,  // true if reviewer spots a hallucinated claim
      notes:                 null,
    };

    allResults.push(result);
    outStream.write(JSON.stringify(result) + '\n');

    // Rate-limit guard
    if (i < entries.length - 1 && args.delay > 0) {
      await new Promise(r => setTimeout(r, args.delay));
    }
  }

  outStream.end();

  printSummary(allResults, args.output);
}

main().catch(err => {
  console.error(`\nFatal: ${err.message}`);
  process.exit(1);
});
