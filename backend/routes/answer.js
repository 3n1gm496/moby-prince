'use strict';

/**
 * POST /api/answer
 *
 * Grounded answer generation via Discovery Engine :answer API.
 *
 * Request body:
 *   query       string   required  max 2000 chars
 *   sessionId   string   optional  short session ID for multi-turn continuity
 *   maxResults  number   optional  1–20, default 10
 *   filters     object   optional  structured metadata filters (see filters/schema.js)
 *
 * Response: see transformers/answer.js for shape
 */

const { Router } = require('express');
const de          = require('../services/discoveryEngine');
const { normalizeAnswer } = require('../transformers/answer');
const { validateQuery, validateSessionId } = require('../middleware/validate');
const { validateFilters }       = require('../middleware/validateFilters');
const { buildFilterExpression } = require('../filters/schema');

const router = Router();

router.post('/', [validateQuery, validateSessionId, validateFilters], async (req, res, next) => {
  const { query, sessionId, maxResults, filters } = req.body;

  try {
    const raw = await de.answer(query, sessionId || null, {
      maxResults: _clamp(maxResults, 1, 20, 10),
      filter:     buildFilterExpression(filters),
    });

    res.json(normalizeAnswer(raw, filters || null));
  } catch (err) {
    next(err);
  }
});

function _clamp(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

module.exports = router;
