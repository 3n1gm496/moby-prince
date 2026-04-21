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
const fs             = require('../services/firestore');
const { newId }      = require('../lib/utils');
const { createLogger } = require('../logger');

const router = Router();
const log    = createLogger('sessions-route');

const COLLECTION = 'sessions';

const _newId = newId;

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
    // Log message wipe (messages:[] is destructive)
    if (Array.isArray(messages) && messages.length === 0) {
      log.warn({ sessionId: req.params.id, ip: req.ip }, 'Session messages wiped via PATCH');
    }
    res.json(session);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/sessions/:id/messages ──────────────────────────────────────────
// Atomically appends a single message using Firestore FieldTransform so
// concurrent calls from different browser tabs cannot overwrite each other.

router.post('/:id/messages', async (req, res, next) => {
  const { role, text, citations, steps } = req.body || {};

  const VALID_ROLES = new Set(['user', 'assistant', 'error']);
  if (!role || !VALID_ROLES.has(role)) {
    return res.status(400).json({ error: '"role" must be user, assistant, or error.' });
  }
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: '"text" is required.' });
  }

  // Each message gets a unique _mid so appendMissingElements never deduplicates
  // two structurally similar messages sent within the same millisecond.
  const message = {
    _mid: require('crypto').randomUUID(),
    role,
    text: text.trim(),
    ts:   _now(),
  };
  if (citations !== undefined) message.citations = citations;
  if (steps     !== undefined) message.steps     = steps;

  try {
    const session = await fs.appendToArray(COLLECTION, req.params.id, 'messages', [message]);
    if (!session) return res.status(404).json({ error: 'Session not found.' });
    res.status(201).json({ message, session });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/sessions/:id ──────────────────────────────────────────────────

router.delete('/:id', async (req, res, next) => {
  try {
    await fs.deleteDocument(COLLECTION, req.params.id);
    log.info({ sessionId: req.params.id, ip: req.ip, ua: req.get('user-agent') }, 'Session deleted');
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

    // Strip non-ASCII and header-unsafe chars before embedding in Content-Disposition
    const safeId   = String(req.params.id).replace(/[^\w-]/g, '_');
    const filename = `sessione-${safeId}.json`;
    const encoded  = encodeURIComponent(filename);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`);
    res.send(JSON.stringify(session, null, 2));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
