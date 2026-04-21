'use strict';

/**
 * Claims repository — query helpers for evidence.claims in BigQuery.
 * All functions return normalized EvidenceClaim objects via models.js.
 */

const bq = require('../services/bigquery');
const { normalizeClaim } = require('../evidence/models');

const config = require('../config');

function _table(t) {
  return `\`${config.bigquery.projectId}.${config.bigquery.datasetId}.${t}\``;
}

/**
 * List claims for a document.
 * @param {string} documentId
 * @param {number} [limit=50]
 */
async function listByDocument(documentId, limit = 50) {
  const rows = await bq.query(
    `SELECT * FROM ${_table('claims')}
     WHERE document_id = @documentId
     ORDER BY created_at DESC
     LIMIT @limit`,
    [
      bq.stringParam('documentId', documentId),
      bq.intParam('limit', limit),
    ],
  );
  return rows.map(normalizeClaim);
}

/**
 * List claims that reference a specific entity ID.
 * @param {string} entityId
 * @param {number} [limit=100]
 */
async function listByEntity(entityId, limit = 100) {
  const rows = await bq.query(
    `SELECT * FROM ${_table('claims')}
     WHERE @entityId IN UNNEST(entity_ids)
     ORDER BY confidence DESC, created_at DESC
     LIMIT @limit`,
    [
      bq.stringParam('entityId', entityId),
      bq.intParam('limit', limit),
    ],
  );
  return rows.map(normalizeClaim);
}

/**
 * Verify: find claims similar to a text using BQ SEARCH() (full-text index).
 * Falls back to LIKE if the search index is not yet built.
 *
 * Requires a BQ Search Index created once with:
 *   CREATE SEARCH INDEX ON evidence.claims(text)
 *
 * @param {string}   text
 * @param {string[]} [entityIds=[]]  Optional entity filter (unused but kept for API compat)
 * @param {number}   [limit=20]
 */
async function findSimilar(text, entityIds = [], limit = 20) {
  const keywords = text
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length >= 4)
    .slice(0, 6)
    .join(' ');

  if (!keywords) return [];

  const rows = await bq.query(
    `SELECT * FROM ${_table('claims')}
     WHERE SEARCH(text, @keywords)
       AND created_at > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 365 DAY)
     ORDER BY confidence DESC, created_at DESC
     LIMIT @limit`,
    [
      bq.stringParam('keywords', keywords),
      bq.intParam('limit', limit),
    ],
  );
  return rows.map(normalizeClaim);
}

/**
 * Get a single claim by ID.
 * @param {string} id
 */
async function getById(id) {
  const rows = await bq.query(
    `SELECT * FROM ${_table('claims')} WHERE id = @id LIMIT 1`,
    [bq.stringParam('id', id)],
  );
  return rows.length > 0 ? normalizeClaim(rows[0]) : null;
}

module.exports = { listByDocument, listByEntity, findSimilar, getById };
