'use strict';

const { DiscoveryEngineError } = require('../services/discoveryEngine');
const { createLogger }         = require('../logger');

const log = createLogger('error-handler');

/**
 * Central Express error handler.
 * Must be registered LAST (after all routes) via app.use(errorHandler).
 *
 * Translates internal errors into consistent JSON responses with
 * appropriate HTTP status codes and Italian user-facing messages.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return;

  const requestId = req.requestId;
  const traceId   = req.traceId;
  const method    = req.method;
  const path      = req.path;

  // body-parser errors (PayloadTooLargeError, SyntaxError from malformed JSON)
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({ error: 'Richiesta troppo grande.' });
  }
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400)) {
    return res.status(400).json({ error: 'JSON non valido.' });
  }

  if (err instanceof DiscoveryEngineError) {
    log.warn({ requestId, traceId, method, path, statusCode: err.statusCode, msg: err.message },
      'DiscoveryEngineError');

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

  log.error({ requestId, traceId, method, path, err: err.message, stack: err.stack },
    'Unhandled error');
  res.status(500).json({ error: 'Errore interno del server.' });
}

module.exports = errorHandler;
