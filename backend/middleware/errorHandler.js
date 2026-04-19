'use strict';

const { DiscoveryEngineError } = require('../services/discoveryEngine');

/**
 * Central Express error handler.
 * Must be registered LAST (after all routes) via app.use(errorHandler).
 *
 * Translates internal errors into consistent JSON responses with
 * appropriate HTTP status codes and Italian user-facing messages.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return; // can't do anything useful

  const ts     = new Date().toISOString();
  const method = req.method;
  const path   = req.path;

  if (err instanceof DiscoveryEngineError) {
    console.error(`[${ts}] DiscoveryEngineError on ${method} ${path}: ${err.message}`);

    if (err.isTimeout) {
      return res.status(504).json({
        error: 'Il servizio di ricerca non ha risposto in tempo. Riprova tra qualche secondo.',
      });
    }
    if (err.statusCode === 501) {
      return res.status(501).json({ error: err.message });
    }
    if (err.statusCode === 400) {
      return res.status(400).json({ error: 'Parametri di ricerca non validi.' });
    }
    if (err.statusCode === 403) {
      return res.status(502).json({ error: 'Autorizzazione al servizio di ricerca negata.' });
    }
    if (err.statusCode >= 400 && err.statusCode < 500) {
      return res.status(err.statusCode).json({ error: 'Errore nella richiesta al servizio di ricerca.' });
    }
    return res.status(502).json({ error: 'Il servizio di ricerca ha restituito un errore.' });
  }

  // Generic fallback
  console.error(`[${ts}] Unhandled error on ${method} ${path}:`, err);
  res.status(500).json({ error: 'Errore interno del server.' });
}

module.exports = errorHandler;
