'use strict';

/**
 * Events repository — query helpers for evidence.events in BigQuery.
 *
 * Timeline and entity surfaces share the same source contract:
 * each event is returned with ready-to-render `sources[]`, and every source
 * carries structured `anchors[]` when the dataset has been backfilled with the
 * new provenance tables. If the `source_anchors` table is not available yet,
 * we gracefully fall back to a lightweight source shape derived from claims.
 */

const bq = require('../services/bigquery');
const { normalizeEvent, normalizeEvidenceSource } = require('../evidence/models');
const config = require('../config');

function _table(t) {
  return `\`${config.bigquery.projectId}.${config.bigquery.datasetId}.${t}\``;
}

function _parsePageNumber(pageReference) {
  if (!pageReference) return null;
  const match = String(pageReference).match(/(\d{1,4})/);
  return match ? Number(match[1]) : null;
}

function _deriveFallbackAnchors(source) {
  const anchors = [];
  const pageNumber = _parsePageNumber(source.page_reference);

  if (pageNumber != null) {
    anchors.push({
      id: `${source.claim_id || source.document_id || 'source'}-page-${pageNumber}`,
      document_id: source.document_id || null,
      claim_id: source.claim_id || null,
      event_id: null,
      anchor_type: 'page',
      page_number: pageNumber,
      text_quote: null,
      snippet: source.snippet || null,
      time_start_seconds: null,
      time_end_seconds: null,
      frame_reference: null,
      shot_reference: null,
      anchor_confidence: 0.6,
      source_uri: source.uri || null,
      mime_type: source.mime_type || null,
      created_at: null,
      updated_at: null,
    });
  }

  if (source.snippet) {
    anchors.push({
      id: `${source.claim_id || source.document_id || 'source'}-snippet`,
      document_id: source.document_id || null,
      claim_id: source.claim_id || null,
      event_id: null,
      anchor_type: 'text_span',
      page_number: pageNumber,
      text_quote: source.snippet,
      snippet: source.snippet,
      time_start_seconds: null,
      time_end_seconds: null,
      frame_reference: null,
      shot_reference: null,
      anchor_confidence: 0.5,
      source_uri: source.uri || null,
      mime_type: source.mime_type || null,
      created_at: null,
      updated_at: null,
    });
  }

  return anchors;
}

function _dateAccuracy(event) {
  if (event.datePrecision) return event.datePrecision;
  if (event.occurredAt) return 'exact';
  if (event.dateText) return 'approximate';
  return 'inferred';
}

function _buildTimelineEvent(row) {
  const event = normalizeEvent(row);
  const occurredDate = event.occurredAt ? event.occurredAt.slice(0, 10) : null;
  const sources = Array.isArray(row.sources)
    ? row.sources
        .filter((src) => src?.document_id || src?.uri || src?.title)
        .map((src, index) => {
          const normalized = normalizeEvidenceSource({
            ...src,
            id: src.id || src.claim_id || `${event.id}-source-${index + 1}`,
            anchors: Array.isArray(src.anchors) && src.anchors.length > 0
              ? src.anchors
              : _deriveFallbackAnchors(src),
          });
          const primaryAnchor = normalized.anchors[0] || null;
          return {
            ...normalized,
            pageIdentifier: primaryAnchor?.pageNumber != null ? String(primaryAnchor.pageNumber) : null,
            timeIdentifier: primaryAnchor?.timeStartSeconds ?? null,
          };
        })
    : [];

  return {
    ...event,
    date: occurredDate,
    dateLabel: event.dateText || occurredDate || 'Data da verificare',
    dateAccuracy: _dateAccuracy(event),
    sources,
  };
}

async function list({ from, to, eventType, limit = 200 } = {}) {
  const conditions = [];
  const params = [];

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

function _timelineWhere({ from, to, eventType, entityId }) {
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
  if (entityId) {
    conditions.push('@entityId IN UNNEST(e.entity_ids)');
    params.push(bq.stringParam('entityId', entityId));
  }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

function _timelineQuery({ includeAnchors }) {
  const anchorsSelect = includeAnchors
    ? `ARRAY(
         SELECT AS STRUCT
           a.id,
           a.document_id,
           a.claim_id,
           a.event_id,
           a.anchor_type,
           a.page_number,
           a.text_quote,
           a.snippet,
           a.time_start_seconds,
           a.time_end_seconds,
           a.frame_reference,
           a.shot_reference,
           a.anchor_confidence,
           COALESCE(a.source_uri, d.source_uri, c.document_uri) AS source_uri,
           a.mime_type,
           a.created_at,
           a.updated_at
         FROM ${_table('source_anchors')} a
         WHERE a.document_id = c.document_id
           AND (a.claim_id = c.id OR a.event_id = e.id)
         ORDER BY a.anchor_confidence DESC NULLS LAST,
                  a.page_number ASC NULLS LAST,
                  a.time_start_seconds ASC NULLS LAST
       )`
    : '[]';

  return `
    SELECT
      e.*,
      ARRAY(
        SELECT AS STRUCT
          c.id AS id,
          c.id AS claim_id,
          c.text AS snippet,
          CAST(c.page_reference AS STRING) AS page_reference,
          c.document_id AS document_id,
          COALESCE(d.title, c.document_id) AS title,
          COALESCE(d.source_uri, c.document_uri) AS uri,
          d.document_type AS document_type,
          d.year AS year,
          d.normalized_uri AS normalized_uri,
          NULL AS mime_type,
          ${anchorsSelect} AS anchors
        FROM UNNEST(IFNULL(e.source_claim_ids, [])) AS source_claim_id
        LEFT JOIN ${_table('claims')} c
          ON c.id = source_claim_id
        LEFT JOIN ${_table('documents')} d
          ON d.id = c.document_id
        WHERE c.id IS NOT NULL
      ) AS sources
    FROM ${_table('events')} e
  `;
}

async function _listTimelineInternal({ from, to, eventType, entityId, limit = 500 }) {
  const { where, params } = _timelineWhere({ from, to, eventType, entityId });
  params.push(bq.intParam('limit', limit));

  try {
    const rows = await bq.query(
      `${_timelineQuery({ includeAnchors: true })}
       ${where}
       ORDER BY e.occurred_at ASC NULLS LAST, e.created_at ASC
       LIMIT @limit`,
      params,
    );
    return rows.map(_buildTimelineEvent);
  } catch (err) {
    if (!/source_anchors/i.test(err.message || '') && !/not found/i.test(err.message || '')) {
      throw err;
    }

    const rows = await bq.query(
      `${_timelineQuery({ includeAnchors: false })}
       ${where}
       ORDER BY e.occurred_at ASC NULLS LAST, e.created_at ASC
       LIMIT @limit`,
      params,
    );
    return rows.map(_buildTimelineEvent);
  }
}

async function listTimeline({ from, to, eventType, limit = 500 } = {}) {
  return _listTimelineInternal({ from, to, eventType, limit });
}

async function getById(id) {
  const rows = await bq.query(
    `SELECT * FROM ${_table('events')} WHERE id = @id LIMIT 1`,
    [bq.stringParam('id', id)],
  );
  return rows.length > 0 ? normalizeEvent(rows[0]) : null;
}

async function listByEntity(entityId, limit = 50) {
  return _listTimelineInternal({ entityId, limit });
}

module.exports = { list, listTimeline, getById, listByEntity };
