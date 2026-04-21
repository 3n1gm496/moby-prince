'use strict';

/**
 * Cloud Video Intelligence API REST client.
 * Used by backend routes for on-demand video annotation queries.
 *
 * Annotation is async (LRO). annotateVideo() submits the job and polls until
 * completion (up to 30 minutes).
 */

const { getAccessToken } = require('./auth');

const VI_ENDPOINT = 'https://videointelligence.googleapis.com/v1/videos:annotate';
const POLL_INTERVAL_MS = 10_000;
const POLL_MAX_ATTEMPTS = 180; // 30 min

/**
 * Annotate a video stored in GCS (shot detection, labels, speech).
 * Returns the raw annotation result after the LRO completes.
 *
 * @param {string} gcsUri   gs://bucket/path/to/video.mp4
 */
async function annotateVideo(gcsUri) {
  const token = await getAccessToken();
  const submitRes = await fetch(VI_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputUri: gcsUri,
      features: ['SHOT_CHANGE_DETECTION', 'LABEL_DETECTION', 'SPEECH_TRANSCRIPTION'],
      videoContext: {
        speechTranscriptionConfig: {
          languageCode:              'it-IT',
          enableWordTimeOffsets:     true,
          enableWordConfidence:      true,
          enableSpeakerDiarization:  true,
          diarizationSpeakerCount:   5,
        },
      },
    }),
  });
  if (!submitRes.ok) {
    const text = await submitRes.text().catch(() => '');
    throw new Error(`Video Intelligence submit HTTP ${submitRes.status}: ${text.slice(0, 200)}`);
  }
  const { name: operationName } = await submitRes.json();
  return _pollOperation(operationName);
}

async function _pollOperation(operationName) {
  const url = `https://videointelligence.googleapis.com/v1/${operationName}`;
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    await _sleep(POLL_INTERVAL_MS);
    const token   = await getAccessToken();
    const pollRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!pollRes.ok) throw new Error(`Video Intelligence poll HTTP ${pollRes.status}`);
    const poll = await pollRes.json();
    if (poll.done) {
      if (poll.error) throw new Error(`Video Intelligence error: ${JSON.stringify(poll.error)}`);
      return poll.response;
    }
  }
  throw new Error('Video Intelligence timed out after 30 minutes');
}

/**
 * Parse Video Intelligence annotation response.
 *
 * @returns {{ shots, labels, fullText, words, durationSeconds, confidence }}
 */
function parseVideoAnnotations(resp) {
  const ann = resp.annotationResults?.[0] || {};

  const shots = (ann.shotAnnotations || []).map((s, i) => ({
    index:     i,
    startTime: s.startTimeOffset || '0s',
    endTime:   s.endTimeOffset   || '0s',
  }));

  const labels = [
    ...(ann.segmentLabelAnnotations || []),
    ...(ann.frameLabelAnnotations   || []),
  ].map(l => l.entity?.description).filter(Boolean);

  const transcriptions = (ann.speechTranscriptions || [])
    .flatMap(t => t.alternatives || [])
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  const fullText       = transcriptions.map(a => a.transcript).join('\n');
  const words          = transcriptions.flatMap(a => a.words || []);
  const confidence     = transcriptions[0]?.confidence ?? null;
  const durationSeconds = shots.length > 0 ? _timeToSeconds(shots[shots.length - 1].endTime) : null;

  return { shots, labels: [...new Set(labels)], fullText, words, durationSeconds, confidence };
}

function _timeToSeconds(t) {
  if (!t) return 0;
  return parseFloat(String(t).replace('s', '')) || 0;
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { annotateVideo, parseVideoAnnotations };
