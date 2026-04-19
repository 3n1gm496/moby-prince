'use strict';

const { buildCitations } = require('./citations');

/**
 * Normalise a raw Discovery Engine :answer response into the stable API contract
 * exposed to frontend clients.
 *
 * Frontend shape (v1 of our internal API):
 * {
 *   answer: {
 *     text: string,
 *     citations: Citation[],
 *     relatedQuestions: string[],
 *     steps: object[],
 *   },
 *   session: { id: string|null, name: string|null },
 *   meta: { searchResultsCount: number, uniqueDocumentsCount: number, searchMode: string }
 * }
 */
function normalizeAnswer(raw) {
  const answerObj = raw.answer  || {};
  const sessionObj = raw.session || {};

  // Extract the short session ID from the full resource name
  const sessionName = sessionObj.name || null;
  const sessionId   = sessionName && sessionName.includes('/sessions/')
    ? sessionName.split('/sessions/')[1]
    : null;

  const citations     = buildCitations(answerObj);
  const uniqueDocCount = _countUniqueDocuments(citations);

  return {
    answer: {
      text:             answerObj.answerText || '',
      citations,
      relatedQuestions: Array.isArray(answerObj.relatedQuestions) ? answerObj.relatedQuestions : [],
      steps:            Array.isArray(answerObj.steps)            ? answerObj.steps            : [],
    },
    session: {
      id:   sessionId,
      name: sessionName,
    },
    meta: {
      searchResultsCount:  Array.isArray(answerObj.references) ? answerObj.references.length : 0,
      uniqueDocumentsCount: uniqueDocCount,
      searchMode: 'CHUNKS',
    },
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

module.exports = { normalizeAnswer };
