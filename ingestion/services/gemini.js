'use strict';

/**
 * Gemini Flash REST client for ingestion workers.
 *
 * Supports two backends (auto-selected):
 *   - Google AI Studio (GEMINI_API_KEY set): uses generativelanguage.googleapis.com
 *   - Vertex AI (fallback): uses aiplatform.googleapis.com with ADC token
 *
 * Env vars:
 *   GEMINI_API_KEY       — Google AI Studio key (preferred, no Vertex AI setup needed)
 *   GEMINI_MODEL         — model name (default: gemini-2.0-flash)
 *   GOOGLE_CLOUD_PROJECT — required for Vertex AI fallback
 *   GEMINI_LOCATION      — Vertex AI region (default: us-central1)
 */

const { getAccessToken } = require('./auth');

const MODEL   = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const API_KEY = process.env.GEMINI_API_KEY;
const TIMEOUT = 60_000;

// 429 retry: up to 4 attempts with exponential backoff (5s, 15s, 45s)
const MAX_RETRIES  = 4;
const RETRY_BASE_S = 5;

function _endpoint() {
  if (API_KEY) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  }
  const project  = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GEMINI_LOCATION || 'us-central1';
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${MODEL}:generateContent`;
}

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Send a prompt expecting a JSON response.
 * Retries automatically on 429 (rate limit) with exponential backoff.
 * Returns the parsed JS value (object, array, etc.).
 */
async function generateJson(prompt, maxOutputTokens = 2048) {
  const useApiKey = Boolean(API_KEY);
  if (!useApiKey && !process.env.GOOGLE_CLOUD_PROJECT) {
    throw new Error('Set GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT');
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const headers = { 'Content-Type': 'application/json' };
    if (!useApiKey) {
      const token = await getAccessToken();
      headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timerId    = setTimeout(() => controller.abort(), TIMEOUT);

    let res;
    try {
      res = await fetch(_endpoint(), {
        method: 'POST',
        headers,
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

    if (res.status === 429) {
      const waitS = RETRY_BASE_S * Math.pow(3, attempt - 1); // 5s, 15s, 45s, 135s
      process.stderr.write(`\n[gemini] 429 rate limit — attendo ${waitS}s (tentativo ${attempt}/${MAX_RETRIES})...\n`);
      await _sleep(waitS * 1000);
      continue;
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Gemini API HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned empty content');

    return JSON.parse(text);
  }

  throw new Error(`Gemini API: quota superata dopo ${MAX_RETRIES} tentativi. Riprova tra qualche minuto.`);
}

module.exports = { generateJson };
