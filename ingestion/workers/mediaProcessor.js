'use strict';

/**
 * MediaProcessorWorker — processes image, video and audio files through GCP
 * media analysis APIs, writes a text transcript/description to the normalized
 * bucket, and advances the job to INDEXING so IndexerWorker can create the DE
 * document with rich structData metadata.
 *
 * Activated when:
 *   - job.status === 'VALIDATING'
 *   - job.mimeType is an image, video or audio MIME type
 *
 * Required environment variables:
 *   GOOGLE_CLOUD_PROJECT    GCP project ID
 *
 * Optional environment variables:
 *   BUCKET_NORMALIZED       GCS bucket for processed output (required in prod)
 *
 * External tool required (production):
 *   ffmpeg                  For audio noise reduction and video audio extraction.
 *                           Install via: apt-get install -y ffmpeg
 *                           If absent, noise reduction is skipped with a warning.
 *
 * Pipeline position: after DocumentAIWorker, before SplitterWorker.
 */

const os   = require('os');
const fs   = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const { BaseWorker }  = require('./base');
const { parseGcsUri } = require('../lib/gcs');

// ── MIME type sets ─────────────────────────────────────────────────────────────

const IMAGE_MIMES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
]);
const VIDEO_MIMES = new Set([
  'video/mp4', 'video/mpeg', 'video/avi', 'video/quicktime',
  'video/x-msvideo', 'video/webm', 'video/ogg',
]);
const AUDIO_MIMES = new Set([
  'audio/wav', 'audio/x-wav', 'audio/mp3', 'audio/mpeg',
  'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/flac',
]);

function _isMediaMime(mimeType) {
  return IMAGE_MIMES.has(mimeType) || VIDEO_MIMES.has(mimeType) || AUDIO_MIMES.has(mimeType);
}

// ── ffmpeg availability ────────────────────────────────────────────────────────

let _ffmpegOk = null;
function _ffmpegAvailable() {
  if (_ffmpegOk !== null) return _ffmpegOk;
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); _ffmpegOk = true; }
  catch { _ffmpegOk = false; }
  return _ffmpegOk;
}

// ── Worker ────────────────────────────────────────────────────────────────────

class MediaProcessorWorker extends BaseWorker {
  constructor(config, logger) {
    super('media-processor', logger);
    this._config = config;
  }

  shouldRun(job) {
    return job.status === 'VALIDATING' && _isMediaMime(job.mimeType);
  }

  async run(job, context = {}) {
    const { storage } = context;
    const normalizedBucket = this._config.buckets.normalized;
    const projectId        = this._config.projectId;
    const docId            = _toDocumentId(job.originalFilename);
    const mediaPrefix      = `moby-prince/media/${docId}`;

    if (!normalizedBucket) {
      return this.halt(job.fail('MEDIA_FAILURE', 'BUCKET_NORMALIZED not configured'));
    }
    if (!projectId) {
      return this.halt(job.fail('MEDIA_FAILURE', 'GOOGLE_CLOUD_PROJECT not configured'));
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moby-media-'));

    try {
      const sourceUri = job.sourceUri;
      let result;

      if (IMAGE_MIMES.has(job.mimeType)) {
        result = await this._processImage(sourceUri, storage, tmpDir);
      } else if (VIDEO_MIMES.has(job.mimeType)) {
        result = await this._processVideo(sourceUri, storage, normalizedBucket, tmpDir, projectId);
      } else {
        result = await this._processAudio(sourceUri, storage, normalizedBucket, tmpDir, projectId);
      }

      // ── Write transcript / description text to normalized bucket ────────────
      const transcriptPath = `${mediaPrefix}_transcript.txt`;
      await storage.bucket(normalizedBucket).file(transcriptPath).save(
        result.fullText || `[Nessun testo estratto da ${job.originalFilename}]`,
        { contentType: 'text/plain; charset=utf-8', metadata: { jobId: job.jobId } },
      );
      const transcriptUri = `gs://${normalizedBucket}/${transcriptPath}`;

      // ── Write metadata JSON to normalized bucket ────────────────────────────
      const metaPath = `${mediaPrefix}_meta.json`;
      const metaPayload = {
        media_type:              result.mediaType,
        duration_seconds:        result.durationSeconds  ?? null,
        language_detected:       result.languageDetected ?? null,
        contains_speech:         result.containsSpeech   ?? false,
        transcription_confidence:result.confidence       ?? null,
        labels:                  result.labels           ?? [],
        locations_detected:      result.locations        ?? [],
        shot_timestamps:         result.shotTimestamps   ?? [],
        transcript_uri:          transcriptUri,
        original_uri:            sourceUri,
      };
      await storage.bucket(normalizedBucket).file(metaPath).save(
        JSON.stringify(metaPayload, null, 2),
        { contentType: 'application/json', metadata: { jobId: job.jobId } },
      );
      const metaUri = `gs://${normalizedBucket}/${metaPath}`;

      this.logger.info(
        { jobId: job.jobId, mediaType: result.mediaType, transcriptUri, metaUri },
        'Media processed successfully',
      );

      // Advance job to INDEXING with transcript as content + media structData as meta
      const updated = job._next({
        status:        'INDEXING',
        normalizedUri: transcriptUri,
        meta: {
          media_type:               metaPayload.media_type,
          duration_seconds:         metaPayload.duration_seconds,
          language_detected:        metaPayload.language_detected,
          contains_speech:          metaPayload.contains_speech,
          transcription_confidence: metaPayload.transcription_confidence,
          labels:                   metaPayload.labels.slice(0, 20).join(', '),
          locations_detected:       metaPayload.locations_detected.join(', '),
          shot_timestamps:          metaPayload.shot_timestamps.join(', '),
          transcript_uri:           transcriptUri,
          meta_uri:                 metaUri,
          original_uri:             sourceUri,
        },
      });

      return this.ok(updated);

    } catch (err) {
      this.logger.error({ jobId: job.jobId, error: err.message, stack: err.stack }, 'Media processing failed');
      return this.halt(job.fail('MEDIA_FAILURE', `Media processing error: ${err.message}`));
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }

  // ── Image processing ────────────────────────────────────────────────────────

  async _processImage(sourceUri, storage, tmpDir) {
    const { getAccessToken } = require('../services/auth');

    // Download image
    const imgBuffer = await _downloadToBuffer(sourceUri, storage, tmpDir);

    // Call Vision API
    const token = await getAccessToken();
    const visionRes = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image:    { content: imgBuffer.toString('base64') },
          features: [
            { type: 'LABEL_DETECTION',     maxResults: 20 },
            { type: 'TEXT_DETECTION' },
            { type: 'OBJECT_LOCALIZATION', maxResults: 10 },
            { type: 'LANDMARK_DETECTION',  maxResults: 5 },
          ],
        }],
      }),
    });
    if (!visionRes.ok) throw new Error(`Vision API HTTP ${visionRes.status}`);
    const visionData  = await visionRes.json();
    const resp        = visionData.responses?.[0] ?? {};

    const labels    = (resp.labelAnnotations           || []).map(a => a.description).filter(Boolean);
    const objects   = (resp.localizedObjectAnnotations || []).map(a => a.name).filter(Boolean);
    const locations = (resp.landmarkAnnotations        || []).map(a => a.description).filter(Boolean);
    const ocrText   = resp.fullTextAnnotation?.text
      || resp.textAnnotations?.[0]?.description
      || '';

    const allLabels = [...new Set([...labels, ...objects])];
    const textParts = [];
    if (ocrText)               textParts.push(ocrText);
    if (allLabels.length > 0)  textParts.push(`[Oggetti rilevati: ${allLabels.join(', ')}]`);
    if (locations.length > 0)  textParts.push(`[Luoghi: ${locations.join(', ')}]`);

    return {
      mediaType:       'image',
      fullText:        textParts.join('\n\n'),
      labels:          allLabels,
      locations,
      containsSpeech:  false,
      durationSeconds: null,
      languageDetected: null,
      confidence:      null,
      shotTimestamps:  [],
    };
  }

  // ── Video processing ────────────────────────────────────────────────────────

  async _processVideo(sourceUri, storage, normalizedBucket, tmpDir, projectId) {
    const { getAccessToken } = require('../services/auth');

    // Video Intelligence API (async LRO)
    const token     = await getAccessToken();
    const submitRes = await fetch('https://videointelligence.googleapis.com/v1/videos:annotate', {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputUri: sourceUri.startsWith('gs://') ? sourceUri : null,
        features: ['SHOT_CHANGE_DETECTION', 'LABEL_DETECTION', 'SPEECH_TRANSCRIPTION'],
        videoContext: {
          speechTranscriptionConfig: {
            languageCode:             'it-IT',
            enableWordTimeOffsets:    true,
            enableWordConfidence:     true,
            enableSpeakerDiarization: true,
            diarizationSpeakerCount:  5,
          },
        },
        ...(!sourceUri.startsWith('gs://') ? {
          inputContent: (await _downloadToBuffer(sourceUri, storage, tmpDir)).toString('base64'),
        } : {}),
      }),
    });
    if (!submitRes.ok) throw new Error(`Video Intelligence HTTP ${submitRes.status}`);
    const { name: opName } = await submitRes.json();

    // Also extract audio + noise reduce + STT for higher quality transcript
    let sttText = '';
    let sttConfidence = null;
    try {
      const cleanAudioUri = await this._extractAndCleanAudio(
        sourceUri, storage, normalizedBucket, tmpDir, projectId, 'video',
      );
      if (cleanAudioUri) {
        const sttResult  = await _callSTT(cleanAudioUri, projectId);
        sttText          = sttResult.fullText;
        sttConfidence    = sttResult.confidence;
      }
    } catch (sttErr) {
      this.logger.warn({ error: sttErr.message }, 'Video STT fallback failed; using VI transcript');
    }

    // Poll VI LRO
    const viResp  = await _pollLRO(
      `https://videointelligence.googleapis.com/v1/${opName}`,
      30 * 60_000,
    );
    const ann     = viResp.annotationResults?.[0] || {};

    const shots   = (ann.shotAnnotations || []).map((s, i) => ({
      index: i, startTime: s.startTimeOffset || '0s', endTime: s.endTimeOffset || '0s',
    }));
    const labels  = [
      ...(ann.segmentLabelAnnotations || []),
      ...(ann.frameLabelAnnotations   || []),
    ].map(l => l.entity?.description).filter(Boolean);
    const viAlts  = (ann.speechTranscriptions || [])
      .flatMap(t => t.alternatives || [])
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
    const viText  = viAlts.map(a => a.transcript).join('\n');

    // Prefer STT (noise-reduced) transcript when available
    const fullText  = sttText || viText;
    const confidence = sttConfidence ?? viAlts[0]?.confidence ?? null;
    const duration   = shots.length > 0
      ? _timeToSeconds(shots[shots.length - 1].endTime)
      : null;

    return {
      mediaType:        'video',
      fullText,
      labels:           [...new Set(labels)],
      locations:        [],
      containsSpeech:   !!fullText,
      durationSeconds:  duration,
      languageDetected: 'it-IT',
      confidence,
      shotTimestamps:   shots.map(s => s.startTime),
    };
  }

  // ── Audio processing ────────────────────────────────────────────────────────

  async _processAudio(sourceUri, storage, normalizedBucket, tmpDir, projectId) {
    const cleanAudioUri = await this._extractAndCleanAudio(
      sourceUri, storage, normalizedBucket, tmpDir, projectId, 'audio',
    );

    const result = await _callSTT(cleanAudioUri || sourceUri, projectId);

    return {
      mediaType:        'audio',
      fullText:         result.fullText,
      labels:           [],
      locations:        [],
      containsSpeech:   !!result.fullText,
      durationSeconds:  null,
      languageDetected: result.languageCode || 'it-IT',
      confidence:       result.confidence,
      shotTimestamps:   [],
    };
  }

  // ── ffmpeg noise reduction ──────────────────────────────────────────────────

  /**
   * Download media, apply ffmpeg noise reduction, upload clean audio to GCS.
   * Returns the gs:// URI of the clean audio file, or null if ffmpeg unavailable.
   *
   * @param {'audio'|'video'} kind
   */
  async _extractAndCleanAudio(sourceUri, storage, normalizedBucket, tmpDir, projectId, kind) {
    if (!_ffmpegAvailable()) {
      this.logger.warn({}, 'ffmpeg not found — skipping noise reduction; sending original audio to STT');
      return null;
    }

    // ── Download source to /tmp ─────────────────────────────────────────────
    const ext       = path.extname(sourceUri.split('?')[0]) || '.bin';
    const inputPath = path.join(tmpDir, `input${ext}`);
    const outPath   = path.join(tmpDir, 'clean.wav');

    await _downloadToFile(sourceUri, storage, inputPath);

    // ── Run ffmpeg ───────────────────────────────────────────────────────────
    const ffArgs = [
      '-y', '-i', inputPath,
      ...(kind === 'video' ? ['-vn'] : []),                 // strip video track for audio output
      '-af', 'afftdn=nf=-25,highpass=f=150,lowpass=f=3500', // denoise + bandpass for speech
      '-ar', '16000',                                        // STT requires 16 kHz
      '-ac', '1',                                            // mono
      '-c:a', 'pcm_s16le',                                   // uncompressed WAV
      outPath,
    ];
    const ff = spawnSync('ffmpeg', ffArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
    if (ff.status !== 0) {
      const stderr = ff.stderr?.toString().slice(-300) ?? '';
      this.logger.warn({ stderr }, 'ffmpeg failed — sending original audio to STT');
      return null;
    }

    // ── Upload clean audio to GCS ────────────────────────────────────────────
    const docId       = _toDocumentId(path.basename(sourceUri));
    const cleanName   = `moby-prince/media/${docId}_clean.wav`;
    const cleanBuffer = fs.readFileSync(outPath);
    await storage.bucket(normalizedBucket).file(cleanName).save(cleanBuffer, {
      contentType: 'audio/wav',
      metadata:    { temporary: 'true' },
    });

    this.logger.info({ cleanName, sizeKb: Math.round(cleanBuffer.length / 1024) }, 'Clean audio uploaded');
    return `gs://${normalizedBucket}/${cleanName}`;
  }
}

// ── API helpers (REST, using ingestion auth) ───────────────────────────────────

async function _callSTT(gcsUri, projectId) {
  const { getAccessToken } = require('../services/auth');
  const token    = await getAccessToken();
  const endpoint =
    `https://speech.googleapis.com/v2/projects/${projectId}` +
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
  if (!res.ok) throw new Error(`STT HTTP ${res.status}`);
  const data = await res.json();
  if (data.name) {
    const resp = await _pollLRO(
      `https://speech.googleapis.com/v2/${data.name}`,
      10 * 60_000,
    );
    return _parseSttResults(resp);
  }
  return _parseSttResults(data);
}

function _parseSttResults(data) {
  const alts = (data.results || []).map(r => r.alternatives?.[0]).filter(Boolean);
  return {
    fullText:    alts.map(a => a.transcript).join('\n'),
    words:       alts.flatMap(a => a.words || []),
    confidence:  alts.length > 0
      ? alts.reduce((s, a) => s + (a.confidence || 0), 0) / alts.length
      : null,
    languageCode: 'it-IT',
  };
}

// ── LRO polling ───────────────────────────────────────────────────────────────

async function _pollLRO(url, timeoutMs) {
  const { getAccessToken } = require('../services/auth');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await _sleep(10_000);
    const token   = await getAccessToken();
    const pollRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!pollRes.ok) throw new Error(`LRO poll HTTP ${pollRes.status}`);
    const poll = await pollRes.json();
    if (poll.done) {
      if (poll.error) throw new Error(`LRO error: ${JSON.stringify(poll.error)}`);
      return poll.response;
    }
  }
  throw new Error(`LRO timed out after ${timeoutMs / 60_000} minutes`);
}

// ── GCS helpers ───────────────────────────────────────────────────────────────

async function _downloadToBuffer(sourceUri, storage, tmpDir) {
  if (sourceUri.startsWith('gs://')) {
    const { bucket, name } = parseGcsUri(sourceUri);
    const [buf] = await storage.bucket(bucket).file(name).download();
    return buf;
  }
  // Local path
  return require('fs').readFileSync(sourceUri);
}

async function _downloadToFile(sourceUri, storage, destPath) {
  const buf = await _downloadToBuffer(sourceUri, storage, path.dirname(destPath));
  fs.writeFileSync(destPath, buf);
}

// ── Misc helpers ──────────────────────────────────────────────────────────────

function _toDocumentId(filename) {
  const crypto = require('crypto');
  const hash   = crypto.createHash('sha1').update(filename).digest('hex').slice(0, 8);
  const slug   = filename
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug}-${hash}`.slice(0, 63);
}

function _timeToSeconds(t) {
  return parseFloat(String(t || '0').replace('s', '')) || 0;
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { MediaProcessorWorker };
