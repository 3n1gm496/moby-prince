'use strict';

/**
 * Build a normalised citations array from a raw Discovery Engine answer response.
 *
 * Moved server-side so the frontend receives a stable, clean shape regardless
 * of Discovery Engine API version changes.
 *
 * Input shape (answer.citations + answer.references from DE API):
 *   citations[].sources[].referenceIndex → references[i]
 *
 * Output shape:
 *   [{ id, startIndex, endIndex, sources: [{ title, uri, snippet, pageIdentifier, documentId }] }]
 */
function buildCitations(answerObj) {
  if (!Array.isArray(answerObj.citations) || !Array.isArray(answerObj.references)) {
    return [];
  }

  return answerObj.citations.map((citation, idx) => {
    const sources = (citation.sources || [])
      .map(src => {
        const refIdx = parseInt(src.referenceIndex, 10);
        const ref    = answerObj.references[refIdx];
        if (!ref) return null;

        // Discovery Engine returns two possible ref shapes depending on store config
        const unstructured = ref.unstructuredDocumentInfo || {};
        const chunkInfo    = ref.chunkInfo || {};
        const docMeta      = chunkInfo.documentMetadata || {};

        const uri = unstructured.uri || docMeta.uri || null;

        return {
          title:
            unstructured.title ||
            docMeta.title ||
            `Documento ${src.referenceIndex}`,
          uri,
          snippet:
            unstructured.chunkContents?.[0]?.content ||
            chunkInfo.content ||
            null,
          pageIdentifier:
            unstructured.chunkContents?.[0]?.pageIdentifier ||
            chunkInfo.pageSpan?.pageStart?.toString() ||
            null,
          // documentId enables future chunk drill-down via GET /api/evidence/documents/:id/chunks
          documentId: docMeta.id || _uriToDocId(uri),
        };
      })
      .filter(Boolean);

    return {
      id:         idx + 1,
      startIndex: citation.startIndex != null ? Number(citation.startIndex) : null,
      endIndex:   citation.endIndex   != null ? Number(citation.endIndex)   : null,
      sources,
    };
  });
}

function _uriToDocId(uri) {
  if (!uri) return null;
  try {
    const segments = new URL(uri).pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] || null;
  } catch {
    return null;
  }
}

module.exports = { buildCitations };
