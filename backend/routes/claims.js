'use strict';

/**
 * Claims API
 *
 * GET  /api/claims              — list claims (?documentId=&limit=)
 * GET  /api/claims/:id          — single claim
 * POST /api/claims/verify       — verify free text against the corpus
 *
 * All routes return 501 when BigQuery is not configured.
 */

const { Router } = require('express');
const claimsRepo = require('../repos/claims');
const verifier   = require('../services/claimVerifier');
const { isBigQueryEnabled } = require('../services/bigquery');

const router = Router();

function requireBQ(res) {
  if (!isBigQueryEnabled()) {
    res.status(501).json({ error: 'BigQuery not configured — claims unavailable.' });
    return false;
  }
  return true;
}

// ── GET /api/claims ───────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  if (!requireBQ(res)) return;

  const documentId = typeof req.query.documentId === 'string' ? req.query.documentId : null;
  const limit      = Math.min(parseInt(req.query.limit, 10) || 50, 200);

  if (!documentId) return res.status(400).json({ error: '"documentId" query param required.' });

  try {
    const claims = await claimsRepo.listByDocument(documentId, limit);
    res.json({ claims, total: claims.length });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/claims/verify ───────────────────────────────────────────────────
// Must be before /:id

router.post('/verify', async (req, res, next) => {
  if (!requireBQ(res)) return;

  const { text } = req.body || {};
  if (!text || typeof text !== 'string' || text.trim().length < 10) {
    return res.status(400).json({ error: '"text" (min 10 chars) required.' });
  }

  try {
    const candidates = await claimsRepo.findSimilar(text.trim(), [], 5);
    const result     = await verifier.verifyClaim(text.trim(), candidates);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/claims/:id ───────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  if (!requireBQ(res)) return;
  try {
    const claim = await claimsRepo.getById(req.params.id);
    if (!claim) return res.status(404).json({ error: 'Claim not found.' });
    res.json(claim);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
