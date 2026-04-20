'use strict';

/**
 * Timeline API
 *
 * GET  /api/timeline/documents   — all DE documents with year metadata
 * GET  /api/timeline/events      — curated events from GCS _timeline/events.json
 * PUT  /api/timeline/events      — save entire events array to GCS
 */

const { Router } = require('express');
const de     = require('../services/discoveryEngine');
const gcs    = require('../services/gcs');
const config = require('../config');

const router      = Router();
const EVENTS_PATH = '_timeline/events.json';

// ── GET /api/timeline/documents ───────────────────────────────────────────────

router.get('/documents', async (req, res, next) => {
  try {
    let allDocs   = [];
    let pageToken = null;
    let page      = 0;

    do {
      const data = await de.listDocuments(pageToken, 100);
      (data.documents || []).forEach(doc => {
        const sd = doc.structData || {};
        allDocs.push({
          id:           doc.name?.split('/').pop() || '',
          title:        sd.title        || doc.name?.split('/').pop() || '',
          year:         sd.year         ? Number(sd.year) : null,
          documentType: sd.documentType || null,
          institution:  sd.institution  || null,
          legislature:  sd.legislature  || null,
          uri:          doc.content?.uri || null,
        });
      });
      pageToken = data.nextPageToken || null;
      page++;
    } while (pageToken && page < 20);

    res.json({ documents: allDocs.filter(d => d.year), total: allDocs.length });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/timeline/events ──────────────────────────────────────────────────

router.get('/events', async (req, res, next) => {
  if (!config.gcsBucket) return res.json({ events: [] });
  try {
    const obj    = await gcs.getObject(EVENTS_PATH);
    const text   = await obj.text();
    const events = JSON.parse(text);
    res.json({ events: Array.isArray(events) ? events : [] });
  } catch (err) {
    if (err.statusCode === 404) return res.json({ events: [] });
    next(err);
  }
});

// ── PUT /api/timeline/events ──────────────────────────────────────────────────

router.put('/events', async (req, res, next) => {
  if (!config.gcsBucket) return res.status(501).json({ error: 'GCS_BUCKET not configured.' });
  const { events } = req.body || {};
  if (!Array.isArray(events)) return res.status(400).json({ error: '"events" array required.' });
  try {
    const buf = Buffer.from(JSON.stringify(events, null, 2), 'utf-8');
    await gcs.uploadObject(EVENTS_PATH, 'application/json', buf);
    res.json({ success: true, count: events.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
