'use strict';

/**
 * Admin API
 *
 * GET /api/admin/stats — aggregated stats for the ops dashboard
 *
 * Returns:
 *   sessions        { count }
 *   documents       { total }  (BigQuery; 0 when BQ not configured)
 *   entities        { total }
 *   events          { total }
 *   rateLimiter     { gemini: { count, limit }, bq: { count, limit }, resetAt }
 *
 * Protected by the same X-API-Key middleware as all other /api routes.
 */

const { Router }            = require('express');
const fs                    = require('../services/firestore');
const { isBigQueryEnabled } = require('../services/bigquery');
const { getCounters }       = require('../services/rateLimiter');
const { createLogger }      = require('../logger');

const router = Router();
const log    = createLogger('admin-route');

router.get('/stats', async (req, res, next) => {
  try {
    const [sessionsResult, rateLimiter] = await Promise.all([
      fs.listDocuments('sessions', 100).catch(() => ({ documents: [] })),
      Promise.resolve(getCounters()),
    ]);

    const sessionCount = sessionsResult.documents.length;

    // BQ stats — optional; fail gracefully
    let documentsTotal = 0;
    let entitiesTotal = 0;
    let eventsTotal = 0;

    if (isBigQueryEnabled()) {
      const bq = require('../services/bigquery');
      const [docRows, entityRows, eventRows] = await Promise.allSettled([
        bq.query('SELECT COUNT(*) AS cnt FROM `evidence.documents`'),
        bq.query('SELECT COUNT(*) AS cnt FROM `evidence.entities`'),
        bq.query('SELECT COUNT(*) AS cnt FROM `evidence.events`'),
      ]);

      if (docRows.status === 'fulfilled' && docRows.value.length > 0) {
        documentsTotal = Number(docRows.value[0].cnt || 0);
      }
      if (entityRows.status === 'fulfilled' && entityRows.value.length > 0) {
        entitiesTotal = Number(entityRows.value[0].cnt || 0);
      }
      if (eventRows.status === 'fulfilled' && eventRows.value.length > 0) {
        eventsTotal = Number(eventRows.value[0].cnt || 0);
      }
    }

    log.debug({ sessionCount }, 'Admin stats served');

    res.json({
      sessions:  { count: sessionCount },
      documents: { total: documentsTotal },
      entities:  { total: entitiesTotal },
      events:    { total: eventsTotal },
      rateLimiter,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
