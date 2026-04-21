'use strict';

/**
 * Gemini Flash REST client for ingestion workers.
 *
 * Uses Vertex AI generateContent endpoint with JSON response mode.
 * Keeps the response compact by capping maxOutputTokens at 4096.
 *
 * Required env vars:
 *   GOOGLE_CLOUD_PROJECT
 *   GEMINI_LOCATION   (default: "us-central1" — Vertex AI Gemini availability)
 *
 * Model: gemini-2.0-flash-001 (fast, cost-effective for high-volume ingestion)
 */

const { getAccessToken } = require('./auth');

const MODEL    = 'gemini-2.0-flash-001';
const TIMEOUT  = 60_000; // ms

function _endpoint() {
  const project  = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GEMINI_LOCATION || 'us-central1';
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${MODEL}:generateContent`;
}

/**
 * Send a prompt expecting a JSON response.
 * Returns the parsed JS value (object, array, etc.).
 *
 * @param {string}  prompt
 * @param {number}  [maxOutputTokens=2048]
 * @returns {Promise<any>}
 */
async function generateJson(prompt, maxOutputTokens = 2048) {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) throw new Error('GOOGLE_CLOUD_PROJECT not set');

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
    throw new Error(`Gemini API HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty content');

  return JSON.parse(text);
}

module.exports = { generateJson };
