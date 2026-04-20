'use strict';

const { activeFilters } = require('../lib/utils');

/**
 * Normalise a raw Discovery Engine :search response.
 *
 * Handles both CHUNKS mode (result.chunk present) and DOCUMENTS mode
 * (result.document present) transparently.
 *
 * Output shape:
 * {
 *   results: SearchResult[],
 *   meta: { query, totalResults, searchMode, appliedFilters }
 * }
 *
 * SearchResult (chunk):
 * { id, rank, type:'chunk', document: { id, title, uri }, chunk: { id, content, pageIdentifier, relevanceScore } }
 *
 * SearchResult (document):
 * { id, rank, type:'document', document: { id, title, uri }, snippet: string|null }
 *
 * @param {object}      raw
 * @param {string}      query
 * @param {object|null} appliedFilters  Original filters object from the request
 */
function normalizeSearch(raw, query, appliedFilters = null) {
  const rawResults = Array.isArray(raw.results) ? raw.results : [];

  const results = rawResults.map((result, idx) => {
    if (result.chunk) {
      return _normalizeChunkResult(result, idx);
    }
    return _normalizeDocumentResult(result, idx);
  });

  const searchMode = results.some(r => r.type === 'chunk') ? 'CHUNKS' : 'DOCUMENTS';

  return {
    results,
    meta: {
      query,
      totalResults:   typeof raw.totalSize === 'number' ? raw.totalSize : results.length,
      searchMode,
      appliedFilters: activeFilters(appliedFilters),
    },
  };
}

function _normalizeChunkResult(result, idx) {
  const chunk   = result.chunk || {};
  const docMeta = chunk.documentMetadata || {};

  return {
    id:   result.id || `chunk-${idx}`,
    rank: idx + 1,
    type: 'chunk',
    document: {
      id:    docMeta.id    || null,
      title: docMeta.title || null,
      uri:   docMeta.uri   || null,
    },
    chunk: {
      id:             chunk.id || null,
      content:        chunk.content || '',
      pageIdentifier: chunk.pageSpan?.pageStart?.toString() || null,
      relevanceScore: result.relevanceScore ?? null,
    },
  };
}

function _normalizeDocumentResult(result, idx) {
  const doc        = result.document        || {};
  const structData = doc.structData         || {};
  const derived    = doc.derivedStructData  || {};
  const snippets   = derived.snippets       || [];
  const extracts   = derived.extractive_answers || [];

  return {
    id:   result.id || doc.id || `doc-${idx}`,
    rank: idx + 1,
    type: 'document',
    document: {
      id:    doc.id                         || null,
      title: structData.title || derived.title || null,
      uri:   structData.uri   || derived.link  || null,
    },
    snippet: snippets[0]?.snippet || extracts[0]?.content || null,
  };
}

module.exports = { normalizeSearch };
