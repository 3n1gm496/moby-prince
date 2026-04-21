'use strict';

/**
 * BigQuery REST client — thin wrapper around the BQ HTTP API v2.
 *
 * Uses the shared OAuth access token from services/auth.js so no separate
 * service-account JSON is needed in the backend container.
 *
 * Methods:
 *   query(sql, params?)  — synchronous job (≤10 s); returns plain objects
 *   insert(tableId, rows) — streaming insertAll; for small batches (≤500 rows)
 *
 * BQ is optional: when config.bigquery.projectId is absent both methods throw
 * immediately so callers can gate on isBigQueryEnabled().
 */

const config             = require('../config');
const { getAccessToken } = require('./auth');
const { createLogger }   = require('../logger');
const { incrementBq }    = require('./rateLimiter');

const log     = createLogger('bigquery');
const BQ_BASE = 'https://bigquery.googleapis.com/bigquery/v2';

// ── Helpers ───────────────────────────────────────────────────────────────────

function _projectPath() {
  return `${BQ_BASE}/projects/${config.bigquery.projectId}`;
}

function _tablePath(tableId) {
  return `${_projectPath()}/datasets/${config.bigquery.datasetId}/tables/${tableId}/insertAll`;
}

/**
 * Map a BigQuery row (f[]/v[] format) to a plain JS object using the schema
 * field list. Handles nested RECORDs and REPEATED (array) fields recursively.
 */
function _mapRow(fields, row) {
  const obj = {};
  for (let i = 0; i < fields.length; i++) {
    const field  = fields[i];
    const cell   = row.f[i];
    const rawVal = cell?.v;

    if (rawVal === null || rawVal === undefined) {
      obj[field.name] = null;
      continue;
    }

    if (field.mode === 'REPEATED') {
      const arr = Array.isArray(rawVal) ? rawVal : [rawVal];
      if (field.type === 'RECORD' || field.type === 'STRUCT') {
        obj[field.name] = arr.map(item => _mapRow(field.fields, item.v));
      } else {
        obj[field.name] = arr.map(item => _coerce(field.type, item.v));
      }
      continue;
    }

    if (field.type === 'RECORD' || field.type === 'STRUCT') {
      obj[field.name] = _mapRow(field.fields, rawVal);
      continue;
    }

    obj[field.name] = _coerce(field.type, rawVal);
  }
  return obj;
}

function _coerce(type, v) {
  if (v === null || v === undefined) return null;
  if (type === 'BOOLEAN' || type === 'BOOL') return v === true || v === 'true';
  if (type === 'INTEGER' || type === 'INT64') return Number(v);
  if (type === 'FLOAT' || type === 'FLOAT64' || type === 'NUMERIC' || type === 'BIGNUMERIC') return Number(v);
  return v; // STRING, TIMESTAMP, DATE, etc. — return as-is
}

// ── Exported helpers ──────────────────────────────────────────────────────────

/** Build a named STRING query parameter. */
function stringParam(name, value) {
  return { name, parameterType: { type: 'STRING' }, parameterValue: { value: String(value) } };
}

/** Build a named INT64 query parameter. */
function intParam(name, value) {
  return { name, parameterType: { type: 'INT64' }, parameterValue: { value: String(value) } };
}

/** Build a named TIMESTAMP query parameter. */
function timestampParam(name, value) {
  return { name, parameterType: { type: 'TIMESTAMP' }, parameterValue: { value: String(value) } };
}

/** Build a named STRING ARRAY query parameter. */
function stringArrayParam(name, values) {
  return {
    name,
    parameterType: { type: 'ARRAY', arrayType: { type: 'STRING' } },
    parameterValue: { arrayValues: values.map(v => ({ value: String(v) })) },
  };
}

/** True when BQ_PROJECT_ID and BQ_DATASET_ID are set. */
function isBigQueryEnabled() {
  return !!(config.bigquery?.projectId && config.bigquery?.datasetId);
}

// ── Core operations ───────────────────────────────────────────────────────────

/**
 * Run a synchronous (≤30 s) BQ query.
 *
 * @param {string}   sql         Standard SQL string with @namedParam placeholders
 * @param {object[]} [params=[]] Array of parameter objects (use helpers above)
 * @returns {Promise<object[]>}  Plain JS objects, one per result row
 */
async function query(sql, params = []) {
  if (!isBigQueryEnabled()) throw new Error('BigQuery not configured (BQ_PROJECT_ID / BQ_DATASET_ID missing)');
  incrementBq();

  const token = await getAccessToken();
  const body  = {
    query:        sql,
    location:     config.bigquery.location || 'EU',
    timeoutMs:    30_000,
    useLegacySql: false,
  };
  if (params.length > 0) {
    body.queryParameters = params;
    body.parameterMode   = 'NAMED';
  }

  const res = await fetch(`${_projectPath()}/queries`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    log.error({ status: res.status, detail: errText.slice(0, 300) }, 'BQ query failed');
    throw new Error(`BigQuery query failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();

  if (!data.jobComplete) {
    const jobId = data.jobReference?.jobId ?? 'unknown';
    log.error({ jobId }, 'BQ query did not complete within timeoutMs');
    throw new Error(`BigQuery query timed out (jobId: ${jobId})`);
  }

  const fields = data.schema?.fields || [];
  return (data.rows || []).map(row => _mapRow(fields, row));
}

/**
 * Stream-insert rows into a BQ table.
 *
 * @param {string}   tableId     Table name within config.bigquery.datasetId
 * @param {object[]} rows        Plain JS objects matching the table schema
 */
async function insert(tableId, rows) {
  if (!isBigQueryEnabled()) throw new Error('BigQuery not configured');
  if (!rows || rows.length === 0) return;
  incrementBq();

  const token = await getAccessToken();
  const body  = {
    rows: rows.map((row, i) => ({
      insertId: row.id ? `${row.id}` : `${Date.now()}-${i}`,
      json:     row,
    })),
    skipInvalidRows:    false,
    ignoreUnknownValues: false,
  };

  const res = await fetch(_tablePath(tableId), {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    log.error({ tableId, status: res.status, detail: errText.slice(0, 300) }, 'BQ insert failed');
    throw new Error(`BigQuery insert failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  if (data.insertErrors && data.insertErrors.length > 0) {
    const sample = JSON.stringify(data.insertErrors.slice(0, 2));
    log.error({ tableId, insertErrors: data.insertErrors.length, sample }, 'BQ partial insert error');
    throw new Error(`BigQuery insert partial failure: ${sample}`);
  }

  log.debug({ tableId, count: rows.length }, 'BQ rows inserted');
}

module.exports = { query, insert, isBigQueryEnabled, stringParam, intParam, timestampParam, stringArrayParam };
