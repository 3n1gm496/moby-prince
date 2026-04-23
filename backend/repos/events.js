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

const TABLE_EXISTS_CACHE_MS = 60_000;
let sourceAnchorsTableState = { checkedAt: 0, exists: null };

function _table(t) {
  return `\`${config.bigquery.projectId}.${config.bigquery.datasetId}.${t}\``;
}

async function _hasSourceAnchorsTable() {
  const now = Date.now();
  if (
    sourceAnchorsTableState.exists !== null
    && now - sourceAnchorsTableState.checkedAt < TABLE_EXISTS_CACHE_MS
  ) {
    return sourceAnchorsTableState.exists;
  }

  const exists = await bq.tableExists('source_anchors');
  sourceAnchorsTableState = { checkedAt: now, exists };
  return exists;
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

function _eventRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    event_type: row.event_type,
    occurred_at: row.occurred_at,
    date_text: row.date_text,
    date_precision: row.date_precision,
    location: row.location,
    latitude: row.latitude,
    longitude: row.longitude,
    entity_ids: row.entity_ids,
    source_claim_ids: row.source_claim_ids,
    is_disputed: row.is_disputed,
    dispute_notes: row.dispute_notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    sources: [],
  };
}

function _anchorFromFlatRow(row) {
  if (!row.anchor_id) return null;
  return {
    id: row.anchor_id,
    document_id: row.anchor_document_id,
    claim_id: row.anchor_claim_id,
    event_id: row.anchor_event_id,
    anchor_type: row.anchor_type,
    page_number: row.anchor_page_number,
    text_quote: row.anchor_text_quote,
    snippet: row.anchor_snippet,
    time_start_seconds: row.anchor_time_start_seconds,
    time_end_seconds: row.anchor_time_end_seconds,
    frame_reference: row.anchor_frame_reference,
    shot_reference: row.anchor_shot_reference,
    anchor_confidence: row.anchor_confidence,
    source_uri: row.anchor_source_uri,
    mime_type: row.anchor_mime_type,
    created_at: row.anchor_created_at,
    updated_at: row.anchor_updated_at,
  };
}

function _sourceFromFlatRow(row) {
  if (!row.source_claim_id && !row.source_document_id && !row.source_uri && !row.source_title) return null;
  return {
    id: row.source_id || row.source_claim_id || row.source_document_id,
    claim_id: row.source_claim_id,
    snippet: row.source_snippet,
    page_reference: row.source_page_reference,
    document_id: row.source_document_id,
    title: row.source_title,
    uri: row.source_uri,
    document_type: row.source_document_type,
    year: row.source_year,
    normalized_uri: row.source_normalized_uri,
    mime_type: row.source_mime_type,
    anchors: [],
  };
}

function _aggregateTimelineRows(rows) {
  const events = new Map();

  for (const row of rows) {
    if (!events.has(row.id)) {
      events.set(row.id, {
        event: _eventRow(row),
        sourcesByKey: new Map(),
      });
    }

    const bucket = events.get(row.id);
    const source = _sourceFromFlatRow(row);
    if (!source) continue;

    const sourceKey = source.claim_id || source.document_id || source.uri || source.title;
    if (!bucket.sourcesByKey.has(sourceKey)) {
      bucket.sourcesByKey.set(sourceKey, source);
    }

    const anchor = _anchorFromFlatRow(row);
    if (anchor) {
      const current = bucket.sourcesByKey.get(sourceKey);
      if (!current.anchors.some((item) => item.id === anchor.id)) {
        current.anchors.push(anchor);
      }
    }
  }

  return Array.from(events.values()).map(({ event, sourcesByKey }) => {
    event.sources = Array.from(sourcesByKey.values());
    return _buildTimelineEvent(event);
  });
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
  const anchorJoin = includeAnchors
    ? `LEFT JOIN ${_table('source_anchors')} a
         ON a.document_id = c.document_id
        AND (a.claim_id = c.id OR a.event_id = e.id)`
    : '';
  const anchorFields = includeAnchors
    ? `
      a.id AS anchor_id,
      a.document_id AS anchor_document_id,
      a.claim_id AS anchor_claim_id,
      a.event_id AS anchor_event_id,
      a.anchor_type AS anchor_type,
      a.page_number AS anchor_page_number,
      a.text_quote AS anchor_text_quote,
      a.snippet AS anchor_snippet,
      a.time_start_seconds AS anchor_time_start_seconds,
      a.time_end_seconds AS anchor_time_end_seconds,
      a.frame_reference AS anchor_frame_reference,
      a.shot_reference AS anchor_shot_reference,
      a.anchor_confidence AS anchor_confidence,
      COALESCE(a.source_uri, d.source_uri, c.document_uri) AS anchor_source_uri,
      a.mime_type AS anchor_mime_type,
      a.created_at AS anchor_created_at,
      a.updated_at AS anchor_updated_at`
    : `
      NULL AS anchor_id,
      NULL AS anchor_document_id,
      NULL AS anchor_claim_id,
      NULL AS anchor_event_id,
      NULL AS anchor_type,
      NULL AS anchor_page_number,
      NULL AS anchor_text_quote,
      NULL AS anchor_snippet,
      NULL AS anchor_time_start_seconds,
      NULL AS anchor_time_end_seconds,
      NULL AS anchor_frame_reference,
      NULL AS anchor_shot_reference,
      NULL AS anchor_confidence,
      NULL AS anchor_source_uri,
      NULL AS anchor_mime_type,
      NULL AS anchor_created_at,
      NULL AS anchor_updated_at`;

  return `
    WITH selected_events AS (
      SELECT e.*
      FROM ${_table('events')} e
      __WHERE__
      ORDER BY e.occurred_at ASC NULLS LAST, e.created_at ASC
      LIMIT @limit
    )
    SELECT
      e.*,
      c.id AS source_id,
      c.id AS source_claim_id,
      c.text AS source_snippet,
      CAST(c.page_reference AS STRING) AS source_page_reference,
      c.document_id AS source_document_id,
      COALESCE(d.title, c.document_id) AS source_title,
      COALESCE(d.source_uri, c.document_uri) AS source_uri,
      d.document_type AS source_document_type,
      d.year AS source_year,
      d.normalized_uri AS source_normalized_uri,
      NULL AS source_mime_type,
      ${anchorFields}
    FROM selected_events e
    LEFT JOIN UNNEST(IFNULL(e.source_claim_ids, ARRAY<STRING>[])) AS source_claim_id
    LEFT JOIN ${_table('claims')} c
      ON c.id = source_claim_id
    LEFT JOIN ${_table('documents')} d
      ON d.id = c.document_id
    ${anchorJoin}
    ORDER BY e.occurred_at ASC NULLS LAST,
             e.created_at ASC,
             source_claim_id ASC,
             anchor_confidence DESC NULLS LAST,
             anchor_page_number ASC NULLS LAST,
             anchor_time_start_seconds ASC NULLS LAST
  `;
}

async function _listTimelineInternal({ from, to, eventType, entityId, limit = 500 }) {
  const { where, params } = _timelineWhere({ from, to, eventType, entityId });
  params.push(bq.intParam('limit', limit));

  if (await _hasSourceAnchorsTable()) {
    try {
      const rows = await bq.query(
        _timelineQuery({ includeAnchors: true }).replace('__WHERE__', where),
        params,
      );
      return _aggregateTimelineRows(rows);
    } catch (err) {
      if (!/source_anchors/i.test(err.message || '') && !/not found/i.test(err.message || '')) {
        throw err;
      }
      sourceAnchorsTableState = { checkedAt: Date.now(), exists: false };
    }
  }

  const rows = await bq.query(
    _timelineQuery({ includeAnchors: false }).replace('__WHERE__', where),
    params,
  );
  return _aggregateTimelineRows(rows);
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
