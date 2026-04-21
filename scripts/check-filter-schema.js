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
 * Run as a pre-deploy check or in CI:
 *   "scripts": { "check-schema": "node scripts/check-filter-schema.js" }
 */

const fs   = require('fs');
const path = require('path');

// ── Load backend schema (CommonJS — straightforward require) ──────────────────

const { SCHEMA: BACKEND } = require('../backend/filters/schema');

// ── Load frontend schema (ES module — transpiler-free bracket extraction) ─────
//
// We extract the FILTER_SCHEMA array by bracket-counting from the raw source
// instead of eval/regex so the parser is robust against any valid JS formatting.

const frontendPath = path.join(__dirname, '../frontend/src/filters/schema.js');
const frontendSrc  = fs.readFileSync(frontendPath, 'utf8');

let FRONTEND;
try {
  FRONTEND = _extractFilterSchema(frontendSrc);
} catch (e) {
  console.error(`✗  Failed to parse FILTER_SCHEMA from ${frontendPath}:\n  ${e.message}`);
  process.exit(1);
}

if (!Array.isArray(FRONTEND) || FRONTEND.length === 0) {
  console.error('✗  FILTER_SCHEMA in frontend/src/filters/schema.js is empty or not an array');
  process.exit(1);
}

// ── Comparisons ───────────────────────────────────────────────────────────────

const errors = [];

const backendKeys  = new Set(Object.keys(BACKEND));
const frontendKeys = new Set(FRONTEND.map(f => f.key));

// 1. Key set parity
for (const k of backendKeys) {
  if (!frontendKeys.has(k)) errors.push(`Key "${k}" in backend but missing from frontend`);
}
for (const k of frontendKeys) {
  if (!backendKeys.has(k)) errors.push(`Key "${k}" in frontend but missing from backend`);
}

// 2–4. Per-field checks
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
    const backValues  = new Set((back.options || []).map(o => o.value));
    const frontValues = new Set((frontField.options || []).map(o => o.value));
    for (const v of backValues) {
      if (!frontValues.has(v))
        errors.push(`Key "${key}": backend option "${v}" missing from frontend options`);
    }
    for (const v of frontValues) {
      if (!backValues.has(v))
        errors.push(`Key "${key}": frontend option "${v}" missing from backend options`);
    }
    // Check that labels match too
    for (const backOpt of (back.options || [])) {
      const frontOpt = (frontField.options || []).find(o => o.value === backOpt.value);
      if (frontOpt && frontOpt.label !== backOpt.label) {
        errors.push(`Key "${key}" option "${backOpt.value}" label mismatch: backend="${backOpt.label}", frontend="${frontOpt.label}"`);
      }
    }
  }

  if (back.type === 'number') {
    if (back.min !== undefined && frontField.min !== back.min)
      errors.push(`Key "${key}" min mismatch: backend=${back.min}, frontend=${frontField.min}`);
    if (back.max !== undefined && frontField.max !== back.max)
      errors.push(`Key "${key}" max mismatch: backend=${back.max}, frontend=${frontField.max}`);
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

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Extract and evaluate the FILTER_SCHEMA array from an ES module source string.
 *
 * Strategy:
 *   1. Locate the `export const FILTER_SCHEMA = [` declaration.
 *   2. Use bracket-counting to find the matching closing `]`, handling:
 *        - nested arrays and objects
 *        - single-quoted, double-quoted, and template strings
 *        - escaped characters inside strings
 *        - single-line and multi-line comments
 *   3. Evaluate the isolated array literal in a sandboxed context.
 *
 * This is deliberately tolerant of whitespace, multiline, and mixed-indent
 * formatting changes that would break a regex-based approach.
 *
 * @param {string} src
 * @returns {Array}
 */
function _extractFilterSchema(src) {
  // Step 1: find the start of the array literal
  const declRe = /\bexport\s+const\s+FILTER_SCHEMA\s*=\s*(\[)/;
  const declMatch = src.match(declRe);
  if (!declMatch) throw new Error('Could not find "export const FILTER_SCHEMA = ["');

  const arrayStart = declMatch.index + declMatch[0].length - 1; // index of the opening [

  // Step 2: bracket-count to find the matching ]
  let depth = 0;
  let i = arrayStart;
  let inString = false;
  let stringChar = '';

  while (i < src.length) {
    const ch = src[i];

    if (inString) {
      if (ch === '\\') {
        i += 2; // skip escaped character
        continue;
      }
      if (ch === stringChar) inString = false;
      i++;
      continue;
    }

    // Entering a string
    if (ch === '"' || ch === "'" || ch === '`') {
      inString  = true;
      stringChar = ch;
      i++;
      continue;
    }

    // Single-line comment
    if (ch === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }

    // Multi-line comment
    if (ch === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length - 1 && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) {
        const arrayLiteral = src.slice(arrayStart, i + 1);
        // Step 3: evaluate in sandbox — only array/object/string/number/boolean literals
        const vm = require('vm');
        const sandbox = { __result: undefined };
        vm.runInNewContext(`__result = ${arrayLiteral}`, sandbox);
        return sandbox.__result;
      }
    }

    i++;
  }

  throw new Error('Unmatched bracket — could not find end of FILTER_SCHEMA array');
}
