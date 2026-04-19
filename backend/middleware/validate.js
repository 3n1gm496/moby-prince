'use strict';

/**
 * Lightweight request validators — no external validation library needed.
 * Each exported function is an Express middleware that either calls next()
 * or short-circuits with a 400 JSON response.
 */

function validateQuery(req, res, next) {
  const { query } = req.body;

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'Il campo "query" è obbligatorio.' });
  }
  if (query.trim().length > 2000) {
    return res.status(400).json({ error: 'La query supera il limite massimo di 2000 caratteri.' });
  }

  // Normalise in place so downstream handlers use the trimmed value
  req.body.query = query.trim();
  next();
}

function validateSessionId(req, res, next) {
  const { sessionId } = req.body;
  if (sessionId === undefined || sessionId === null) {
    return next(); // optional field — absence is fine
  }
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    return res.status(400).json({ error: 'Il campo "sessionId" non è valido.' });
  }
  req.body.sessionId = sessionId.trim();
  next();
}

function validateDocumentId(req, res, next) {
  const { id } = req.params;
  if (!id || typeof id !== 'string' || !id.trim()) {
    return res.status(400).json({ error: 'ID documento non valido.' });
  }
  next();
}

module.exports = { validateQuery, validateSessionId, validateDocumentId };
