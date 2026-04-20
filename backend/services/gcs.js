'use strict';

/**
 * Google Cloud Storage REST client.
 *
 * Uses the same google-auth-library token as Discovery Engine so no additional
 * credentials are needed.  Requires GCS_BUCKET to be set in the environment.
 */

const config           = require('../config');
const { getAccessToken } = require('./auth');
const { createLogger } = require('../logger');

const log = createLogger('gcs');

const GCS_API = 'https://storage.googleapis.com/storage/v1';
const GCS_UPLOAD = 'https://storage.googleapis.com/upload/storage/v1';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function _headers() {
  const token = await getAccessToken();
  return { Authorization: `Bearer ${token}` };
}

async function _checkBucket() {
  if (!config.gcsBucket) {
    const err = new Error('GCS_BUCKET is not configured.');
    err.statusCode = 501;
    throw err;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List objects and virtual folders at a given prefix.
 * Uses delimiter='/' to emulate directory listing.
 *
 * @returns {{ folders: string[], items: object[], nextPageToken: string|null }}
 */
async function listObjects(prefix = '', pageToken = null, pageSize = 200) {
  await _checkBucket();

  const params = new URLSearchParams({
    prefix,
    delimiter: '/',
    maxResults: String(Math.min(pageSize, 1000)),
    projection: 'noAcl',
    fields: 'nextPageToken,prefixes,items(name,size,contentType,updated,timeCreated)',
  });
  if (pageToken) params.set('pageToken', pageToken);

  const url = `${GCS_API}/b/${config.gcsBucket}/o?${params}`;
  const res = await fetch(url, { headers: await _headers() });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    log.error({ status: res.status, detail: text.slice(0, 300) }, 'GCS listObjects failed');
    const err = new Error(`GCS list failed: ${res.status}`);
    err.statusCode = res.status;
    throw err;
  }

  return res.json();
}

/**
 * Upload a file buffer to GCS using the simple upload API.
 *
 * @param {string} name          Full GCS object name (path within bucket)
 * @param {string} contentType   MIME type
 * @param {Buffer} buffer        File content
 */
async function uploadObject(name, contentType, buffer) {
  await _checkBucket();

  const params = new URLSearchParams({
    uploadType: 'media',
    name,
  });
  const url = `${GCS_UPLOAD}/b/${config.gcsBucket}/o?${params}`;

  const headers = await _headers();
  headers['Content-Type'] = contentType || 'application/octet-stream';
  headers['Content-Length'] = String(buffer.length);

  const res = await fetch(url, { method: 'POST', headers, body: buffer });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    log.error({ status: res.status, detail: text.slice(0, 300) }, 'GCS upload failed');
    const err = new Error(`GCS upload failed: ${res.status}`);
    err.statusCode = res.status;
    throw err;
  }

  return res.json();
}

/**
 * Proxy-fetch a GCS object (returns the raw fetch Response for streaming/buffering).
 *
 * @param {string} name  Full GCS object name
 */
async function getObject(name) {
  await _checkBucket();

  const params = new URLSearchParams({ alt: 'media' });
  const url = `${GCS_API}/b/${config.gcsBucket}/o/${encodeURIComponent(name)}?${params}`;
  const res = await fetch(url, { headers: await _headers() });

  if (!res.ok) {
    const err = new Error(`GCS get failed: ${res.status}`);
    err.statusCode = res.status;
    throw err;
  }

  return res;
}

module.exports = { listObjects, uploadObject, getObject };
