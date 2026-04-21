'use strict';

/**
 * Sessions API — investigation sessions persisted in Firestore.
 *
 * POST   /api/sessions              — create a new session
 * GET    /api/sessions              — list sessions (most recent first)
 * GET    /api/sessions/:id          — get session detail (messages included)
 * PATCH  /api/sessions/:id          — update session (append messages, set title, etc.)
 * DELETE /api/sessions/:id          — delete session
 * GET    /api/sessions/:id/export   — download session as JSON attachment
 *
 * A session document in Firestore (`sessions/{id}`) has shape:
 *   { id, title, deSessionId?, messages: [...], createdAt, updatedAt }
 *
 * Messages: [{ role: 'user'|'assistant', text, citations?: [...], ts }]
 */

const { Router } = require('express');
const fs   = require('../services/firestore');
const { createLogger } = require('../logger');

const router = Router();
const log    = createLogger('sessions-route');

const COLLECTION = 'sessions';

// Fallback uuid when crypto.randomUUID is not available (Node < 14.17)
function _newId() {
  try {
    return require('crypto').randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function _now() {
  return new Date().toISOString();
}

// Strip messages from list view to keep payloads small
function _summarize(session) {
  const { messages, ...rest } = session;
  return { ...rest, messageCount: Array.isArray(messages) ? messages.length : 0 };
}

// ── POST /api/sessions ────────────────────────────────────────────────────────

router.post('/', async (req, res, next) => {
  const { title = 'Nuova indagine', deSessionId = null, messages = [] } = req.body || {};

  const id   = _newId();
  const now  = _now();
  const data = {
    title,
    deSessionId,
    messages,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const doc = await fs.createDocument(COLLECTION, id, data);
    res.status(201).json(doc || { id, ...data });
  } catch (err) {
    log.error({ error: err.message }, 'Failed to create session');
    next(err);
  }
});

// ── GET /api/sessions ─────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  const pageSize  = Math.min(parseInt(req.query.pageSize, 10) || 20, 100);
  const pageToken = typeof req.query.pageToken === 'string' ? req.query.pageToken : null;

  try {
    const { documents, nextPageToken } = await fs.listDocuments(COLLECTION, pageSize, pageToken);
    const sessions = documents
      .map(_summarize)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    res.json({ sessions, nextPageToken: nextPageToken || null });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/sessions/:id ─────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const session = await fs.getDocument(COLLECTION, req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    res.json(session);
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/sessions/:id ───────────────────────────────────────────────────
// Supported delta keys: title, deSessionId, messages (full replacement)
// To append messages the client must send the full updated messages array.

router.patch('/:id', async (req, res, next) => {
  const { title, deSessionId, messages } = req.body || {};

  const delta = { updatedAt: _now() };
  if (title       !== undefined) delta.title       = title;
  if (deSessionId !== undefined) delta.deSessionId = deSessionId;
  if (messages    !== undefined) delta.messages    = messages;

  try {
    const session = await fs.patchDocument(COLLECTION, req.params.id, delta);
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    res.json(session);
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/sessions/:id ──────────────────────────────────────────────────

router.delete('/:id', async (req, res, next) => {
  try {
    await fs.deleteDocument(COLLECTION, req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/sessions/:id/export ──────────────────────────────────────────────

router.get('/:id/export', async (req, res, next) => {
  try {
    const session = await fs.getDocument(COLLECTION, req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found.' });

    const filename = `sessione-${req.params.id}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(session, null, 2));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
