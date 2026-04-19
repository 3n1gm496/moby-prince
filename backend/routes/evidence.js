'use strict';

/**
 * Evidence API — raw chunk/document retrieval for the investigative workbench.
 *
 * Routes:
 *   POST /api/evidence/search
 *     Search for raw evidence chunks without generating an answer.
 *     Same as /api/search?searchMode=CHUNKS but returns a flat evidence list
 *     optimised for the evidence panel UI.
 *
 *   GET /api/evidence/documents/:id/chunks
 *     Retrieve all stored chunks for a specific document.
 *     Requires DATA_STORE_ID to be configured.
 *     Returns 501 if DATA_STORE_ID is absent.
 *
 * These endpoints form the backbone of the evidence workbench:
 * the frontend can call /api/evidence/search to surface supporting passages,
 * then drill into any document via /api/evidence/documents/:id/chunks.
 */

const { Router } = require('express');
const de          = require('../services/discoveryEngine');
const { normalizeSearch } = require('../transformers/search');
const { validateQuery, validateDocumentId } = require('../middleware/validate');

const router = Router();

// POST /api/evidence/search ─────────────────────────────────────────────────

router.post('/search', validateQuery, async (req, res, next) => {
  const { query, maxResults, filter } = req.body;

  try {
    const raw        = await de.search(query, {
      maxResults: _clamp(maxResults, 1, 20, 10),
      filter:     filter || null,
      searchMode: 'CHUNKS',
    });
    const normalized = normalizeSearch(raw, query);

    // Flatten to a linear evidence list — simpler for the workbench panel
    const evidence = normalized.results.map(r => ({
      id:             r.id,
      rank:           r.rank,
      documentId:     r.document?.id   || null,
      title:          r.document?.title || null,
      uri:            r.document?.uri   || null,
      content:        r.chunk?.content  || r.snippet || '',
      pageIdentifier: r.chunk?.pageIdentifier || null,
      relevanceScore: r.chunk?.relevanceScore ?? null,
    }));

    res.json({
      evidence,
      meta: normalized.meta,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/evidence/documents/:id/chunks ────────────────────────────────────

router.get('/documents/:id/chunks', validateDocumentId, async (req, res, next) => {
  const { id } = req.params;

  try {
    const raw    = await de.getDocumentChunks(id);
    const chunks = (raw.chunks || []).map(chunk => ({
      id:             chunk.id || _extractId(chunk.name),
      content:        chunk.content || '',
      pageIdentifier: chunk.pageSpan?.pageStart?.toString() || null,
      // relevanceScore is not available for stored chunks (only for search results)
    }));

    res.json({
      documentId: id,
      chunks,
      meta: { total: chunks.length },
    });
  } catch (err) {
    next(err);
  }
});

// ── helpers ──────────────────────────────────────────────────────────────────

function _clamp(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function _extractId(resourceName) {
  if (!resourceName) return null;
  const parts = resourceName.split('/');
  return parts[parts.length - 1] || null;
}

module.exports = router;
