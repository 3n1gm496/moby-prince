'use strict';

/**
 * GET /api/media/:id            — media document metadata (structData)
 * GET /api/media/:id/transcript — full transcript JSON with word timestamps
 * GET /api/media/:id/shots      — shot list with start/end timestamps
 * GET /api/media/:id/labels     — label array
 *
 * All endpoints require DATA_STORE_ID to be configured.
 * Transcript and shots are fetched from GCS using the URIs stored in structData.
 */

const { Router } = require('express');
const de  = require('../services/discoveryEngine');
const gcs = require('../services/gcs');

const router = Router();

// ── helpers ───────────────────────────────────────────────────────────────────

function _gcsPathFromUri(gsUri) {
  if (!gsUri || !gsUri.startsWith('gs://')) return null;
  const withoutScheme = gsUri.slice(5);
  const slash = withoutScheme.indexOf('/');
  return slash < 0 ? null : withoutScheme.slice(slash + 1);
}

async function _fetchGcsJson(gsUri) {
  const name = _gcsPathFromUri(gsUri);
  if (!name) throw new Error(`Invalid GCS URI: ${gsUri}`);
  const res  = await gcs.getObject(name);
  const text = await res.text();
  return JSON.parse(text);
}

function _structData(doc) {
  return doc.structData || doc.jsonData || {};
}

// ── GET /api/media/:id ────────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const doc  = await de.getDocument(req.params.id);
    const data = _structData(doc);
    res.json({
      documentId:              req.params.id,
      mediaType:               data.media_type               || null,
      durationSeconds:         data.duration_seconds         || null,
      languageDetected:        data.language_detected        || null,
      containsSpeech:          data.contains_speech          ?? null,
      transcriptionConfidence: data.transcription_confidence ?? null,
      labels:                  data.labels                   || '',
      locationsDetected:       data.locations_detected       || '',
      shotTimestamps:          data.shot_timestamps          || '',
      originalUri:             data.original_uri             || null,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/media/:id/transcript ─────────────────────────────────────────────

router.get('/:id/transcript', async (req, res, next) => {
  try {
    const doc  = await de.getDocument(req.params.id);
    const data = _structData(doc);

    if (!data.transcript_uri) {
      return res.status(404).json({ error: 'Trascrizione non disponibile per questo documento.' });
    }

    const transcript = await _fetchGcsJson(data.transcript_uri).catch(async () => {
      // Fallback: return the transcript as plain text if JSON fetch fails
      const name   = _gcsPathFromUri(data.transcript_uri);
      const rawRes = await gcs.getObject(name);
      const text   = await rawRes.text();
      return { fullText: text, words: [] };
    });

    res.json({ documentId: req.params.id, ...transcript });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/media/:id/shots ──────────────────────────────────────────────────

router.get('/:id/shots', async (req, res, next) => {
  try {
    const doc  = await de.getDocument(req.params.id);
    const data = _structData(doc);

    // Shots can come from a dedicated JSON file or from the comma-separated timestamps in structData
    let shots = [];
    if (data.meta_uri) {
      try {
        const meta = await _fetchGcsJson(data.meta_uri);
        if (Array.isArray(meta.shot_timestamps)) {
          shots = meta.shot_timestamps.map((t, i) => ({ index: i, startTime: t }));
        }
      } catch {}
    }

    if (shots.length === 0 && data.shot_timestamps) {
      shots = data.shot_timestamps.split(',')
        .map(t => t.trim())
        .filter(Boolean)
        .map((t, i) => ({ index: i, startTime: t }));
    }

    res.json({ documentId: req.params.id, shots });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/media/:id/labels ─────────────────────────────────────────────────

router.get('/:id/labels', async (req, res, next) => {
  try {
    const doc    = await de.getDocument(req.params.id);
    const data   = _structData(doc);
    const labels = data.labels
      ? data.labels.split(',').map(l => l.trim()).filter(Boolean)
      : [];
    res.json({ documentId: req.params.id, labels });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
