'use strict';

/**
 * Timeline API
 *
 * GET  /api/timeline/documents   — all DE documents with year metadata
 * GET  /api/timeline/events      — curated events from GCS _timeline/events.json
 * PUT  /api/timeline/events      — save entire events array to GCS
 */

const { Router } = require('express');
const de     = require('../services/discoveryEngine');
const gcs    = require('../services/gcs');
const config = require('../config');

const router      = Router();
const EVENTS_PATH = '_timeline/events.json';

// Bug fix #3: simple in-process lock to prevent concurrent generate calls from
// racing (both missing cache, both calling DE, both overwriting GCS).
let _generating = false;

// ── GET /api/timeline/documents ───────────────────────────────────────────────

router.get('/documents', async (req, res, next) => {
  try {
    let allDocs   = [];
    let pageToken = null;
    let page      = 0;

    do {
      const data = await de.listDocuments(pageToken, 100);
      (data.documents || []).forEach(doc => {
        const sd = doc.structData || {};
        allDocs.push({
          id:           doc.name?.split('/').pop() || '',
          title:        sd.title        || doc.name?.split('/').pop() || '',
          year:         sd.year         ? Number(sd.year) : null,
          documentType: sd.documentType || null,
          institution:  sd.institution  || null,
          legislature:  sd.legislature  || null,
          uri:          doc.content?.uri || null,
        });
      });
      pageToken = data.nextPageToken || null;
      page++;
    } while (pageToken && page < 20);

    res.json({ documents: allDocs.filter(d => d.year), total: allDocs.length });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/timeline/events ──────────────────────────────────────────────────

router.get('/events', async (req, res, next) => {
  if (!config.gcsBucket) return res.json({ events: [] });
  try {
    const obj    = await gcs.getObject(EVENTS_PATH);
    const text   = await obj.text();
    const events = JSON.parse(text);
    res.json({ events: Array.isArray(events) ? events : [] });
  } catch (err) {
    if (err.statusCode === 404) return res.json({ events: [] });
    next(err);
  }
});

// ── PUT /api/timeline/events ──────────────────────────────────────────────────

router.put('/events', async (req, res, next) => {
  if (!config.gcsBucket) return res.status(501).json({ error: 'GCS_BUCKET not configured.' });
  const { events } = req.body || {};
  if (!Array.isArray(events)) return res.status(400).json({ error: '"events" array required.' });
  try {
    const buf = Buffer.from(JSON.stringify(events, null, 2), 'utf-8');
    await gcs.uploadObject(EVENTS_PATH, 'application/json', buf);
    res.json({ success: true, count: events.length });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/timeline/generate ───────────────────────────────────────────────

const VALID_TYPES = new Set(['evento', 'udienza', 'sentenza', 'relazione', 'commissione']);

function normaliseDate(raw) {
  const s = (raw || '').replace(/[^\d-]/g, '').trim();
  if (!s || !/^\d{4}/.test(s)) return null;
  if (/^\d{4}$/.test(s))       return `${s}-01-01`;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  return s;
}

function parseEvents(answerText) {
  const events  = [];
  let idx       = 0;
  let skipped   = 0;

  for (const line of answerText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split('|').map(p => p.trim());
    if (parts.length < 3) { skipped++; continue; }

    const [rawDate, rawType, rawTitle, ...descParts] = parts;
    const date  = normaliseDate(rawDate);
    // Bug fix #8: count and log skipped lines so callers can report them.
    if (!date) { skipped++; continue; }

    const title = rawTitle?.trim();
    if (!title) { skipped++; continue; }

    const type        = VALID_TYPES.has(rawType?.toLowerCase()) ? rawType.toLowerCase() : 'evento';
    const description = descParts.join('|').trim();

    events.push({
      id:           `ai-${Date.now()}-${idx++}`,
      date,
      type,
      title,
      description,
      importance:   1,
      linkedDocs:   [],
      _aiGenerated: true,
    });
  }
  return { events, skipped };
}

router.post('/generate', async (req, res, next) => {
  if (!config.gcsBucket) return res.status(501).json({ error: 'GCS_BUCKET not configured.' });

  // Bug fix #3: reject concurrent generate requests instead of racing.
  if (_generating) {
    return res.status(409).json({ error: 'Generazione già in corso. Riprova tra qualche secondo.' });
  }

  const force = req.body?.force === true;

  // Return GCS cache if not forced and cache has AI events
  if (!force) {
    try {
      const obj  = await gcs.getObject(EVENTS_PATH);
      const text = await obj.text();
      const evts = JSON.parse(text);
      if (Array.isArray(evts) && evts.some(e => e._aiGenerated)) {
        return res.json({ events: evts, cached: true, generated: 0 });
      }
    } catch (err) {
      if (err.statusCode !== 404) return next(err);
    }
  }

  _generating = true;

  const prompt = [
    'Basandoti esclusivamente sui documenti dell\'archivio del caso Moby Prince,',
    'elenca in ordine cronologico almeno 25 eventi storici, giudiziari e parlamentari.',
    'Per ogni evento usa ESATTAMENTE questo formato su una riga separata (senza numerazione):',
    'DATA | TIPO | TITOLO | DESCRIZIONE',
    'DATA = YYYY-MM-DD (YYYY-01-01 se ignoti mese/giorno, YYYY-MM-01 se ignoto solo il giorno)',
    'TIPO = uno tra: evento, udienza, sentenza, relazione, commissione',
    'TITOLO = massimo 10 parole',
    'DESCRIZIONE = 1-2 frasi.',
  ].join(' ');

  try {
    const raw        = await de.answer(prompt, null, { maxResults: 20, modelVersion: 'stable' });
    const answerText = (raw.answer ?? raw)?.answerText ?? '';
    const { events: aiEvents, skipped } = parseEvents(answerText);

    if (aiEvents.length === 0) {
      return res.status(422).json({
        error: `AI non ha restituito eventi validi (${skipped} righe scartate). Riprova.`,
      });
    }

    // Load existing manually-curated events (preserve non-AI ones)
    let manual = [];
    try {
      const obj  = await gcs.getObject(EVENTS_PATH);
      const text = await obj.text();
      const arr  = JSON.parse(text);
      if (Array.isArray(arr)) manual = arr.filter(e => !e._aiGenerated);
    } catch {}

    const merged = [...manual, ...aiEvents];
    try {
      const buf = Buffer.from(JSON.stringify(merged, null, 2), 'utf-8');
      await gcs.uploadObject(EVENTS_PATH, 'application/json', buf);
    } catch (saveErr) {
      return res.json({ events: merged, generated: aiEvents.length, skipped, cached: false, saveError: saveErr.message });
    }

    res.json({ events: merged, generated: aiEvents.length, skipped, cached: false });
  } catch (err) {
    next(err);
  } finally {
    _generating = false;
  }
});

module.exports = router;
