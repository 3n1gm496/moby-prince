'use strict';

/**
 * BigQuery streaming-insert client for ingestion workers.
 *
 * Only exposes `insert(tableId, rows)` — ingestion workers write data but
 * never query.  Query functionality lives in backend/services/bigquery.js.
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

module.exports = { insert, isEnabled };
