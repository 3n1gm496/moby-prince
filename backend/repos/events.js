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

function _parsePageNumber(pageReference) {
  if (!pageReference) return null;
  const match = String(pageReference).match(/(\d{1,4})/);
  return match ? match[1] : null;
}

function _buildTimelineEvent(row) {
  const event = normalizeEvent(row);
  const occurredDate = event.occurredAt ? event.occurredAt.slice(0, 10) : null;

  return {
    ...event,
    date: occurredDate,
    dateLabel: event.dateText || occurredDate || 'Data da verificare',
    dateAccuracy: event.datePrecision || (occurredDate ? 'exact' : 'approximate'),
    sources: Array.isArray(row.sources)
      ? row.sources
          .filter((src) => src?.document_id || src?.uri || src?.title)
          .map((src, index) => ({
            id: src.claim_id || `${event.id}-source-${index + 1}`,
            claimId: src.claim_id || null,
            documentId: src.document_id || null,
            title: src.title || src.document_id || 'Documento',
            uri: src.uri || null,
            snippet: src.snippet || null,
            pageReference: src.page_reference || null,
            pageIdentifier: _parsePageNumber(src.page_reference),
            mimeType: src.mime_type || null,
            documentType: src.document_type || null,
            year: src.year != null ? Number(src.year) : null,
          }))
      : [],
  };
}

async function listTimeline({ from, to, eventType, limit = 500 } = {}) {
  const conditions = [];
  const params = [];

  if (from) {
    conditions.push('e.occurred_at >= @from');
    params.push(bq.timestampParam('from', from));
  }
  if (to) {
    conditions.push('e.occurred_at <= @to');
    params.push(bq.timestampParam('to', to));
  }
  if (eventType) {
    conditions.push('e.event_type = @eventType');
    params.push(bq.stringParam('eventType', eventType));
  }
  params.push(bq.intParam('limit', limit));

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await bq.query(
    `SELECT
        e.*,
        ARRAY(
          SELECT AS STRUCT
            c.id AS claim_id,
            c.text AS snippet,
            c.page_reference AS page_reference,
            c.document_id AS document_id,
            COALESCE(d.title, c.document_id) AS title,
            COALESCE(d.source_uri, c.source_uri) AS uri,
            d.document_type AS document_type,
            d.year AS year,
            NULL AS mime_type
          FROM UNNEST(IFNULL(e.source_claim_ids, [])) AS source_claim_id
          LEFT JOIN ${_table('claims')} c
            ON c.id = source_claim_id
          LEFT JOIN ${_table('documents')} d
            ON d.id = c.document_id
          WHERE c.id IS NOT NULL
        ) AS sources
      FROM ${_table('events')} e
      ${where}
      ORDER BY e.occurred_at ASC NULLS LAST, e.created_at ASC
      LIMIT @limit`,
    params,
  );

  return rows.map(_buildTimelineEvent);
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

module.exports = { list, listTimeline, getById, listByEntity };
