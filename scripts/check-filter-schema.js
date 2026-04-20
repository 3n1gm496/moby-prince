#!/usr/bin/env node
'use strict';

/**
 * Filter schema sync check — compare backend/filters/schema.js with
 * frontend/src/filters/schema.js and assert they are consistent.
 *
 * Checks:
 *   1. Both schemas define the same set of keys.
 *   2. The `available` flag matches for every key.
 *   3. For enum fields, the set of allowed values matches.
 *   4. For number fields, min/max match.
 *
 * Usage:
 *   node scripts/check-filter-schema.js        # exit 0 = OK, exit 1 = drift
 *
 * Run this as a pre-deploy check or in CI:
 *   "scripts": { "check-schema": "node scripts/check-filter-schema.js" }
 */

// Backend schema (CommonJS)
const { SCHEMA: BACKEND } = require('../backend/filters/schema');

// Frontend schema is ES module — extract the array via a lightweight parse
// rather than importing (avoids needing a transpiler in this script).
const fs = require('fs');
const path = require('path');

const frontendSrc = fs.readFileSync(
  path.join(__dirname, '../frontend/src/filters/schema.js'),
  'utf8',
);

// Pull the FILTER_SCHEMA array literal from the ES module source.
// We eval it in a minimal CommonJS shim so we don't need Babel/esbuild.
const shimSrc = frontendSrc
  .replace(/^export\s+const\s+/gm, 'const ')
  .replace(/^export\s+function\s+/gm, 'function ')
  .replace(/^export\s+default\s+/gm, 'module.exports = ');
const m = { exports: {} };
// eslint-disable-next-line no-new-func
new Function('module', 'exports', shimSrc)(m, m.exports);

// FILTER_SCHEMA is a named export; grab it from the shim scope via a regex
// to avoid the full eval — safer and sufficient for this static check.
const match = frontendSrc.match(/export\s+const\s+FILTER_SCHEMA\s*=\s*(\[[\s\S]*?\n\];)/m);
if (!match) {
  console.error('✗  Could not locate FILTER_SCHEMA export in frontend/src/filters/schema.js');
  process.exit(1);
}

let FRONTEND;
try {
  // eslint-disable-next-line no-eval
  FRONTEND = eval(match[1]);
} catch (e) {
  console.error('✗  Failed to parse FILTER_SCHEMA:', e.message);
  process.exit(1);
}

// ── Comparisons ───────────────────────────────────────────────────────────────

const errors = [];

const backendKeys  = new Set(Object.keys(BACKEND));
const frontendKeys = new Set(FRONTEND.map(f => f.key));

// 1. Key set parity
for (const k of backendKeys) {
  if (!frontendKeys.has(k)) errors.push(`Key "${k}" exists in backend schema but not in frontend schema`);
}
for (const k of frontendKeys) {
  if (!backendKeys.has(k)) errors.push(`Key "${k}" exists in frontend schema but not in backend schema`);
}

// 2–4. Per-field checks (only for keys present in both)
for (const frontField of FRONTEND) {
  const key  = frontField.key;
  const back = BACKEND[key];
  if (!back) continue; // already reported above

  if (frontField.available !== back.available) {
    errors.push(
      `Key "${key}" available mismatch: backend=${back.available}, frontend=${frontField.available}`,
    );
  }

  if (back.type === 'enum') {
    const backValues  = new Set(back.values || []);
    const frontValues = new Set((frontField.options || []).map(o => o.value));
    for (const v of backValues) {
      if (!frontValues.has(v)) errors.push(`Key "${key}" value "${v}" in backend but missing from frontend options`);
    }
    for (const v of frontValues) {
      if (!backValues.has(v)) errors.push(`Key "${key}" value "${v}" in frontend options but missing from backend values`);
    }
  }

  if (back.type === 'number') {
    if (back.min !== undefined && frontField.min !== back.min) {
      errors.push(`Key "${key}" min mismatch: backend=${back.min}, frontend=${frontField.min}`);
    }
    if (back.max !== undefined && frontField.max !== back.max) {
      errors.push(`Key "${key}" max mismatch: backend=${back.max}, frontend=${frontField.max}`);
    }
  }
}

// ── Result ────────────────────────────────────────────────────────────────────

if (errors.length === 0) {
  console.log('✔  Filter schemas are in sync');
  process.exit(0);
} else {
  console.error('✗  Filter schema drift detected:\n');
  errors.forEach(e => console.error(`  • ${e}`));
  console.error(`\n${errors.length} issue(s) found. Update both schemas to match.`);
  process.exit(1);
}
