'use strict';

const config = require('../config');
const { createLogger } = require('../logger');

const log = createLogger('auth');

/**
 * Optional API key authentication.
 *
 * When API_KEY is set, every protected request must include the key via:
 *   Header:  X-API-Key: <key>
 *
 * Query-string auth is intentionally NOT supported — it exposes the key in
 * server logs, browser history, and Referer headers sent to third parties.
 *
 * When API_KEY is not configured the middleware is a no-op so local
 * development works without extra setup.
 *
 * Register BEFORE route handlers on all endpoints that should be protected
 * (typically /api/answer, /api/search, /api/evidence — not /api/health).
 */
function requireApiKey(req, res, next) {
  if (!config.apiKey) return next();

  const provided = req.headers['x-api-key'];
  if (!provided || provided !== config.apiKey) {
    log.warn({ ip: req.ip, path: req.path, hasKey: !!provided }, 'Invalid or missing API key');
    return res.status(401).json({ error: 'Chiave API non valida o mancante.' });
  }
  next();
}

module.exports = { requireApiKey };
