'use strict';

/**
 * Cloud Translation API v3 REST client.
 *
 * Used by the investigation agent to translate non-Italian document excerpts
 * into Italian before analysis.
 *
 * Required env vars:
 *   GOOGLE_CLOUD_PROJECT
 */

const config             = require('../config');
const { getAccessToken } = require('./auth');
const { createLogger }   = require('../logger');

const log = createLogger('translation');

const BASE = 'https://translation.googleapis.com/v3';

/**
 * Translate one or more texts to the target language.
 * Source language is auto-detected when not provided.
 *
 * @param {string|string[]} texts
 * @param {string}          [targetLanguage='it']
 * @returns {Promise<{ translatedText: string, detectedLanguage: string }[]>}
 */
async function translate(texts, targetLanguage = 'it') {
  const contents = Array.isArray(texts) ? texts : [texts];
  if (contents.length === 0) return [];

  const token = await getAccessToken();
  const url   = `${BASE}/projects/${config.projectId}:translateText`;

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents,
      targetLanguageCode: targetLanguage,
      mimeType:           'text/plain',
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    log.error({ status: res.status, detail: errText.slice(0, 200) }, 'Translation API error');
    throw new Error(`Translation API HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.translations || []).map(t => ({
    translatedText:    t.translatedText || '',
    detectedLanguage:  t.detectedLanguageCode || null,
  }));
}

/**
 * Translate a single string, returning just the translated text.
 * Throws on API error; caller decides whether to treat as soft failure.
 *
 * @param {string} text
 * @param {string} [targetLanguage='it']
 * @returns {Promise<string>}
 */
async function translateOne(text, targetLanguage = 'it') {
  const results = await translate([text], targetLanguage);
  return results[0]?.translatedText || text;
}

module.exports = { translate, translateOne };
