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

const config             = require('../config');
const { getAccessToken } = require('./auth');
const { createLogger }   = require('../logger');

const log     = createLogger('gemini');
const MODEL   = 'gemini-2.0-flash-001';
const TIMEOUT = 60_000;

function _endpoint() {
  const location = process.env.GEMINI_LOCATION || 'us-central1';
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${location}/publishers/google/models/${MODEL}:generateContent`;
}

/**
 * Send a prompt expecting a JSON response.
 * @param {string} prompt
 * @param {number} [maxOutputTokens=2048]
 * @returns {Promise<any>}  Parsed JSON value
 */
async function generateJson(prompt, maxOutputTokens = 2048) {
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

module.exports = { generateJson };
