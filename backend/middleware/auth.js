'use strict';

const config = require('../config');

/**
 * Optional API key authentication.
 *
 * When API_KEY is set, every protected request must include the key via:
 *   Header:       X-API-Key: <key>
 *   Query param:  ?api_key=<key>
 *
 * When API_KEY is not configured the middleware is a no-op so local
 * development works without extra setup.
 *
 * Register BEFORE route handlers on all endpoints that should be protected
 * (typically /api/answer, /api/search, /api/evidence — not /api/health).
 */
function requireApiKey(req, res, next) {
  if (!config.apiKey) return next();

  const provided = req.headers['x-api-key'] || req.query.api_key;
  if (!provided || provided !== config.apiKey) {
    return res.status(401).json({ error: 'Chiave API non valida o mancante.' });
  }
  next();
}

module.exports = { requireApiKey };
