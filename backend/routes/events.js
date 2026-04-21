'use strict';

/**
 * Events API — structured timeline events from BigQuery evidence layer.
 *
 * GET  /api/events              — list events (optional ?from=&to=&type=)
 * GET  /api/events/:id          — single event detail
 *
 * Returns 501 when BigQuery is not configured.
 */

const { Router } = require('express');
const eventsRepo = require('../repos/events');
const { isBigQueryEnabled } = require('../services/bigquery');

const router = Router();

function requireBQ(res) {
  if (!isBigQueryEnabled()) {
    res.status(501).json({ error: 'BigQuery not configured — events unavailable.' });
    return false;
  }
  return true;
}

// ── GET /api/events ───────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  if (!requireBQ(res)) return;

  const from      = typeof req.query.from      === 'string' ? req.query.from      : undefined;
  const to        = typeof req.query.to        === 'string' ? req.query.to        : undefined;
  const eventType = typeof req.query.eventType === 'string' ? req.query.eventType : undefined;
  const limit     = Math.min(parseInt(req.query.limit, 10) || 200, 1000);

  try {
    const events = await eventsRepo.list({ from, to, eventType, limit });
    res.json({ events, total: events.length, source: 'bigquery' });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/events/:id ───────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  if (!requireBQ(res)) return;
  try {
    const event = await eventsRepo.getById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found.' });
    res.json(event);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
