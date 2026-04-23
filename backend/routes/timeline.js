'use strict';

/**
 * Timeline API
 *
 * GET  /api/timeline/documents   — all DE documents with year metadata
 * GET  /api/timeline/events      — curated events from GCS _timeline/events.json
 * PUT  /api/timeline/events      — save entire events array to GCS
 */

const { Router } = require('express');
const de         = require('../services/discoveryEngine');
const gcs        = require('../services/gcs');
const config     = require('../config');
const eventsRepo = require('../repos/events');

// Extract a human-readable title from a GCS URI (preferred over structData.title
// which often contains the import folder name, e.g. "Atti Parlamentari").
function _titleFromUri(uri) {
  if (!uri) return null;
  const filename = (uri.split('/').pop() || '').replace(/\.[^.]+$/, '');
  return filename.replace(/[_-]+/g, ' ').trim() || null;
}

function _docTitle(sd, doc) {
  const fromUri = _titleFromUri(doc?.content?.uri);
  if (fromUri) return fromUri;
  return sd?.title || doc?.name?.split('/').pop() || '';
}

// Extract a 4-digit year (1980–2030) from free text: titles, URIs, filenames.
function _yearFromText(text) {
  if (!text) return null;
  const m = text.match(/\b(19[89]\d|20[0-2]\d)\b/);
  return m ? Number(m[1]) : null;
}

const _TIMELINE_STOPWORDS = new Set([
  'moby','prince','della','delle','degli','dello','negli','nella','nelle',
  'sono','stato','stati','stata','essere','hanno','anno','caso','legge',
  'comma','articolo','documento','atti','parlamentari','commissione',
]);

// Assign up to maxDocs linked docs to each event using keyword overlap between
// the event title and the doc title. Falls back to empty array when no match.
function _assignDocsToEvents(events, allDocs) {
  if (!allDocs || allDocs.length === 0) return events;
  return events.map(ev => {
    const titleWords = new Set(
      ev.title.toLowerCase().split(/\W+/)
        .filter(w => w.length >= 4 && !_TIMELINE_STOPWORDS.has(w))
    );
    if (titleWords.size === 0) return { ...ev, linkedDocs: [] };

    const matched = allDocs.filter(d => {
      const words = (d.title || '').toLowerCase().split(/\W+/);
      return words.some(w => w.length >= 4 && titleWords.has(w));
    });
    return { ...ev, linkedDocs: matched.slice(0, 3) };
  });
}
const { isBigQueryEnabled } = require('../services/bigquery');

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
        const sd    = doc.structData || {};
        const title = _docTitle(sd, doc);
        const uri   = doc.content?.uri || null;
        const year  = sd.year
          ? Number(sd.year)
          : _yearFromText(title) ?? _yearFromText(uri);
        allDocs.push({
          id:           doc.name?.split('/').pop() || '',
          title,
          year,
          documentType: sd.documentType || null,
          institution:  sd.institution  || null,
          legislature:  sd.legislature  || null,
          uri,
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
// Try BigQuery first (structured evidence layer); fall back to GCS JSON cache.

router.get('/events', async (req, res, next) => {
  // BigQuery path (authoritative when available)
  if (isBigQueryEnabled()) {
    try {
      const from      = typeof req.query.from === 'string' ? req.query.from : undefined;
      const to        = typeof req.query.to   === 'string' ? req.query.to   : undefined;
      const bqEvents  = await eventsRepo.list({ from, to, limit: 500 });
      if (bqEvents.length > 0) {
        return res.json({ events: bqEvents, source: 'bigquery' });
      }
    } catch (bqErr) {
      // BQ unavailable — fall through to GCS cache
    }
  }

  // GCS JSON fallback
  if (!config.gcsBucket) return res.json({ events: [], source: 'empty' });
  try {
    const obj    = await gcs.getObject(EVENTS_PATH);
    const text   = await obj.text();
    const events = JSON.parse(text);
    res.json({ events: Array.isArray(events) ? events : [], source: 'gcs' });
  } catch (err) {
    if (err.statusCode === 404) return res.json({ events: [], source: 'empty' });
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
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  if (/^\d{4}-\d{2}$/.test(s)) {
    const m = parseInt(s.slice(5, 7), 10);
    if (m < 1 || m > 12) return `${s.slice(0, 4)}-01-01`;
    return `${s}-01`;
  }
  // Full YYYY-MM-DD: validate month and day ranges
  const parts = s.split('-');
  if (parts.length >= 3) {
    const [, mm, dd] = parts;
    const m = parseInt(mm, 10);
    const d = parseInt(dd, 10);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  }
  return s;
}

// Extract source document refs from a Discovery Engine :answer response.
function _extractLinkedDocs(answer) {
  const refs = answer?.references || [];
  return refs
    .map(r => {
      const info = r.unstructuredDocumentInfo || r.chunkInfo?.documentMetadata || {};
      const name = info.document || '';
      const id   = name.split('/').pop() || '';
      const uri  = info.uri || '';
      return {
        id,
        title: _titleFromUri(uri) || info.title || id,
        uri,
      };
    })
    .filter(d => d.id);
}

function parseEvents(answerText, linkedDocs = []) {
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
    'elenca in ordine cronologico ALMENO 60 eventi storici, giudiziari e parlamentari importanti.',
    'Includi: l\'incidente del 10 aprile 1991, i soccorsi mancati, le prime indagini, i procedimenti penali,',
    'le sentenze, le riaperture del caso, le audizioni della commissione parlamentare (2018-2022),',
    'le relazioni ufficiali, i testimoni chiave, le perizie tecniche e gli atti di governo.',
    'Per ogni evento usa ESATTAMENTE questo formato su una riga separata (senza numerazione, senza intestazioni):',
    'DATA | TIPO | TITOLO | DESCRIZIONE',
    'DATA = YYYY-MM-DD (YYYY-01-01 se ignoti mese e giorno, YYYY-MM-01 se ignoto solo il giorno)',
    'TIPO = uno tra: evento, udienza, sentenza, relazione, commissione',
    'TITOLO = massimo 8 parole, specifico e informativo',
    'DESCRIZIONE = 1-2 frasi concise che spiegano il contesto e la rilevanza.',
  ].join(' ');

  try {
    const raw        = await de.answer(prompt, null, { maxResults: 20, modelVersion: 'stable' });
    const answer     = raw.answer ?? raw;
    const answerText = answer?.answerText ?? '';

    // Extract referenced documents from the answer response.
    const linkedDocs = _extractLinkedDocs(answer);

    const { events: rawAiEvents, skipped } = parseEvents(answerText, []);
    // Assign linked docs per event via title keyword matching (cheaper than per-event search).
    const aiEvents = _assignDocsToEvents(rawAiEvents, linkedDocs);

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
