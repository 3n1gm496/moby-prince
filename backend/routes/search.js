'use strict';

/**
 * POST /api/search
 *
 * Pure document/chunk retrieval — no LLM answer generation.
 * Use this when you want evidence fast, without paying for answer synthesis.
 *
 * Request body:
 *   query       string             required  max 2000 chars
 *   maxResults  number             optional  1–20, default 10
 *   filter      string             optional  Discovery Engine filter expression
 *   searchMode  'CHUNKS'|'DOCUMENTS'  optional  default 'CHUNKS'
 *
 * Response: see transformers/search.js for shape
 */

const { Router } = require('express');
const de          = require('../services/discoveryEngine');
const { normalizeSearch } = require('../transformers/search');
const { validateQuery } = require('../middleware/validate');

const router = Router();

router.post('/', validateQuery, async (req, res, next) => {
  const { query, maxResults, filter, searchMode } = req.body;

  const mode = searchMode === 'DOCUMENTS' ? 'DOCUMENTS' : 'CHUNKS';

  try {
    const raw = await de.search(query, {
      maxResults: _clamp(maxResults, 1, 20, 10),
      filter:     filter || null,
      searchMode: mode,
    });

    res.json(normalizeSearch(raw, query));
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
