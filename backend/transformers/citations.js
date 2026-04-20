'use strict';

/**
 * Build a normalised citations array from a raw Discovery Engine answer response.
 *
 * Moved server-side so the frontend receives a stable shape regardless of
 * Discovery Engine API version changes.
 *
 * Output shape per citation:
 * {
 *   id:               number,         1-indexed
 *   startIndex:       number | null,  character offset in answerText
 *   endIndex:         number | null,
 *   referenceIndices: number[],       indices into the evidence[] array
 *   sources: [{
 *     title, uri, snippet, pageIdentifier, documentId
 *   }]
 * }
 */
function buildCitations(answerObj) {
  if (!Array.isArray(answerObj.citations) || !Array.isArray(answerObj.references)) {
    return [];
  }

  return answerObj.citations.map((citation, idx) => {
    const rawSources = citation.sources || [];

    // Collect the reference indices this citation maps to (for linking to evidence[])
    const referenceIndices = rawSources
      .map(src => parseInt(src.referenceIndex, 10))
      .filter(n => !Number.isNaN(n));

    const sources = rawSources
      .map(src => {
        const refIdx = parseInt(src.referenceIndex, 10);
        const ref    = answerObj.references[refIdx];
        if (!ref) return null;

        // Discovery Engine returns two possible reference shapes depending on
        // how the datastore is configured (unstructured vs. chunk-based)
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
          // documentId enables GET /api/evidence/documents/:id/chunks drill-down.
          // Decode to plain string; Discovery Engine often stores IDs with %20 etc.
          documentId: _safeDecodeId(docMeta.id) || _uriToDocId(uri),
        };
      })
      .filter(Boolean);

    return {
      id:               idx + 1,
      startIndex:       citation.startIndex != null ? Number(citation.startIndex) : null,
      endIndex:         citation.endIndex   != null ? Number(citation.endIndex)   : null,
      referenceIndices,
      sources,
    };
  });
}

function _safeDecodeId(id) {
  if (!id) return null;
  try { return decodeURIComponent(id); } catch { return id; }
}

function _uriToDocId(uri) {
  if (!uri) return null;
  try {
    const segments = new URL(uri).pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] || null;
    return last ? _safeDecodeId(last) : null;
  } catch {
    return null;
  }
}

module.exports = { buildCitations, _uriToDocId, _safeDecodeId };
