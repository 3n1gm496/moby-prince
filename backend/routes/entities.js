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
const gemini       = require('../services/gemini');
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

router.get('/:id/context', async (req, res, next) => {
  if (!requireBQ(res)) return;

  const claimsLimit = Math.min(parseInt(req.query.claimsLimit, 10) || 15, 50);
  const docsLimit = Math.min(parseInt(req.query.docsLimit, 10) || 12, 50);
  const eventsLimit = Math.min(parseInt(req.query.eventsLimit, 10) || 20, 50);

  try {
    const entity = await entitiesRepo.getById(req.params.id);
    if (!entity) return res.status(404).json({ error: 'Entity not found.' });

    const [claims, events, documents] = await Promise.all([
      claimsRepo.listByEntity(req.params.id, claimsLimit),
      eventsRepo.listByEntity(req.params.id, eventsLimit),
      entitiesRepo.listDocuments(req.params.id, docsLimit),
    ]);

    let summary = null;
    try {
      const summaryResult = await gemini.generateJson(
        [
          'Sei un assistente storico specializzato nel caso Moby Prince.',
          'Scrivi un profilo sintetico, preciso e prudente in italiano.',
          'Massimo 3 frasi. Nessuna invenzione. Se i dati sono limitati, resta sobrio.',
          `Entità: ${entity.canonicalName} (${entity.entityType})`,
          entity.role ? `Ruolo noto: ${entity.role}` : '',
          entity.description ? `Descrizione nota: ${entity.description}` : '',
          claims.length > 0
            ? `Claim rilevanti:\n${claims.slice(0, 5).map((claim, index) => `${index + 1}. ${claim.text}`).join('\n')}`
            : 'Claim rilevanti: nessuno disponibile.',
          events.length > 0
            ? `Eventi collegati:\n${events.slice(0, 4).map((event, index) => `${index + 1}. ${event.title}`).join('\n')}`
            : 'Eventi collegati: nessuno disponibile.',
          'Rispondi SOLO in JSON con {"summary":"..."}',
        ].filter(Boolean).join('\n\n'),
        512,
      );
      summary = typeof summaryResult?.summary === 'string' ? summaryResult.summary.trim() : null;
    } catch {
      summary = null;
    }

    if (!summary) {
      const rolePart = entity.role ? ` svolge il ruolo di ${entity.role}` : '';
      const aliasPart = entity.aliases?.length ? ` È citata anche come ${entity.aliases.slice(0, 3).join(', ')}.` : '';
      summary = `${entity.canonicalName}${rolePart} nel corpus Moby Prince.${aliasPart}`.trim();
    }

    res.json({
      entity,
      summary,
      claims,
      events,
      documents,
      totals: {
        claims: claims.length,
        events: events.length,
        documents: documents.length,
      },
    });
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
