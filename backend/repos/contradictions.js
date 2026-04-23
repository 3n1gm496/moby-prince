'use strict';

/**
 * Contradictions repository — query helpers for evidence.contradictions in BQ.
 */

const bq = require('../services/bigquery');
const { normalizeContradiction } = require('../evidence/models');
const config = require('../config');

function _table(t) {
  return `\`${config.bigquery.projectId}.${config.bigquery.datasetId}.${t}\``;
}

/**
 * List contradictions with optional filters.
 *
 * @param {{ status?: string, severity?: string, documentId?: string, limit?: number }} opts
 */
async function list({ status, severity, documentId, limit = 50 } = {}) {
  const conditions = [];
  const params     = [];

  if (status) {
    conditions.push('status = @status');
    params.push(bq.stringParam('status', status));
  }
  if (severity) {
    conditions.push('severity = @severity');
    params.push(bq.stringParam('severity', severity));
  }
  if (documentId) {
    conditions.push('(document_a_id = @docId OR document_b_id = @docId)');
    params.push(bq.stringParam('docId', documentId));
  }
  params.push(bq.intParam('limit', limit));

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await bq.query(
    `SELECT cont.*,
            ca.text AS claim_a_text,
            cb.text AS claim_b_text
     FROM ${_table('contradictions')} cont
     LEFT JOIN ${_table('claims')} ca ON ca.id = cont.claim_a_id
     LEFT JOIN ${_table('claims')} cb ON cb.id = cont.claim_b_id
     ${where}
     ORDER BY
       CASE cont.severity WHEN 'major' THEN 0 WHEN 'significant' THEN 1 ELSE 2 END,
       cont.detected_at DESC
     LIMIT @limit`,
    params,
  );
  return rows.map(row => ({
    ...normalizeContradiction(row),
    claimAText: row.claim_a_text || null,
    claimBText: row.claim_b_text || null,
  }));
}

/**
 * Get a single contradiction by ID, enriched with claim texts.
 * @param {string} id
 */
async function getById(id) {
  const rows = await bq.query(
    `SELECT c.*,
            ca.text AS claim_a_text,
            cb.text AS claim_b_text,
            ca.document_uri AS source_a_uri,
            cb.document_uri AS source_b_uri
     FROM ${_table('contradictions')} c
     LEFT JOIN ${_table('claims')} ca ON ca.id = c.claim_a_id
     LEFT JOIN ${_table('claims')} cb ON cb.id = c.claim_b_id
     WHERE c.id = @id
     LIMIT 1`,
    [bq.stringParam('id', id)],
  );
  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    ...normalizeContradiction(row),
    claimAText:  row.claim_a_text  || null,
    claimBText:  row.claim_b_text  || null,
    sourceAUri:  row.source_a_uri  || null,
    sourceBUri:  row.source_b_uri  || null,
  };
}

/**
 * List contradictions whose claim_a or claim_b belongs to a given source URI.
 * Used by the answer route to surface contradictions relevant to cited documents.
 *
 * @param {string[]} sourceUris  GCS URIs from DE citations
 * @param {number}   [limit=5]
 */
async function listBySourceUris(sourceUris, limit = 5) {
  if (!sourceUris || sourceUris.length === 0) return [];
  const rows = await bq.query(
    `SELECT cont.*
     FROM ${_table('contradictions')} cont
     INNER JOIN ${_table('claims')} ca ON ca.id = cont.claim_a_id
     WHERE ca.document_uri IN UNNEST(@uris)
       AND cont.status != 'resolved'
     ORDER BY
       CASE cont.severity WHEN 'major' THEN 0 WHEN 'significant' THEN 1 ELSE 2 END
     LIMIT @limit`,
    [
      bq.stringArrayParam('uris', sourceUris),
      bq.intParam('limit', limit),
    ],
  );
  return rows.map(normalizeContradiction);
}

/**
 * Update status and/or resolution of a contradiction.
 * BQ does not support in-place UPDATE on streaming-inserted rows in all configs
 * — this uses DML (INSERT OVERWRITE not needed; standard DML UPDATE is fine for
 * non-partitioned tables).
 *
 * @param {string} id
 * @param {{ status?: string, resolution?: string }} delta
 */
async function update(id, delta) {
  const setClauses = [];
  const params     = [bq.stringParam('id', id)];

  if (delta.status) {
    setClauses.push('status = @status');
    params.push(bq.stringParam('status', delta.status));
  }
  if (delta.resolution !== undefined) {
    setClauses.push('resolution = @resolution');
    params.push(bq.stringParam('resolution', delta.resolution || ''));
  }
  const now = new Date().toISOString();
  setClauses.push('updated_at = @updatedAt');
  params.push(bq.timestampParam('updatedAt', now));

  if (delta.status === 'resolved' || delta.status === 'contested') {
    setClauses.push('resolved_at = @resolvedAt');
    params.push(bq.timestampParam('resolvedAt', now));
  }

  if (setClauses.length === 0) return null;

  await bq.query(
    `UPDATE ${_table('contradictions')}
     SET ${setClauses.join(', ')}
     WHERE id = @id`,
    params,
  );

  return getById(id);
}

module.exports = { list, getById, listBySourceUris, update };
