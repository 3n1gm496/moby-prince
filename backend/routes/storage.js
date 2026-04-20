'use strict';

/**
 * Storage API — Google Cloud Storage browser and upload proxy.
 *
 * Routes:
 *   GET  /api/storage/browse?prefix=&pageToken=
 *     List folders and files at a given GCS prefix (virtual folder).
 *     Returns { prefix, folders, files, nextPageToken, hasMore }.
 *
 *   GET  /api/storage/file?name=
 *     Proxy-stream a GCS object to the client (for inline viewing / download).
 *
 *   POST /api/storage/upload
 *     Upload a file to GCS.  multipart/form-data with fields:
 *       file   — the file binary (required)
 *       prefix — destination folder path, e.g. "Commissione/Atti/" (optional)
 *
 * All routes require GCS_BUCKET to be configured; return 501 if absent.
 */

const { Router } = require('express');
const multer      = require('multer');
const gcs         = require('../services/gcs');

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

// ── GET /api/storage/browse ───────────────────────────────────────────────────

router.get('/browse', async (req, res, next) => {
  const prefix    = typeof req.query.prefix    === 'string' ? req.query.prefix    : '';
  const pageToken = typeof req.query.pageToken === 'string' ? req.query.pageToken : null;
  const pageSize  = Math.min(parseInt(req.query.pageSize, 10) || 200, 1000);

  try {
    const raw = await gcs.listObjects(prefix, pageToken, pageSize);

    const folders = (raw.prefixes || []).map((p) => ({
      type:   'folder',
      name:   p.slice(prefix.length).replace(/\/$/, ''), // relative name
      prefix: p,                                          // full prefix for navigation
    })).filter(f => f.name);  // guard against empty-name artefacts

    const files = (raw.items || [])
      .filter((item) => item.name !== prefix)  // skip the "directory marker" object if present
      .map((item) => ({
        type:        'file',
        name:        item.name.split('/').pop() || item.name,
        fullPath:    item.name,
        size:        item.size ? Number(item.size) : 0,
        contentType: item.contentType || null,
        updated:     item.updated     || null,
        timeCreated: item.timeCreated || null,
      }));

    res.json({
      prefix,
      folders,
      files,
      nextPageToken: raw.nextPageToken || null,
      hasMore:       !!raw.nextPageToken,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/storage/file ─────────────────────────────────────────────────────

router.get('/file', async (req, res, next) => {
  const name = typeof req.query.name === 'string' ? req.query.name.trim() : null;
  if (!name) return res.status(400).json({ error: 'Query parameter "name" is required.' });

  try {
    const gcsRes = await gcs.getObject(name);

    const contentType = gcsRes.headers.get('content-type') || 'application/octet-stream';
    const contentLen  = gcsRes.headers.get('content-length');
    const filename    = name.split('/').pop() || 'document';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    if (contentLen) res.setHeader('Content-Length', contentLen);

    // Buffer into memory and send (files are typically <50 MB for this archive)
    const buf = Buffer.from(await gcsRes.arrayBuffer());
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/storage/upload ──────────────────────────────────────────────────

router.post('/upload', upload.single('file'), async (req, res, next) => {
  const file   = req.file;
  const prefix = typeof req.body?.prefix === 'string' ? req.body.prefix : '';

  if (!file) {
    return res.status(400).json({ error: 'Nessun file ricevuto (campo "file" mancante).' });
  }

  // Sanitise filename: strip path traversal, normalise spaces
  const safeName    = file.originalname.replace(/[/\\]/g, '_').trim();
  const destination = prefix + safeName;

  try {
    const result = await gcs.uploadObject(destination, file.mimetype, file.buffer);
    res.json({
      success:     true,
      name:        result.name,
      size:        result.size    ? Number(result.size) : file.size,
      contentType: result.contentType || file.mimetype,
      updated:     result.updated || new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/storage/file ──────────────────────────────────────────────────

router.delete('/file', async (req, res, next) => {
  const name = typeof req.query.name === 'string' ? req.query.name.trim() : null;
  if (!name) return res.status(400).json({ error: 'Query parameter "name" is required.' });

  try {
    await gcs.deleteObject(name);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/storage/move ────────────────────────────────────────────────────
// Body: { source: "path/to/file.pdf", destination: "other/path/to/file.pdf" }
// GCS move = copy to destination + delete source.

router.post('/move', async (req, res, next) => {
  const { source, destination } = req.body || {};
  if (!source || !destination) {
    return res.status(400).json({ error: '"source" and "destination" are required.' });
  }
  if (source === destination) {
    return res.status(400).json({ error: 'source and destination are the same.' });
  }

  try {
    await gcs.copyObject(source, destination);
    await gcs.deleteObject(source);
    res.json({ success: true, destination });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
