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

    // Bug fix #2: use RFC 5987 encoding to prevent header injection via filenames
    // with double-quotes or other special characters.
    const safeAscii   = filename.replace(/[^\x20-\x7e]|["\\]/g, '_');
    const encoded     = encodeURIComponent(filename);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${safeAscii}"; filename*=UTF-8''${encoded}`);
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

// ── GET /api/storage/metadata ─────────────────────────────────────────────────

router.get('/metadata', async (req, res, next) => {
  const name = typeof req.query.name === 'string' ? req.query.name.trim() : null;
  if (!name) return res.status(400).json({ error: '"name" query param required.' });
  try {
    const obj = await gcs.getObjectMetadata(name);
    res.json({
      name:        obj.name,
      size:        obj.size ? Number(obj.size) : 0,
      contentType: obj.contentType || null,
      updated:     obj.updated     || null,
      timeCreated: obj.timeCreated || null,
      md5Hash:     obj.md5Hash     || null,
      crc32c:      obj.crc32c      || null,
      generation:  obj.generation  || null,
      metadata:    obj.metadata    || {},
    });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/storage/metadata ───────────────────────────────────────────────

router.patch('/metadata', async (req, res, next) => {
  const { name, metadata } = req.body || {};
  if (!name || typeof metadata !== 'object' || metadata === null) {
    return res.status(400).json({ error: '"name" and "metadata" (object) required.' });
  }
  try {
    const obj = await gcs.updateObjectMetadata(name, metadata);
    res.json({ success: true, metadata: obj.metadata || {} });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/storage/rename ──────────────────────────────────────────────────

router.post('/rename', async (req, res, next) => {
  const { source, newName } = req.body || {};
  if (!source || !newName) return res.status(400).json({ error: '"source" and "newName" required.' });

  // Bug fix #1: sanitise newName to prevent path traversal in the bucket.
  const safeName = String(newName).replace(/[/\\]/g, '_').trim();
  if (!safeName) return res.status(400).json({ error: 'Invalid file name.' });

  const slash       = source.lastIndexOf('/');
  const dirPrefix   = slash >= 0 ? source.slice(0, slash + 1) : '';
  const destination = dirPrefix + safeName;

  if (source === destination) return res.status(400).json({ error: 'New name is the same.' });

  try {
    await gcs.copyObject(source, destination);
    await gcs.deleteObject(source);
    res.json({ success: true, destination });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/storage/copy ────────────────────────────────────────────────────

router.post('/copy', async (req, res, next) => {
  const { source } = req.body || {};
  if (!source) return res.status(400).json({ error: '"source" required.' });

  const slash     = source.lastIndexOf('/');
  const dirPrefix = slash >= 0 ? source.slice(0, slash + 1) : '';
  const filename  = slash >= 0 ? source.slice(slash + 1) : source;
  const dotIdx    = filename.lastIndexOf('.');
  const base      = dotIdx >= 0 ? filename.slice(0, dotIdx) : filename;
  const ext       = dotIdx >= 0 ? filename.slice(dotIdx)    : '';

  // Bug fix #7: find a non-colliding destination name before copying.
  let destination = `${dirPrefix}${base} (copia)${ext}`;
  let counter = 2;
  while (true) {
    try {
      await gcs.getObjectMetadata(destination);
      // Object exists — try next suffix
      destination = `${dirPrefix}${base} (copia ${counter++})${ext}`;
    } catch (e) {
      if (e.statusCode === 404) break; // free name found
      throw e;
    }
  }

  try {
    await gcs.copyObject(source, destination);
    res.json({ success: true, destination });
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

// ── DELETE /api/storage/folder?prefix= ───────────────────────────────────────
// Deletes all objects under a given prefix (folder). Prefix must end with '/'.

router.delete('/folder', async (req, res, next) => {
  const prefix = typeof req.query.prefix === 'string' ? req.query.prefix : null;
  if (!prefix) return res.status(400).json({ error: '"prefix" query param required.' });
  if (!prefix.endsWith('/')) return res.status(400).json({ error: 'prefix must end with "/".' });

  try {
    const names = await gcs.listAllObjects(prefix);
    await Promise.all(names.map(n => gcs.deleteObject(n)));
    res.json({ success: true, deleted: names.length });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/storage/rename-folder ──────────────────────────────────────────
// Body: { prefix: "old/path/", newName: "newFolderName" }

router.post('/rename-folder', async (req, res, next) => {
  const { prefix, newName } = req.body || {};
  if (!prefix || !newName) return res.status(400).json({ error: '"prefix" and "newName" required.' });
  if (!prefix.endsWith('/')) return res.status(400).json({ error: 'prefix must end with "/".' });

  const safeName = String(newName).replace(/[/\\]/g, '_').trim();
  if (!safeName) return res.status(400).json({ error: 'Invalid folder name.' });

  const parts    = prefix.replace(/\/$/, '').split('/');
  parts[parts.length - 1] = safeName;
  const newPrefix = parts.join('/') + '/';

  if (prefix === newPrefix) return res.status(400).json({ error: 'New name is the same.' });

  try {
    const names = await gcs.listAllObjects(prefix);
    if (names.length === 0) {
      await gcs.uploadObject(newPrefix + '.keep', 'application/x-directory', Buffer.alloc(0));
    } else {
      await Promise.all(names.map(n => gcs.copyObject(n, newPrefix + n.slice(prefix.length))));
      await Promise.all(names.map(n => gcs.deleteObject(n)));
    }
    res.json({ success: true, newPrefix, count: names.length });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/storage/copy-folder ─────────────────────────────────────────────
// Body: { prefix: "path/to/folder/" }

router.post('/copy-folder', async (req, res, next) => {
  const { prefix } = req.body || {};
  if (!prefix) return res.status(400).json({ error: '"prefix" required.' });
  if (!prefix.endsWith('/')) return res.status(400).json({ error: 'prefix must end with "/".' });

  const base = prefix.replace(/\/$/, '');

  // Bug fix #7 (folder): find a non-colliding destination prefix.
  let newPrefix = `${base} (copia)/`;
  let counter   = 2;
  while ((await gcs.listAllObjects(newPrefix)).length > 0) {
    newPrefix = `${base} (copia ${counter++})/`;
  }

  try {
    const names = await gcs.listAllObjects(prefix);
    if (names.length === 0) {
      await gcs.uploadObject(newPrefix + '.keep', 'application/x-directory', Buffer.alloc(0));
    } else {
      await Promise.all(names.map(n => gcs.copyObject(n, newPrefix + n.slice(prefix.length))));
    }
    res.json({ success: true, newPrefix, count: names.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
