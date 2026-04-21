'use strict';

/**
 * BigQuery streaming-insert client for ingestion workers.
 *
 * Exposes `insert(tableId, rows)` for streaming writes and `dml(sql, params)`
 * for DML statements (DELETE/UPDATE) needed by workers that purge stale rows
 * before re-inserting.  SELECT query functionality lives in backend/services/bigquery.js.
 *
 * Required env vars:
 *   GOOGLE_CLOUD_PROJECT   (falls back to config.projectId)
 *   BQ_DATASET_ID          (default: "evidence")
 *   BQ_LOCATION            (default: "EU")
 */

const { getAccessToken } = require('./auth');

const BQ_BASE = 'https://bigquery.googleapis.com/bigquery/v2';

function _projectId() {
  return process.env.BQ_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || null;
}

function _datasetId() {
  return process.env.BQ_DATASET_ID || 'evidence';
}

function isEnabled() {
  return !!(_projectId());
}

/**
 * Execute a DML statement (INSERT, UPDATE, DELETE) via the synchronous query
 * endpoint.  For ingestion workers that need to purge rows before re-inserting.
 *
 * @param {string} sql    Standard SQL DML with @namedParam placeholders
 * @param {object} params Object mapping param names to string values
 */
async function dml(sql, params = {}) {
  const projectId = _projectId();
  if (!projectId) throw new Error('BQ not configured (GOOGLE_CLOUD_PROJECT missing)');

  const token = await getAccessToken();
  const queryParameters = Object.entries(params).map(([name, value]) => ({
    name,
    parameterType: { type: 'STRING' },
    parameterValue: { value: String(value) },
  }));

  const body = {
    query:        sql,
    location:     process.env.BQ_LOCATION || 'EU',
    timeoutMs:    30_000,
    useLegacySql: false,
    ...(queryParameters.length > 0 ? { queryParameters, parameterMode: 'NAMED' } : {}),
  };

  const res = await fetch(`${BQ_BASE}/projects/${projectId}/queries`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`BQ DML failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  if (!data.jobComplete) {
    throw new Error(`BQ DML timed out (jobId: ${data.jobReference?.jobId ?? 'unknown'})`);
  }
}

/**
 * Stream rows into a BigQuery table.
 *
 * @param {string}   tableId   Table name within the evidence dataset
 * @param {object[]} rows      Plain JS objects matching the table schema
 */
async function insert(tableId, rows) {
  if (!rows || rows.length === 0) return;
  const projectId = _projectId();
  if (!projectId) throw new Error('BQ not configured (GOOGLE_CLOUD_PROJECT missing)');

  const token = await getAccessToken();
  const url   = `${BQ_BASE}/projects/${projectId}/datasets/${_datasetId()}/tables/${tableId}/insertAll`;

  const body = {
    rows: rows.map((row, i) => ({
      insertId: row.id ? String(row.id) : `${Date.now()}-${i}`,
      json:     row,
    })),
    skipInvalidRows:    false,
    ignoreUnknownValues: false,
  };

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`BQ insert failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  if (data.insertErrors && data.insertErrors.length > 0) {
    throw new Error(`BQ partial insert error: ${JSON.stringify(data.insertErrors.slice(0, 2))}`);
  }
}

module.exports = { insert, dml, isEnabled };
