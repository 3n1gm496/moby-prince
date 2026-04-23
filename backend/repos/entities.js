'use strict';

/**
 * Entities repository — query helpers for evidence.entities in BigQuery.
 */

const bq = require('../services/bigquery');
const { normalizeEntity } = require('../evidence/models');
const config = require('../config');

function _table(t) {
  return `\`${config.bigquery.projectId}.${config.bigquery.datasetId}.${t}\``;
}

/**
 * List all entities, optionally filtered by type.
 * Enriched with mention_count derived from the claims table.
 *
 * @param {{ entityType?: string, limit?: number }} opts
 */
async function list({ entityType, limit = 200 } = {}) {
  const conditions = entityType ? 'WHERE e.entity_type = @entityType' : '';
  const params     = [];
  if (entityType) params.push(bq.stringParam('entityType', entityType));
  params.push(bq.intParam('limit', limit));

  const rows = await bq.query(
    `SELECT e.*,
            COALESCE(c.mention_count, 0) AS mention_count
     FROM ${_table('entities')} e
     LEFT JOIN (
       SELECT eid, COUNT(*) AS mention_count
       FROM ${_table('claims')},
       UNNEST(entity_ids) AS eid
       GROUP BY eid
     ) c ON c.eid = e.id
     ${conditions}
     ORDER BY mention_count DESC, canonical_name ASC
     LIMIT @limit`,
    params,
  );
  return rows.map(row => ({ ...normalizeEntity(row), mentionCount: Number(row.mention_count || 0) }));
}

/**
 * Get a single entity by ID.
 * @param {string} id
 */
async function getById(id) {
  const rows = await bq.query(
    `SELECT * FROM ${_table('entities')} WHERE id = @id LIMIT 1`,
    [bq.stringParam('id', id)],
  );
  return rows.length > 0 ? normalizeEntity(rows[0]) : null;
}

/**
 * Search entities by canonical name (case-insensitive substring match).
 * @param {string} q
 * @param {number} [limit=20]
 */
async function search(q, limit = 20) {
  const rows = await bq.query(
    `SELECT * FROM ${_table('entities')}
     WHERE LOWER(canonical_name) LIKE @q
        OR EXISTS (SELECT 1 FROM UNNEST(aliases) a WHERE LOWER(a) LIKE @q)
     ORDER BY canonical_name ASC
     LIMIT @limit`,
    [bq.stringParam('q', `%${q.toLowerCase()}%`), bq.intParam('limit', limit)],
  );
  return rows.map(normalizeEntity);
}

async function listDocuments(entityId, limit = 20) {
  const rows = await bq.query(
    `SELECT
        d.id,
        d.title,
        d.source_uri,
        d.document_type,
        d.institution,
        d.year,
        COUNT(*) AS mention_count
      FROM ${_table('claims')} c
      INNER JOIN ${_table('documents')} d
        ON d.id = c.document_id
      WHERE @entityId IN UNNEST(c.entity_ids)
      GROUP BY d.id, d.title, d.source_uri, d.document_type, d.institution, d.year
      ORDER BY mention_count DESC, d.year DESC, d.title ASC
      LIMIT @limit`,
    [
      bq.stringParam('entityId', entityId),
      bq.intParam('limit', limit),
    ],
  );

  return rows.map((row) => ({
    id: row.id,
    title: row.title || row.id,
    uri: row.source_uri || null,
    documentType: row.document_type || null,
    institution: row.institution || null,
    year: row.year != null ? Number(row.year) : null,
    mentionCount: Number(row.mention_count || 0),
  }));
}

module.exports = { list, getById, search, listDocuments };
