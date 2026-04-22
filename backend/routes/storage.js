'use strict';

/**
 * Storage API — Google Cloud Storage browser and upload proxy.
 *
 * Routes:
 *   GET  /api/storage/browse?prefix=&pageToken=
 *   GET  /api/storage/file?name=
 *   POST /api/storage/upload
 *   … (see inline docs)
 *
 * GCS→DE sync: rename, move and metadata-patch operations attempt to keep the
 * corresponding Discovery Engine document's structData in sync. Sync failures
 * are logged but do NOT fail the request — the GCS operation is authoritative.
 *
 * All routes require GCS_BUCKET to be configured; return 501 if absent.
 */

const { Router }   = require('express');
const multer       = require('multer');
const config       = require('../config');
const gcs          = require('../services/gcs');
const de           = require('../services/discoveryEngine');
const ingestSvc    = require('../services/ingest');
const { createLogger } = require('../logger');

const router = Router();
const log    = createLogger('storage-route');

// Allowed MIME types for uploads (magic-byte check not available without extra deps,
// so we validate the Content-Type declared by the client and rely on GCS MIME handling)
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/tiff', 'image/webp', 'image/gif', 'image/bmp',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/x-wav',
  'video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm', 'video/x-msvideo',
  'text/plain', 'text/html', 'text/csv', 'text/xml', 'application/xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword', 'application/vnd.ms-powerpoint', 'application/vnd.ms-excel',
  'application/zip', 'application/x-zip-compressed',
]);

/**
 * Validate a GCS object path/prefix supplied by the user.
 * Returns { value: string } on success or { error: string } on failure.
 *
 * Rejects:
 *   - empty / non-string values
 *   - paths that start with "/" (absolute)
 *   - paths that contain ".." as a segment (directory traversal)
 */
function _validateGcsPath(p, fieldName = 'name') {
  if (typeof p !== 'string' || !p.trim()) {
    return { error: `"${fieldName}" is required.` };
  }
  const s = p.trim();
  if (s.startsWith('/')) {
    return { error: `"${fieldName}" must not start with "/".` };
  }
  if (s.split('/').some(seg => seg === '..')) {
    return { error: `"${fieldName}" contains invalid path traversal.` };
  }
  return { value: s };
}

// Fields from GCS custom metadata that map 1:1 to DE structData keys
const SYNCABLE_META_KEYS = new Set([
  'persons_mentioned', 'organizations_mentioned', 'document_type',
  'institution', 'year', 'legislature', 'topic', 'ocr_quality',
]);

/**
 * Best-effort: update DE structData to match a GCS metadata delta.
 * Fires async; never throws to the caller.
 */
function _syncMetaToDE(gcsName, delta) {
  if (!config.gcsBucket || !config.dataStoreId) return;
  const gcsUri = `gs://${config.gcsBucket}/${gcsName}`;
  de.getDocumentIdByUri(gcsUri)
    .then(docId => {
      if (!docId) return;
      return de.updateStructData(docId, delta);
    })
    .catch(err => log.warn({ name: gcsName, error: err.message }, 'DE structData sync failed'));
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

// ── GET /api/storage/browse ───────────────────────────────────────────────────

router.get('/browse', async (req, res, next) => {
  const rawPrefix = typeof req.query.prefix === 'string' ? req.query.prefix : '';
  // Allow empty prefix (list root), but reject traversal in non-empty values
  if (rawPrefix) {
    const v = _validateGcsPath(rawPrefix, 'prefix');
    if (v.error) return res.status(400).json({ error: v.error });
  }
  const prefix    = rawPrefix;
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
  const raw = typeof req.query.name === 'string' ? req.query.name : '';
  const validated = _validateGcsPath(raw, 'name');
  if (validated.error) return res.status(400).json({ error: validated.error });
  const name = validated.value;

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
  const file      = req.file;
  const rawPrefix = typeof req.body?.prefix === 'string' ? req.body.prefix : '';

  if (!file) {
    return res.status(400).json({ error: 'Nessun file ricevuto (campo "file" mancante).' });
  }

  // Validate prefix if provided
  if (rawPrefix) {
    const v = _validateGcsPath(rawPrefix, 'prefix');
    if (v.error) return res.status(400).json({ error: v.error });
  }
  const prefix = rawPrefix;

  // Validate MIME type against server-side allowlist
  const normalizedMime = (file.mimetype || '').toLowerCase().split(';')[0].trim();
  if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
    return res.status(415).json({ error: `Tipo di file non supportato: "${normalizedMime}".` });
  }

  // Sanitise filename: strip path traversal, normalise spaces
  const safeName    = file.originalname.replace(/[/\\]/g, '_').trim();
  const destination = prefix + safeName;

  try {
    const result = await gcs.uploadObject(destination, file.mimetype, file.buffer);

    // Trigger ingestion pipeline for real documents when AUTO_INGEST=true.
    // Directory-marker objects (.keep files created by NewFolderButton) are excluded.
    let ingestJobId = null;
    if (config.autoIngest && config.gcsBucket && !safeName.endsWith('.keep')) {
      const gcsUri = `gs://${config.gcsBucket}/${destination}`;
      try {
        ingestJobId = ingestSvc.triggerIngest(gcsUri);
        log.info({ ingestJobId, gcsUri }, 'Auto-ingest triggered');
      } catch (err) {
        log.warn({ error: err.message }, 'Failed to trigger auto-ingest; upload still succeeded');
      }
    }

    res.json({
      success:      true,
      name:         result.name,
      size:         result.size    ? Number(result.size) : file.size,
      contentType:  result.contentType || file.mimetype,
      updated:      result.updated || new Date().toISOString(),
      ingestJobId,  // null when AUTO_INGEST is disabled
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/storage/ingest-status ───────────────────────────────────────────
// Poll ingestion job status by jobId (returned from POST /api/storage/upload).

router.get('/ingest-status', (req, res) => {
  const jobId = typeof req.query.jobId === 'string' ? req.query.jobId.trim() : null;
  if (!jobId) {
    return res.status(400).json({ error: '"jobId" query parameter is required.' });
  }
  const job = ingestSvc.getStatus(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found (server may have restarted).' });
  }
  res.json(job);
});

// ── GET /api/storage/metadata ─────────────────────────────────────────────────

router.get('/metadata', async (req, res, next) => {
  const raw = typeof req.query.name === 'string' ? req.query.name : '';
  const validated = _validateGcsPath(raw, 'name');
  if (validated.error) return res.status(400).json({ error: validated.error });
  const name = validated.value;
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
  const { name: rawName, metadata } = req.body || {};
  if (typeof metadata !== 'object' || metadata === null) {
    return res.status(400).json({ error: '"name" and "metadata" (object) required.' });
  }
  const validated = _validateGcsPath(rawName, 'name');
  if (validated.error) return res.status(400).json({ error: validated.error });
  const name = validated.value;
  try {
    const obj = await gcs.updateObjectMetadata(name, metadata);

    // Sync whitelisted keys to DE structData (best-effort, async)
    const syncable = Object.fromEntries(
      Object.entries(metadata).filter(([k]) => SYNCABLE_META_KEYS.has(k)),
    );
    if (Object.keys(syncable).length > 0) _syncMetaToDE(name, syncable);

    res.json({ success: true, metadata: obj.metadata || {} });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/storage/rename ──────────────────────────────────────────────────

router.post('/rename', async (req, res, next) => {
  const { source: rawSource, newName } = req.body || {};
  if (!rawSource || !newName) return res.status(400).json({ error: '"source" and "newName" required.' });

  const srcValidated = _validateGcsPath(rawSource, 'source');
  if (srcValidated.error) return res.status(400).json({ error: srcValidated.error });
  const source = srcValidated.value;

  // Sanitise newName: strip slashes to keep the rename within the same folder
  const safeName = String(newName).replace(/[/\\]/g, '_').trim();
  if (!safeName) return res.status(400).json({ error: 'Invalid file name.' });

  const slash       = source.lastIndexOf('/');
  const dirPrefix   = slash >= 0 ? source.slice(0, slash + 1) : '';
  const destination = dirPrefix + safeName;

  if (source === destination) return res.status(400).json({ error: 'New name is the same.' });

  try {
    await gcs.copyObject(source, destination);
    await gcs.deleteObject(source);

    // Sync new filename to DE structData so search results show the new name
    _syncMetaToDE(destination, { original_filename: safeName });

    res.json({ success: true, destination });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/storage/copy ────────────────────────────────────────────────────

router.post('/copy', async (req, res, next) => {
  const { source: rawSource } = req.body || {};
  const srcValidated = _validateGcsPath(rawSource, 'source');
  if (srcValidated.error) return res.status(400).json({ error: srcValidated.error });
  const source = srcValidated.value;

  const slash     = source.lastIndexOf('/');
  const dirPrefix = slash >= 0 ? source.slice(0, slash + 1) : '';
  const filename  = slash >= 0 ? source.slice(slash + 1) : source;
  const dotIdx    = filename.lastIndexOf('.');
  const base      = dotIdx >= 0 ? filename.slice(0, dotIdx) : filename;
  const ext       = dotIdx >= 0 ? filename.slice(dotIdx)    : '';

  // Find a non-colliding destination name (max 100 attempts to prevent runaway loop)
  let destination = `${dirPrefix}${base} (copia)${ext}`;
  let counter = 2;
  const MAX_COPY_SUFFIX = 100;
  while (true) {
    try {
      await gcs.getObjectMetadata(destination);
      if (counter > MAX_COPY_SUFFIX) {
        return res.status(409).json({ error: 'Impossibile trovare un nome libero per la copia.' });
      }
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
  const raw = typeof req.query.name === 'string' ? req.query.name : '';
  const validated = _validateGcsPath(raw, 'name');
  if (validated.error) return res.status(400).json({ error: validated.error });
  const name = validated.value;

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
  const { source: rawSource, destination: rawDest } = req.body || {};

  const srcV = _validateGcsPath(rawSource, 'source');
  if (srcV.error) return res.status(400).json({ error: srcV.error });
  const source = srcV.value;

  const dstV = _validateGcsPath(rawDest, 'destination');
  if (dstV.error) return res.status(400).json({ error: dstV.error });
  const destination = dstV.value;

  if (source === destination) {
    return res.status(400).json({ error: 'source and destination are the same.' });
  }

  try {
    await gcs.copyObject(source, destination);
    await gcs.deleteObject(source);

    // After move, original_uri in DE structData is stale — mark it so operators know
    _syncMetaToDE(destination, { original_uri: `gs://${config.gcsBucket}/${destination}` });

    res.json({ success: true, destination });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/storage/folder?prefix= ───────────────────────────────────────
// Deletes all objects under a given prefix (folder). Prefix must end with '/'.

router.delete('/folder', async (req, res, next) => {
  const raw = typeof req.query.prefix === 'string' ? req.query.prefix : '';
  const validated = _validateGcsPath(raw, 'prefix');
  if (validated.error) return res.status(400).json({ error: validated.error });
  const prefix = validated.value;
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
  const { prefix: rawPrefix, newName } = req.body || {};
  if (!rawPrefix || !newName) return res.status(400).json({ error: '"prefix" and "newName" required.' });

  const prefixV = _validateGcsPath(rawPrefix, 'prefix');
  if (prefixV.error) return res.status(400).json({ error: prefixV.error });
  const prefix = prefixV.value;
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
  const { prefix: rawPrefix } = req.body || {};
  const prefixV = _validateGcsPath(rawPrefix, 'prefix');
  if (prefixV.error) return res.status(400).json({ error: prefixV.error });
  const prefix = prefixV.value;
  if (!prefix.endsWith('/')) return res.status(400).json({ error: 'prefix must end with "/".' });

  const base = prefix.replace(/\/$/, '');

  // Find a non-colliding destination prefix (max 100 attempts)
  let newPrefix = `${base} (copia)/`;
  let counter   = 2;
  const MAX_COPY_SUFFIX = 100;
  while ((await gcs.listAllObjects(newPrefix)).length > 0) {
    if (counter > MAX_COPY_SUFFIX) {
      return res.status(409).json({ error: 'Impossibile trovare un nome libero per la copia.' });
    }
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
