'use strict';

/**
 * Cloud Vision API REST client.
 * Used by backend routes for on-demand image annotation.
 *
 * Required env vars: none beyond standard GCP auth.
 */

const { getAccessToken } = require('./auth');

const VISION_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

/**
 * Annotate an image with label, text, object and landmark detection.
 *
 * @param {Buffer} imageBuffer   Raw image bytes
 * @param {string} mimeType      e.g. 'image/jpeg'
 * @returns {Promise<object>}    Raw Vision API response (responses[0])
 */
async function annotateImage(imageBuffer, mimeType) {
  const token = await getAccessToken();
  const res = await fetch(VISION_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{
        image:    { content: imageBuffer.toString('base64') },
        features: [
          { type: 'LABEL_DETECTION',        maxResults: 20 },
          { type: 'TEXT_DETECTION' },
          { type: 'OBJECT_LOCALIZATION',    maxResults: 10 },
          { type: 'LANDMARK_DETECTION',     maxResults: 5  },
        ],
      }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Vision API HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.responses?.[0] ?? {};
}

/**
 * Parse a Vision API annotation response into normalized fields.
 *
 * @param {object} resp   Vision API responses[0] object
 * @returns {{ labels: string[], landmarks: string[], ocrText: string }}
 */
function parseAnnotations(resp) {
  const labels    = (resp.labelAnnotations          || []).map(a => a.description).filter(Boolean);
  const objects   = (resp.localizedObjectAnnotations|| []).map(a => a.name).filter(Boolean);
  const landmarks = (resp.landmarkAnnotations        || []).map(a => a.description).filter(Boolean);
  const ocrText   = resp.fullTextAnnotation?.text
    || resp.textAnnotations?.[0]?.description
    || '';
  return {
    labels:    [...new Set([...labels, ...objects])],
    landmarks: [...new Set(landmarks)],
    ocrText,
  };
}

module.exports = { annotateImage, parseAnnotations };
