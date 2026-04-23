'use strict';

/**
 * Timeline API
 *
 * BigQuery is the authoritative source. Manual editing and one-shot generation
 * have been removed in favour of structured events with explicit provenance.
 */

const { Router } = require('express');
const eventsRepo = require('../repos/events');
const { isBigQueryEnabled } = require('../services/bigquery');

const router = Router();

function requireBQ(res) {
  if (!isBigQueryEnabled()) {
    res.status(501).json({ error: 'BigQuery not configured — timeline unavailable.' });
    return false;
  }
  return true;
}

router.get('/events', async (req, res, next) => {
  if (!requireBQ(res)) return;

  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  const eventType = typeof req.query.eventType === 'string' ? req.query.eventType : undefined;
  const limit = Math.min(parseInt(req.query.limit, 10) || 500, 1000);

  try {
    const events = await eventsRepo.listTimeline({ from, to, eventType, limit });
    res.json({ events, total: events.length, source: 'bigquery' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
