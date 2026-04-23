'use strict';

/**
 * Timeline API
 *
 * BigQuery is the authoritative source. Manual editing and one-shot generation
 * have been removed in favour of structured events with explicit provenance.
 */

const { Router } = require('express');
const eventsRepo = require('../repos/events');
const gcs = require('../services/gcs');
const config = require('../config');
const { isBigQueryEnabled } = require('../services/bigquery');

const router = Router();
const EVENTS_PATH = '_timeline/events.json';

function _legacyType(type) {
  const map = {
    evento: 'event',
    udienza: 'judicial',
    sentenza: 'judicial',
    relazione: 'administrative',
    commissione: 'parliamentary',
  };
  return map[type] || type || 'event';
}

function _legacySource(doc, index, eventId) {
  if (!doc) return null;
  return {
    id: doc.id || `${eventId}-legacy-source-${index + 1}`,
    claimId: null,
    documentId: doc.id || null,
    title: doc.title || doc.id || 'Documento',
    uri: doc.uri || null,
    snippet: null,
    pageReference: null,
    pageIdentifier: null,
    mimeType: null,
    documentType: null,
    year: null,
    anchors: [],
  };
}

function _normalizeLegacyEvent(event, index) {
  const id = event.id || `legacy-${index + 1}`;
  const seenSources = new Set();
  const linkedDocs = (event.linkedDocs || []).filter((doc) => {
    const key = doc?.id || doc?.uri || doc?.title;
    if (!key) return false;
    if (seenSources.has(key)) return false;
    seenSources.add(key);
    return true;
  });

  return {
    id,
    title: event.title || 'Evento',
    description: event.description || null,
    eventType: _legacyType(event.type),
    occurredAt: event.date ? `${event.date}T00:00:00.000Z` : null,
    date: event.date || null,
    dateText: event.date || null,
    dateLabel: event.date || 'Data da verificare',
    dateAccuracy: event._aiGenerated ? 'inferred' : 'day',
    location: null,
    latitude: null,
    longitude: null,
    entityIds: [],
    sourceClaimIds: [],
    isDisputed: false,
    disputeNotes: null,
    createdAt: null,
    updatedAt: null,
    sources: linkedDocs
      .map((doc, sourceIndex) => _legacySource(doc, sourceIndex, id))
      .filter(Boolean),
    source: 'gcs',
  };
}

async function _readGcsEvents() {
  if (!config.gcsBucket) return [];
  try {
    const obj = await gcs.getObject(EVENTS_PATH);
    const text = await obj.text();
    const events = JSON.parse(text);
    return Array.isArray(events)
      ? events.map(_normalizeLegacyEvent)
      : [];
  } catch (err) {
    if (err.statusCode === 404) return [];
    throw err;
  }
}

router.get('/events', async (req, res, next) => {
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  const eventType = typeof req.query.eventType === 'string' ? req.query.eventType : undefined;
  const limit = Math.min(parseInt(req.query.limit, 10) || 500, 1000);

  try {
    let bigQueryError = null;

    if (isBigQueryEnabled()) {
      try {
        const events = await eventsRepo.listTimeline({ from, to, eventType, limit });
        if (events.length > 0) {
          return res.json({ events, total: events.length, source: 'bigquery' });
        }
      } catch (err) {
        bigQueryError = err;
      }
    }

    const fallbackEvents = await _readGcsEvents();
    res.json({
      events: fallbackEvents.slice(0, limit),
      total: fallbackEvents.length,
      source: fallbackEvents.length > 0 ? 'gcs' : 'empty',
      degraded: Boolean(bigQueryError),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
