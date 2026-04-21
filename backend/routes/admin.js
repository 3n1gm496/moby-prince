'use strict';

/**
 * Admin API
 *
 * GET /api/admin/stats — aggregated stats for the ops dashboard
 *
 * Returns:
 *   sessions        { count }
 *   contradictions  { open, total }
 *   documents       { total }  (BigQuery; 0 when BQ not configured)
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
    let contradictionsOpen  = 0;
    let contradictionsTotal = 0;

    if (isBigQueryEnabled()) {
      const bq = require('../services/bigquery');
      const [docRows, contrRows] = await Promise.allSettled([
        bq.query('SELECT COUNT(*) AS cnt FROM `evidence.documents`'),
        bq.query('SELECT status, COUNT(*) AS cnt FROM `evidence.contradictions` GROUP BY status'),
      ]);

      if (docRows.status === 'fulfilled' && docRows.value.length > 0) {
        documentsTotal = Number(docRows.value[0].cnt || 0);
      }
      if (contrRows.status === 'fulfilled') {
        for (const row of contrRows.value) {
          const cnt = Number(row.cnt || 0);
          contradictionsTotal += cnt;
          if (row.status === 'open') contradictionsOpen += cnt;
        }
      }
    }

    log.debug({ sessionCount }, 'Admin stats served');

    res.json({
      sessions:       { count: sessionCount },
      contradictions: { open: contradictionsOpen, total: contradictionsTotal },
      documents:      { total: documentsTotal },
      rateLimiter,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
