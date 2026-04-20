'use strict';

/**
 * Dossier transformers.
 *
 * Two source modes:
 *   listDocuments  — full enumeration via GET dataStores/.../documents
 *                    (requires DATA_STORE_ID; reliable, paginated, exhaustive)
 *   searchFallback — partial list via POST :search DOCUMENTS mode
 *                    (no DATA_STORE_ID needed; returns only top-N results)
 *
 * Output shapes are identical so the frontend treats both the same way,
 * differentiated only by the top-level `mode` and optional `warning` fields.
 */

// ── Private helpers ───────────────────────────────────────────────────────────

function _extractId(resourceName) {
  if (!resourceName) return null;
  const parts = resourceName.split('/');
  return parts[parts.length - 1] || null;
}

/**
 * Derive a human-readable title from a document ID / GCS filename when no
 * title is stored in structData (e.g. legacy unstructured documents).
 */
function _inferTitleFromId(id) {
  if (!id) return null;
  return id
    .replace(/\.(pdf|PDF|docx?|xlsx?|txt|html?)$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim() || null;
}

/**
 * Extract structured metadata from a structData object.
 * Returns both the values (null if absent) and a boolean map indicating
 * which fields are actually populated — so the frontend can distinguish
 * "field is null" from "field was not returned at all".
 *
 * @param {object} structData
 * @returns {{ fields: object, available: object }}
 */
function _extractStructMetadata(structData) {
  const sd = structData || {};
  const fields = {
    documentType: sd.document_type ?? null,
    institution:  sd.institution   ?? null,
    year:         sd.year != null ? Number(sd.year) : null,
    legislature:  sd.legislature   ?? null,
    topic:        sd.topic         ?? null,
  };
  const available = Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, v !== null]),
  );
  return { fields, available };
}

// ── Public transformers ───────────────────────────────────────────────────────

/**
 * Normalize one document from a listDocuments response.
 *
 * @param {object} doc  Raw document object from DE REST API
 */
function normalizeListDocument(doc) {
  const structData = doc.structData || {};
  const { fields: metadata, available: metadataAvailable } = _extractStructMetadata(structData);

  const id    = doc.id || _extractId(doc.name);
  const title = structData.title || _inferTitleFromId(id);

  return {
    id,
    title,
    uri:               doc.content?.uri      || structData.uri  || null,
    mimeType:          doc.content?.mimeType || null,
    metadata,
    metadataAvailable,
    // listDocuments does not include text snippets
    snippet:           null,
    // Chunks are available when DATA_STORE_ID is set (which is required to reach listDocuments)
    hasChunks:         true,
    source:            'listDocuments',
  };
}

/**
 * Normalize one result from a search DOCUMENTS response.
 *
 * @param {object} result  Raw search result item from DE REST API
 */
function normalizeSearchDocument(result) {
  const doc        = result.document        || {};
  const structData = doc.structData         || {};
  const derived    = doc.derivedStructData  || {};
  const snippets   = derived.snippets       || [];
  const extracts   = derived.extractive_answers || [];

  const { fields: metadata, available: metadataAvailable } = _extractStructMetadata(structData);

  const id    = doc.id || result.id;
  const title = structData.title || derived.title || _inferTitleFromId(id);

  return {
    id,
    title,
    uri:               structData.uri || derived.link || null,
    mimeType:          null,
    metadata,
    metadataAvailable,
    snippet:           snippets[0]?.snippet || extracts[0]?.content || null,
    // DATA_STORE_ID is not set in fallback mode, so chunk lookup is unavailable
    hasChunks:         false,
    source:            'searchFallback',
  };
}

/**
 * Normalize a full dossier page (list of documents + pagination).
 *
 * @param {object} raw   Raw response from DE (listDocuments or search)
 * @param {string} mode  'listDocuments' | 'searchFallback'
 */
function normalizeDossier(raw, mode) {
  const documents = mode === 'listDocuments'
    ? (raw.documents || []).map(normalizeListDocument)
    : (raw.results   || []).map(normalizeSearchDocument);

  return {
    documents,
    pagination: {
      nextPageToken: raw.nextPageToken || null,
      hasMore:       !!raw.nextPageToken,
      total:         typeof raw.totalSize === 'number' ? raw.totalSize : null,
    },
    mode,
  };
}

module.exports = { normalizeDossier, normalizeListDocument, normalizeSearchDocument };
