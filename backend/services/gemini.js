'use strict';

/**
 * Gemini REST client for backend services (contradiction detection, etc.).
 *
 * Uses Vertex AI generateContent endpoint with JSON response mode.
 * Mirrors the pattern in ingestion/services/gemini.js but uses the backend
 * auth module and reads from backend config.
 *
 * Required env vars (same as ingestion):
 *   GOOGLE_CLOUD_PROJECT
 *   GEMINI_LOCATION   (default: "us-central1")
 */

const config                    = require('../config');
const { getAccessToken }        = require('./auth');
const { createLogger }          = require('../logger');
const { incrementGemini }       = require('./rateLimiter');

const log              = createLogger('gemini');
const MODEL            = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const EMBEDDING_MODEL  = 'text-embedding-004';
const TIMEOUT          = 60_000;

function _location() {
  return config.geminiLocation;
}

function _endpoint() {
  const loc = _location();
  return `https://${loc}-aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${loc}/publishers/google/models/${MODEL}:generateContent`;
}

function _embeddingEndpoint() {
  const loc = _location();
  return `https://${loc}-aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${loc}/publishers/google/models/${EMBEDDING_MODEL}:predict`;
}

/**
 * Send a prompt expecting a JSON response.
 * @param {string} prompt
 * @param {number} [maxOutputTokens=2048]
 * @returns {Promise<any>}  Parsed JSON value
 */
async function generateJson(prompt, maxOutputTokens = 2048) {
  incrementGemini();
  const token      = await getAccessToken();
  const controller = new AbortController();
  const timerId    = setTimeout(() => controller.abort(), TIMEOUT);

  let res;
  try {
    res = await fetch(_endpoint(), {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature:      0.1,
          maxOutputTokens,
        },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timerId);
    if (err.name === 'AbortError') throw new Error('Gemini API timed out');
    throw err;
  }
  clearTimeout(timerId);

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    log.error({ status: res.status, detail: errText.slice(0, 200) }, 'Gemini API error');
    throw new Error(`Gemini API HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty content');

  return JSON.parse(text);
}

/**
 * Fetch text embeddings for an array of strings (batch call).
 * Returns a parallel array of float arrays; throws on API failure so callers
 * can decide whether to fall back or abort.
 *
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
async function getEmbeddings(texts) {
  if (!texts || texts.length === 0) return [];
  incrementGemini();
  const token      = await getAccessToken();
  const controller = new AbortController();
  const timerId    = setTimeout(() => controller.abort(), TIMEOUT);

  let res;
  try {
    res = await fetch(_embeddingEndpoint(), {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instances: texts.map(content => ({ content })),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timerId);
    if (err.name === 'AbortError') throw new Error('Embeddings API timed out');
    throw err;
  }
  clearTimeout(timerId);

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    log.error({ status: res.status, detail: errText.slice(0, 200) }, 'Embeddings API error');
    throw new Error(`Embeddings API HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.predictions || []).map(p => p.embeddings?.values || []);
}

module.exports = { generateJson, getEmbeddings };
