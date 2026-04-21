'use strict';

/**
 * Cloud Speech-to-Text v2 REST client.
 * Used by backend routes for on-demand audio transcription queries.
 *
 * Transcription is async (LRO via batchRecognize with inlineResponseConfig).
 */

const config = require('../config');
const { getAccessToken } = require('./auth');

const POLL_INTERVAL_MS  = 5_000;
const POLL_MAX_ATTEMPTS = 120; // 10 min

/**
 * Transcribe audio from a GCS URI (16 kHz mono WAV expected after noise reduction).
 *
 * @param {string} gcsUri   gs://bucket/path/to/audio.wav
 * @returns {Promise<{ fullText, words, confidence, languageCode }>}
 */
async function transcribeAudio(gcsUri) {
  const token    = await getAccessToken();
  const endpoint =
    `https://speech.googleapis.com/v2/projects/${config.projectId}` +
    `/locations/global/recognizers/_:batchRecognize`;

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: {
        languageCodes:     ['it-IT', 'it'],
        model:             'chirp_2',
        features: {
          enableWordTimeOffsets: true,
          enableWordConfidence:  true,
          diarizationConfig: {
            enableSpeakerDiarization: true,
            minSpeakerCount:          1,
            maxSpeakerCount:          5,
          },
        },
        autoDecodingConfig: {},
      },
      files:                   [{ uri: gcsUri }],
      recognitionOutputConfig: { inlineResponseConfig: {} },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Speech-to-Text HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  if (data.name) return _pollOperation(data.name);
  return _parseResults(data);
}

async function _pollOperation(operationName) {
  const url = `https://speech.googleapis.com/v2/${operationName}`;
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    await _sleep(POLL_INTERVAL_MS);
    const token   = await getAccessToken();
    const pollRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!pollRes.ok) throw new Error(`STT poll HTTP ${pollRes.status}`);
    const poll = await pollRes.json();
    if (poll.done) {
      if (poll.error) throw new Error(`STT error: ${JSON.stringify(poll.error)}`);
      return _parseResults(poll.response);
    }
  }
  throw new Error('Speech-to-Text timed out after 10 minutes');
}

function _parseResults(data) {
  const results      = data.results || [];
  const alternatives = results.map(r => r.alternatives?.[0]).filter(Boolean);
  const fullText     = alternatives.map(a => a.transcript).join('\n');
  const words        = alternatives.flatMap(a => a.words || []);
  const confidence   = alternatives.length > 0
    ? alternatives.reduce((s, a) => s + (a.confidence || 0), 0) / alternatives.length
    : null;
  return { fullText, words, confidence, languageCode: 'it-IT' };
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { transcribeAudio };
