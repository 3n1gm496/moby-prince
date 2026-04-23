'use strict';

/**
 * Gemini Flash REST client for ingestion workers.
 *
 * Supports two backends:
 *   - Google AI Studio (GEMINI_API_KEY set): text-only via generativelanguage.googleapis.com
 *   - Vertex AI (ADC token): text + GCS file URIs via aiplatform.googleapis.com
 *
 * generateJson()         — text prompt → JSON (uses AI Studio if key set, else Vertex AI)
 * generateJsonFromFile() — GCS URI + MIME type → JSON (always uses Vertex AI for GCS support)
 *
 * Env vars:
 *   GEMINI_API_KEY       — Google AI Studio key (text-only calls)
 *   GEMINI_MODEL         — model name (default: gemini-2.5-flash-lite)
 *   GOOGLE_CLOUD_PROJECT — required for Vertex AI
 *   GEMINI_LOCATION      — Vertex AI region (default: us-central1)
 */

const { getAccessToken } = require('./auth');

const MODEL    = process.env.GEMINI_MODEL    || 'gemini-2.5-flash-lite';
const API_KEY  = process.env.GEMINI_API_KEY;
const LOCATION = process.env.GEMINI_LOCATION || 'us-central1';
const TIMEOUT  = 120_000;  // 2 min — media files take longer

// 429 retry: up to 4 attempts with exponential backoff
const MAX_RETRIES  = 4;
const RETRY_BASE_S = 5;

// MIME types supported by Gemini multimodal (for generateJsonFromFile)
const SUPPORTED_FILE_MIMES = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
  'video/mp4', 'video/mpeg', 'video/mov', 'video/quicktime', 'video/avi',
  'video/x-flv', 'video/mpg', 'video/webm', 'video/wmv', 'video/3gpp',
  'audio/aac', 'audio/flac', 'audio/mp3', 'audio/m4a', 'audio/mpeg',
  'audio/mpga', 'audio/mp4', 'audio/opus', 'audio/pcm', 'audio/wav', 'audio/webm',
]);

function _aiStudioEndpoint() {
  return `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
}

function _vertexEndpoint() {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  return `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${project}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function _repairJson(text) {
  const lastBrace = text.lastIndexOf('}');
  if (lastBrace === -1) return null;
  for (const suffix of [']}', ']\n}']) {
    try { return JSON.parse(text.slice(0, lastBrace + 1) + suffix); } catch {}
  }
  return null;
}

function _parseResponse(data, context) {
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`${context}: empty response`);
  try { return JSON.parse(text); } catch (parseErr) {
    process.stderr.write(`\n[gemini] JSON parse error (${context}): ${parseErr.message}\nRaw (first 500): ${text.slice(0, 500)}\n`);
    const repaired = _repairJson(text);
    if (repaired) return repaired;
    throw new Error(`${context}: JSON parse failed — ${parseErr.message}`);
  }
}

/**
 * Send a text prompt expecting a JSON response.
 * Uses Google AI Studio if GEMINI_API_KEY is set, otherwise Vertex AI.
 * Retries on 429 with exponential backoff.
 */
async function generateJson(prompt, maxOutputTokens = 2048) {
  const useApiKey = Boolean(API_KEY);
  if (!useApiKey && !process.env.GOOGLE_CLOUD_PROJECT) {
    throw new Error('Set GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT');
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const headers = { 'Content-Type': 'application/json' };
    if (useApiKey) {
      // API key is in the URL; no Authorization header needed
    } else {
      headers.Authorization = `Bearer ${await getAccessToken()}`;
    }

    const controller = new AbortController();
    const timerId    = setTimeout(() => controller.abort(), TIMEOUT);
    let res;
    try {
      res = await fetch(useApiKey ? _aiStudioEndpoint() : _vertexEndpoint(), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens },
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timerId);
      if (err.name === 'AbortError') throw new Error('Gemini API timed out');
      throw err;
    }
    clearTimeout(timerId);

    if (res.status === 429) {
      const waitS = RETRY_BASE_S * Math.pow(3, attempt - 1);
      process.stderr.write(`\n[gemini] 429 — attendo ${waitS}s (tentativo ${attempt}/${MAX_RETRIES})...\n`);
      await _sleep(waitS * 1000);
      continue;
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }
    return _parseResponse(await res.json(), 'generateJson');
  }

  throw new Error(`Gemini: quota superata dopo ${MAX_RETRIES} tentativi.`);
}

/**
 * Send a GCS file (video/audio/image/PDF) + text prompt expecting a JSON response.
 * Always uses Vertex AI because Google AI Studio doesn't support GCS URIs directly.
 * Returns null if Vertex AI is unavailable (caller should skip gracefully).
 */
async function generateJsonFromFile(gcsUri, mimeType, prompt, maxOutputTokens = 8192) {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) throw new Error('GOOGLE_CLOUD_PROJECT required for file-based Gemini calls');

  const controller = new AbortController();
  const timerId    = setTimeout(() => controller.abort(), TIMEOUT);
  let res;
  try {
    res = await fetch(_vertexEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${await getAccessToken()}`,
      },
      body: JSON.stringify({
        contents: [{
          role:  'user',
          parts: [
            { fileData: { mimeType, fileUri: gcsUri } },
            { text: prompt },
          ],
        }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timerId);
    if (err.name === 'AbortError') throw new Error('Vertex AI file call timed out');
    throw err;
  }
  clearTimeout(timerId);

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Vertex AI HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  return _parseResponse(await res.json(), `generateJsonFromFile(${mimeType})`);
}

module.exports = { generateJson, generateJsonFromFile, SUPPORTED_FILE_MIMES };
