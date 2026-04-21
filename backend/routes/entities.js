'use strict';

/**
 * Entities API
 *
 * GET  /api/entities            — list all entities (with mention counts)
 * GET  /api/entities/search?q=  — substring search on canonical name / aliases
 * GET  /api/entities/:id        — entity detail
 * GET  /api/entities/:id/claims — cross-document claims that reference this entity
 * GET  /api/entities/:id/events — timeline events associated with this entity
 *
 * All routes return 501 when BigQuery is not configured.
 */

const { Router } = require('express');
const entitiesRepo = require('../repos/entities');
const claimsRepo   = require('../repos/claims');
const eventsRepo   = require('../repos/events');
const { isBigQueryEnabled } = require('../services/bigquery');

const router = Router();

function requireBQ(res) {
  if (!isBigQueryEnabled()) {
    res.status(501).json({ error: 'BigQuery not configured — evidence layer unavailable.' });
    return false;
  }
  return true;
}

// ── GET /api/entities ─────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  if (!requireBQ(res)) return;
  const entityType = typeof req.query.type === 'string' ? req.query.type : undefined;
  const limit      = Math.min(parseInt(req.query.limit, 10) || 200, 500);
  try {
    const entities = await entitiesRepo.list({ entityType, limit });
    res.json({ entities, total: entities.length });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/entities/search ──────────────────────────────────────────────────

router.get('/search', async (req, res, next) => {
  if (!requireBQ(res)) return;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!q) return res.status(400).json({ error: '"q" query param required.' });
  try {
    const entities = await entitiesRepo.search(q);
    res.json({ entities });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/entities/:id ─────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  if (!requireBQ(res)) return;
  try {
    const entity = await entitiesRepo.getById(req.params.id);
    if (!entity) return res.status(404).json({ error: 'Entity not found.' });
    res.json(entity);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/entities/:id/claims ──────────────────────────────────────────────

router.get('/:id/claims', async (req, res, next) => {
  if (!requireBQ(res)) return;
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  try {
    const claims = await claimsRepo.listByEntity(req.params.id, limit);
    res.json({ claims, total: claims.length });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/entities/:id/events ──────────────────────────────────────────────

router.get('/:id/events', async (req, res, next) => {
  if (!requireBQ(res)) return;
  try {
    const events = await eventsRepo.listByEntity(req.params.id);
    res.json({ events, total: events.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
