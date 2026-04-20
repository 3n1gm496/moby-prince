'use strict';

/**
 * Analysis API — structured views over the document corpus.
 *
 * Routes:
 *   GET /api/analysis/dossier?pageSize=24&pageToken=<cursor>
 *     Returns a paginated, normalized list of documents from the datastore.
 *
 *     Mode selection (transparent to the client):
 *       - DATA_STORE_ID configured → listDocuments (exhaustive, reliable)
 *       - DATA_STORE_ID absent     → search fallback (partial, top-N only)
 *
 *     Response:
 *       {
 *         documents: NormalizedDocument[],
 *         pagination: { nextPageToken, hasMore, total },
 *         mode: 'listDocuments' | 'searchFallback',
 *         warning?: string   // present only in searchFallback mode
 *       }
 *
 * Note: unlike /api/answer this route does NOT invoke an LLM.
 * All data is read directly from the Discovery Engine document store.
 */

const { Router } = require('express');
const de                 = require('../services/discoveryEngine');
const { normalizeDossier } = require('../transformers/dossier');
const config             = require('../config');
const { clamp }          = require('../lib/utils');

const router = Router();

// GET /api/analysis/dossier ─────────────────────────────────────────────────

router.get('/dossier', async (req, res, next) => {
  const pageToken = typeof req.query.pageToken === 'string' && req.query.pageToken.trim()
    ? req.query.pageToken.trim()
    : null;
  const pageSize = clamp(req.query.pageSize, 1, 100, 24);

  try {
    let raw, mode;

    if (config.dataStoreBase) {
      // Full enumeration — uses the DE listDocuments REST endpoint.
      // Returns all documents in insertion order with cursor-based pagination.
      raw  = await de.listDocuments(pageToken, pageSize);
      mode = 'listDocuments';
    } else {
      // Partial fallback — DATA_STORE_ID not configured.
      // We use a broad search query instead; results are relevance-ranked,
      // NOT exhaustive.  Pagination beyond the first page is not supported.
      if (pageToken) {
        return res.json({
          documents:  [],
          pagination: { nextPageToken: null, hasMore: false, total: null },
          mode:       'searchFallback',
          warning:    'DATA_STORE_ID non configurato — la paginazione non è disponibile in modalità fallback.',
        });
      }
      raw  = await de.search('Moby Prince inchiesta', {
        maxResults: 20,
        searchMode: 'DOCUMENTS',
      });
      mode = 'searchFallback';
    }

    const normalized = normalizeDossier(raw, mode);

    if (mode === 'searchFallback') {
      normalized.warning =
        'DATA_STORE_ID non configurato: i risultati sono parziali (top-20 per rilevanza). ' +
        'Configura DATA_STORE_ID nel backend per ottenere la lista completa dei documenti.';
    }

    res.json(normalized);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
