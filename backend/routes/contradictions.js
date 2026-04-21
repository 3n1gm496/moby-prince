'use strict';

/**
 * Contradictions API
 *
 * GET   /api/contradictions                — list (filters: ?status=&severity=&documentId=)
 * GET   /api/contradictions/:id            — detail with claim A/B texts
 * PATCH /api/contradictions/:id            — update status / resolution
 * POST  /api/contradictions/detect         — trigger pairwise detection for a document
 *
 * All routes return 501 when BigQuery is not configured.
 */

const { Router } = require('express');
const contradictionsRepo = require('../repos/contradictions');
const claimsRepo         = require('../repos/claims');
const detector           = require('../services/contradictionDetector');
const { isBigQueryEnabled } = require('../services/bigquery');
const { createLogger }   = require('../logger');

const router = Router();
const log    = createLogger('contradictions-route');

function requireBQ(res) {
  if (!isBigQueryEnabled()) {
    res.status(501).json({ error: 'BigQuery not configured — contradictions unavailable.' });
    return false;
  }
  return true;
}

// ── GET /api/contradictions ───────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  if (!requireBQ(res)) return;

  const status     = typeof req.query.status     === 'string' ? req.query.status     : undefined;
  const severity   = typeof req.query.severity   === 'string' ? req.query.severity   : undefined;
  const documentId = typeof req.query.documentId === 'string' ? req.query.documentId : undefined;
  const limit      = Math.min(parseInt(req.query.limit, 10) || 50, 200);

  try {
    const contradictions = await contradictionsRepo.list({ status, severity, documentId, limit });
    res.json({ contradictions, total: contradictions.length });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/contradictions/detect ──────────────────────────────────────────
// Must be before /:id to avoid route shadowing

router.post('/detect', async (req, res, next) => {
  if (!requireBQ(res)) return;

  const { documentId, claimIds } = req.body || {};
  if (!documentId && (!Array.isArray(claimIds) || claimIds.length === 0)) {
    return res.status(400).json({ error: '"documentId" or non-empty "claimIds" array required.' });
  }

  try {
    let claims;
    if (Array.isArray(claimIds) && claimIds.length > 0) {
      // Fetch specific claims by ID
      claims = await Promise.all(claimIds.slice(0, 20).map(id => claimsRepo.getById(id)));
      claims = claims.filter(Boolean);
    } else {
      claims = await claimsRepo.listByDocument(documentId, 30);
    }

    if (claims.length < 2) {
      return res.json({ contradictions: [], detected: 0, message: 'Not enough claims to compare.' });
    }

    const contradictions = await detector.detectAmong(claims);
    res.json({ contradictions, detected: contradictions.length });
  } catch (err) {
    log.error({ error: err.message }, 'Contradiction detect failed');
    next(err);
  }
});

// ── GET /api/contradictions/:id ───────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  if (!requireBQ(res)) return;
  try {
    const contradiction = await contradictionsRepo.getById(req.params.id);
    if (!contradiction) return res.status(404).json({ error: 'Contradiction not found.' });
    res.json(contradiction);
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/contradictions/:id ─────────────────────────────────────────────

router.patch('/:id', async (req, res, next) => {
  if (!requireBQ(res)) return;

  const { status, resolution } = req.body || {};
  const VALID_STATUSES = new Set(['open', 'resolved', 'contested', 'under_review']);
  if (status && !VALID_STATUSES.has(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${[...VALID_STATUSES].join(', ')}` });
  }

  const delta = {};
  if (status     !== undefined) delta.status     = status;
  if (resolution !== undefined) delta.resolution = resolution;

  if (Object.keys(delta).length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided (status, resolution).' });
  }

  try {
    const updated = await contradictionsRepo.update(req.params.id, delta);
    if (!updated) return res.status(404).json({ error: 'Contradiction not found.' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
