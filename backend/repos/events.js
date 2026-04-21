'use strict';

/**
 * Events repository — query helpers for evidence.events in BigQuery.
 */

const bq = require('../services/bigquery');
const { normalizeEvent } = require('../evidence/models');
const config = require('../config');

function _table(t) {
  return `\`${config.bigquery.projectId}.${config.bigquery.datasetId}.${t}\``;
}

/**
 * List events in an optional time range, ordered chronologically.
 *
 * @param {{ from?: string, to?: string, eventType?: string, limit?: number }} opts
 */
async function list({ from, to, eventType, limit = 200 } = {}) {
  const conditions = [];
  const params     = [];

  if (from) {
    conditions.push('occurred_at >= @from');
    params.push(bq.timestampParam('from', from));
  }
  if (to) {
    conditions.push('occurred_at <= @to');
    params.push(bq.timestampParam('to', to));
  }
  if (eventType) {
    conditions.push('event_type = @eventType');
    params.push(bq.stringParam('eventType', eventType));
  }
  params.push(bq.intParam('limit', limit));

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await bq.query(
    `SELECT * FROM ${_table('events')}
     ${where}
     ORDER BY occurred_at ASC NULLS LAST, created_at ASC
     LIMIT @limit`,
    params,
  );
  return rows.map(normalizeEvent);
}

/**
 * Get a single event by ID.
 * @param {string} id
 */
async function getById(id) {
  const rows = await bq.query(
    `SELECT * FROM ${_table('events')} WHERE id = @id LIMIT 1`,
    [bq.stringParam('id', id)],
  );
  return rows.length > 0 ? normalizeEvent(rows[0]) : null;
}

/**
 * List events associated with a specific entity.
 * @param {string} entityId
 * @param {number} [limit=50]
 */
async function listByEntity(entityId, limit = 50) {
  const rows = await bq.query(
    `SELECT * FROM ${_table('events')}
     WHERE @entityId IN UNNEST(entity_ids)
     ORDER BY occurred_at ASC NULLS LAST
     LIMIT @limit`,
    [bq.stringParam('entityId', entityId), bq.intParam('limit', limit)],
  );
  return rows.map(normalizeEvent);
}

module.exports = { list, getById, listByEntity };
