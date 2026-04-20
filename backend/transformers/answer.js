'use strict';

const { buildCitations, _uriToDocId } = require('./citations');
const { activeFilters } = require('../lib/utils');

/**
 * Normalise a raw Discovery Engine :answer response into the stable API contract
 * exposed to frontend clients.
 *
 * Frontend shape (v1 of our internal API):
 * {
 *   answer: {
 *     text: string,
 *     citations: Citation[],
 *     evidence: Evidence[],
 *     relatedQuestions: string[],
 *     steps: object[],
 *   },
 *   session: { id: string|null, name: string|null },
 *   meta: {
 *     searchResultsCount: number,
 *     uniqueDocumentsCount: number,
 *     searchMode: string,
 *     appliedFilters: object|null,   // non-null values from the request filters object
 *   }
 * }
 *
 * @param {object} raw            Raw Discovery Engine response
 * @param {object|null} appliedFilters  Original filters object from the request body
 */
function normalizeAnswer(raw, appliedFilters = null) {
  const answerObj  = raw.answer  || {};
  const sessionObj = raw.session || {};

  const sessionName = sessionObj.name || null;
  const sessionId   = sessionName && sessionName.includes('/sessions/')
    ? sessionName.split('/sessions/')[1]
    : null;

  const citations      = buildCitations(answerObj);
  const evidence       = buildEvidence(answerObj, citations);
  const uniqueDocCount = _countUniqueDocuments(citations);

  return {
    answer: {
      text:             answerObj.answerText || '',
      citations,
      evidence,
      relatedQuestions: Array.isArray(answerObj.relatedQuestions) ? answerObj.relatedQuestions : [],
      steps:            Array.isArray(answerObj.steps)            ? answerObj.steps            : [],
    },
    session: {
      id:   sessionId,
      name: sessionName,
    },
    meta: {
      searchResultsCount:   Array.isArray(answerObj.references) ? answerObj.references.length : 0,
      uniqueDocumentsCount: uniqueDocCount,
      searchMode:           'CHUNKS',
      appliedFilters:       activeFilters(appliedFilters),
    },
  };
}

/**
 * Build an evidence array from references[], enriched with which citation IDs
 * point back to each reference (reverse map for bidirectional linking).
 *
 * Output shape per item:
 * {
 *   index:          number,         0-based, matches referenceIndex in citations
 *   title:          string,
 *   uri:            string | null,
 *   snippet:        string | null,
 *   pageIdentifier: string | null,
 *   documentId:     string | null,
 *   citationIds:    number[],       1-based citation IDs that reference this evidence
 * }
 */
function buildEvidence(answerObj, citations) {
  if (!Array.isArray(answerObj.references)) return [];

  // Build reverse map: referenceIndex → citationIds[]
  const refToCitations = new Map();
  for (const cit of citations) {
    for (const refIdx of (cit.referenceIndices || [])) {
      if (!refToCitations.has(refIdx)) refToCitations.set(refIdx, []);
      refToCitations.get(refIdx).push(cit.id);
    }
  }

  return answerObj.references.map((ref, index) => {
    const unstructured = ref.unstructuredDocumentInfo || {};
    const chunkInfo    = ref.chunkInfo || {};
    const docMeta      = chunkInfo.documentMetadata || {};

    const uri = unstructured.uri || docMeta.uri || null;

    return {
      index,
      title:
        unstructured.title ||
        docMeta.title      ||
        `Documento ${index}`,
      uri,
      snippet:
        unstructured.chunkContents?.[0]?.content ||
        chunkInfo.content ||
        null,
      pageIdentifier:
        unstructured.chunkContents?.[0]?.pageIdentifier ||
        chunkInfo.pageSpan?.pageStart?.toString()       ||
        null,
      documentId: docMeta.id || _uriToDocId(uri),
      citationIds: refToCitations.get(index) || [],
      // Struct metadata — populated once the datastore schema includes these fields
      metadata: _extractStructMetadata(ref),
    };
  });
}

/**
 * Extract document-level struct metadata from a reference object.
 * Returns null when no struct data is present (current corpus state).
 * Fields mirror the filter schema keys for direct frontend consumption.
 */
function _extractStructMetadata(ref) {
  const structData =
    ref.structData ||
    ref.unstructuredDocumentInfo?.structData ||
    ref.chunkInfo?.documentMetadata?.structData ||
    {};

  if (Object.keys(structData).length === 0) return null;

  return {
    documentType: structData.document_type || null,
    institution:  structData.institution   || null,
    year:         structData.year          != null ? Number(structData.year) : null,
    legislature:  structData.legislature   || null,
    topic:        structData.topic         || null,
    ocrQuality:   structData.ocr_quality   || null,
  };
}

function _countUniqueDocuments(citations) {
  const seen = new Set();
  citations.forEach(c =>
    c.sources.forEach(s => {
      const key = s.documentId || s.uri;
      if (key) seen.add(key);
    })
  );
  return seen.size;
}

module.exports = { normalizeAnswer, buildEvidence };
