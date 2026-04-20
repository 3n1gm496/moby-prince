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

/**
 * Delete a GCS object.
 *
 * @param {string} name  Full GCS object name
 */
async function deleteObject(name) {
  await _checkBucket();

  const url = `${GCS_API}/b/${config.gcsBucket}/o/${encodeURIComponent(name)}`;
  const res = await fetch(url, { method: 'DELETE', headers: await _headers() });

  // 204 No Content = success; 404 = already gone (treat as success)
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    const text = await res.text().catch(() => '');
    log.error({ status: res.status, detail: text.slice(0, 300) }, 'GCS delete failed');
    const err = new Error(`GCS delete failed: ${res.status}`);
    err.statusCode = res.status;
    throw err;
  }
}

/**
 * Copy a GCS object within the same bucket.
 * GCS has no native move; move = copy + delete.
 *
 * @param {string} srcName  Source object name
 * @param {string} dstName  Destination object name
 */
async function copyObject(srcName, dstName) {
  await _checkBucket();

  const bucket = config.gcsBucket;
  const url    = `${GCS_API}/b/${bucket}/o/${encodeURIComponent(srcName)}/copyTo/b/${bucket}/o/${encodeURIComponent(dstName)}`;
  const headers = await _headers();
  headers['Content-Length'] = '0';

  const res = await fetch(url, { method: 'POST', headers, body: '' });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    log.error({ status: res.status, detail: text.slice(0, 300) }, 'GCS copy failed');
    const err = new Error(`GCS copy failed: ${res.status}`);
    err.statusCode = res.status;
    throw err;
  }

  return res.json();
}

/**
 * Fetch the full metadata object for a GCS object (includes custom metadata).
 *
 * @param {string} name  Full GCS object name
 */
async function getObjectMetadata(name) {
  await _checkBucket();

  const url = `${GCS_API}/b/${config.gcsBucket}/o/${encodeURIComponent(name)}`;
  const res = await fetch(url, { headers: await _headers() });

  if (!res.ok) {
    const err = new Error(`GCS metadata failed: ${res.status}`);
    err.statusCode = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Patch custom metadata on a GCS object.
 * Merges with existing metadata; pass null values to remove keys.
 *
 * @param {string} name      Full GCS object name
 * @param {object} metadata  Key-value pairs (string values only)
 */
async function updateObjectMetadata(name, metadata) {
  await _checkBucket();

  const url     = `${GCS_API}/b/${config.gcsBucket}/o/${encodeURIComponent(name)}`;
  const headers = await _headers();
  headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method:  'PATCH',
    headers,
    body:    JSON.stringify({ metadata }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    log.error({ status: res.status, detail: text.slice(0, 300) }, 'GCS metadata update failed');
    const err = new Error(`GCS metadata update failed: ${res.status}`);
    err.statusCode = res.status;
    throw err;
  }
  return res.json();
}

module.exports = {
  listObjects, uploadObject, getObject,
  deleteObject, copyObject,
  getObjectMetadata, updateObjectMetadata,
};
