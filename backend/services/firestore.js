'use strict';

/**
 * Firestore REST client for session persistence.
 *
 * Uses the v1 HTTP API; converts between plain JS objects and the Firestore
 * typed-value wire format automatically.
 *
 * Methods:
 *   createDocument(collection, id?, data)   — create (id = server-generated if omitted)
 *   getDocument(collection, id)             — get; returns null if 404
 *   patchDocument(collection, id, delta)    — merge-update (PATCH semantics)
 *   deleteDocument(collection, id)          — delete
 *   listDocuments(collection, pageSize?, pageToken?)
 */

const config             = require('../config');
const { getAccessToken } = require('./auth');
const { createLogger }   = require('../logger');

const log = createLogger('firestore');

// ── Base URL builder ──────────────────────────────────────────────────────────

function _base() {
  const db = config.firestoreDb || '(default)';
  return `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${encodeURIComponent(db)}/documents`;
}

function _docPath(collection, id) {
  return `${_base()}/${collection}/${id}`;
}

// ── Value converters: JS ↔ Firestore typed-value format ───────────────────────

function _toFirestoreValue(v) {
  if (v === null || v === undefined)     return { nullValue: 'NULL_VALUE' };
  if (typeof v === 'boolean')            return { booleanValue: v };
  if (typeof v === 'string')             return { stringValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (v instanceof Date)                 return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(_toFirestoreValue) } };
  }
  if (typeof v === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(v).map(([k, val]) => [k, _toFirestoreValue(val)]),
        ),
      },
    };
  }
  return { stringValue: String(v) };
}

function _fromFirestoreValue(val) {
  if (!val || typeof val !== 'object') return null;
  if ('nullValue'      in val) return null;
  if ('booleanValue'   in val) return val.booleanValue;
  if ('stringValue'    in val) return val.stringValue;
  if ('integerValue'   in val) return Number(val.integerValue);
  if ('doubleValue'    in val) return val.doubleValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('bytesValue'     in val) return val.bytesValue;
  if ('arrayValue'     in val) {
    return (val.arrayValue.values || []).map(_fromFirestoreValue);
  }
  if ('mapValue' in val) {
    return _fieldsToObject(val.mapValue.fields || {});
  }
  return null;
}

function _fieldsToObject(fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, _fromFirestoreValue(v)]),
  );
}

function _objectToFields(obj) {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, _toFirestoreValue(v)]),
  );
}

function _docToObject(firestoreDoc) {
  if (!firestoreDoc) return null;
  const id     = (firestoreDoc.name || '').split('/').pop();
  const fields = _fieldsToObject(firestoreDoc.fields || {});
  return { id, ...fields };
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function _req(method, url, body) {
  const token = await getAccessToken();
  const opts  = {
    method,
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);

  if (res.status === 404) return null;

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    log.error({ method, status: res.status, detail: errText.slice(0, 300) }, 'Firestore request failed');
    throw new Error(`Firestore ${method} failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') return null;
  return res.json().catch(() => null);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a document.  When id is provided it is used as the document ID;
 * otherwise Firestore generates one.
 */
async function createDocument(collection, id, data) {
  const fields = _objectToFields(data);
  const body   = { fields };

  let url = `${_base()}/${collection}`;
  if (id) url += `?documentId=${encodeURIComponent(id)}`;

  const doc = await _req('POST', url, body);
  return doc ? _docToObject(doc) : null;
}

/**
 * Get a single document.  Returns null if not found.
 */
async function getDocument(collection, id) {
  const doc = await _req('GET', _docPath(collection, id));
  return doc ? _docToObject(doc) : null;
}

/**
 * Merge-update a document (PATCH without updateMask = merge into existing fields).
 * Only the provided keys are modified; omitted keys are preserved.
 */
async function patchDocument(collection, id, delta) {
  const fields = _objectToFields(delta);
  const doc    = await _req('PATCH', _docPath(collection, id), { fields });
  return doc ? _docToObject(doc) : null;
}

/**
 * Replace the entire document (PATCH with all fields).
 */
async function setDocument(collection, id, data) {
  const fields = _objectToFields(data);
  const doc    = await _req('PATCH', _docPath(collection, id), { fields });
  return doc ? _docToObject(doc) : null;
}

/**
 * Delete a document.
 */
async function deleteDocument(collection, id) {
  await _req('DELETE', _docPath(collection, id));
}

/**
 * List documents in a collection (shallow — no sub-collections).
 *
 * @returns {{ documents: object[], nextPageToken: string|null }}
 */
async function listDocuments(collection, pageSize = 20, pageToken = null) {
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  if (pageToken) params.set('pageToken', pageToken);

  const url  = `${_base()}/${collection}?${params}`;
  const data = await _req('GET', url);

  if (!data) return { documents: [], nextPageToken: null };

  return {
    documents:     (data.documents || []).map(_docToObject),
    nextPageToken: data.nextPageToken || null,
  };
}

/**
 * Atomically append values to an array field using Firestore FieldTransform.
 *
 * Uses `appendMissingElements` (array-union semantics) — values that are
 * already present are not duplicated.  Each value should include a unique `_mid`
 * so that distinct messages are never suppressed.  The `updatedAt` field is set
 * to server request time in the same atomic commit.
 *
 * Returns null if the document does not exist (caller may treat as 404).
 *
 * @param {string}   collection
 * @param {string}   id
 * @param {string}   fieldPath   e.g. "messages"
 * @param {any[]}    values      Values to append
 */
async function appendToArray(collection, id, fieldPath, values) {
  if (!values || values.length === 0) return getDocument(collection, id);

  const db      = config.firestoreDb || '(default)';
  const docName = `projects/${config.projectId}/databases/${db}/documents/${collection}/${id}`;
  const url     = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${encodeURIComponent(db)}/documents:commit`;

  const token = await getAccessToken();
  const body  = {
    writes: [{
      transform: {
        document: docName,
        fieldTransforms: [
          {
            fieldPath,
            appendMissingElements: { values: values.map(_toFirestoreValue) },
          },
          {
            fieldPath: 'updatedAt',
            setToServerValue: 'REQUEST_TIME',
          },
        ],
      },
    }],
  };

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 404) return null;

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    log.error({ status: res.status, detail: errText.slice(0, 300) }, 'Firestore appendToArray failed');
    throw new Error(`Firestore commit failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  return getDocument(collection, id);
}

module.exports = {
  createDocument,
  getDocument,
  patchDocument,
  setDocument,
  deleteDocument,
  listDocuments,
  appendToArray,
};
