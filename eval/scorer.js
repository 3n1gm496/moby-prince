'use strict';

/**
 * Automated signal extraction for RAG evaluation.
 *
 * These functions only compute what is honestly measurable without an LLM judge:
 *   - Response latency
 *   - Answer word count
 *   - Citation and evidence counts
 *   - Source recall against declared expected_source_patterns (regex)
 *   - Expected-answer-contains fraction (string matching)
 *   - Out-of-corpus decline detection via heuristic Italian phrase patterns
 *
 * Signals that require human review (correctness, groundedness, hallucination
 * detection) are left as null in the output and documented in docs/evaluation.md.
 */

// Italian phrases indicating the system admitted the information is not in the corpus.
// The backend preamble instructs: "Se l'informazione non è presente nei documenti, dichiaralo esplicitamente."
const DECLINE_PATTERNS = [
  /non\s+[eè]\s+pres[ea]nt[ei]\s+nei\s+documenti/i,
  /non\s+[eè]\s+disponibil[ei]/i,
  /non\s+ho\s+informazioni/i,
  /non\s+trovo/i,
  /non\s+[eè]\s+(tra|nei|in)\s+(i\s+)?documenti/i,
  /i\s+documenti\s+disponibili\s+non/i,
  /non\s+risulta/i,
  /non\s+dispongo\s+di/i,
  /al\s+di\s+fuori\s+del(l[ae'])?\s+corpus/i,
  /non\s+(mi\s+[eè]\s+)?possibile\s+rispondere/i,
  /esula\s+dal(l[ae'])?/i,
  /non\s+riguard[ao]\s+il\s+disastro/i,
  /questa\s+informazione\s+non/i,
  /non\s+[eè]\s+contenut[ao]\s+nei/i,
  /non\s+sono\s+presenti\s+nei\s+documenti/i,
  /informazioni?\s+non\s+[eè]\s+present[ei]/i,
];

/**
 * Extract automated signals from a single /api/answer response.
 *
 * @param {object} entry        One benchmark entry from benchmark.jsonl
 * @param {object} apiResponse  Normalised /api/answer response body
 * @param {number} responseMs   Wall-clock latency in milliseconds
 * @returns {object}
 */
function scoreResponse(entry, apiResponse, responseMs) {
  const answerText = apiResponse?.answer?.text     || '';
  const citations  = apiResponse?.answer?.citations || [];
  const evidence   = apiResponse?.answer?.evidence  || [];
  const meta       = apiResponse?.meta              || {};

  const citationCount   = citations.length;
  const answerWordCount = answerText.split(/\s+/).filter(Boolean).length;
  const uniqueDocsCount = meta.uniqueDocumentsCount ?? _countUniqueDocs(evidence);

  // Source recall — fraction of expected_source_patterns found in evidence titles
  let sourceRecall = null;
  const sourcePatterns = entry.expected_source_patterns || [];
  if (sourcePatterns.length > 0) {
    const evidenceTitles = evidence.map(e => (e.title || '').toLowerCase());
    const matched = sourcePatterns.filter(p => {
      const re = new RegExp(p, 'i');
      return evidenceTitles.some(t => re.test(t));
    });
    sourceRecall = matched.length / sourcePatterns.length;
  }

  // Expected-answer-contains — fraction of expected strings present in answer
  let containsExpected = null;
  const expectedStrings = entry.expected_answer_contains || [];
  if (expectedStrings.length > 0) {
    const lower = answerText.toLowerCase();
    const matched = expectedStrings.filter(s => lower.includes(s.toLowerCase()));
    containsExpected = matched.length / expectedStrings.length;
  }

  // Out-of-corpus decline detection
  let declinedAppropriately = null;
  if (entry.must_decline === true) {
    declinedAppropriately = DECLINE_PATTERNS.some(re => re.test(answerText));
  }

  // Flags that help prioritise the manual review queue
  const needsReview = Boolean(
    (entry.must_decline && !declinedAppropriately) ||
    (sourceRecall   !== null && sourceRecall   < 0.5) ||
    (containsExpected !== null && containsExpected < 1.0) ||
    citationCount === 0
  );

  return {
    response_ms:            responseMs,
    answer_word_count:      answerWordCount,
    citation_count:         citationCount,
    unique_docs_cited:      uniqueDocsCount,
    source_recall:          sourceRecall,
    contains_expected:      containsExpected,
    declined_appropriately: declinedAppropriately,
    needs_review:           needsReview,
  };
}

/**
 * Extract automated signals from a single /api/search response.
 * Used when --search flag is passed to runner.js for retrieval-only evaluation.
 *
 * @param {object} entry
 * @param {object} apiResponse  Normalised /api/search response body
 * @param {number} responseMs
 * @returns {object}
 */
function scoreSearchResponse(entry, apiResponse, responseMs) {
  const results = apiResponse?.results || [];

  let sourceRecall = null;
  const sourcePatterns = entry.expected_source_patterns || [];
  if (sourcePatterns.length > 0) {
    const titles = results.map(r => (r.document?.title || '').toLowerCase());
    const matched = sourcePatterns.filter(p => {
      const re = new RegExp(p, 'i');
      return titles.some(t => re.test(t));
    });
    sourceRecall = matched.length / sourcePatterns.length;
  }

  return {
    response_ms:    responseMs,
    results_count:  results.length,
    source_recall:  sourceRecall,
    top_title:      results[0]?.document?.title     ?? null,
    top_relevance:  results[0]?.chunk?.relevanceScore ?? null,
  };
}

/**
 * Print a summary table to stdout after a run completes.
 *
 * @param {object[]} results  Array of result objects written to the output file
 * @param {string}   outFile  Output file path (for display)
 */
function printSummary(results, outFile) {
  const total   = results.length;
  const errored = results.filter(r => r.error).length;
  const ran     = total - errored;

  const withSignals = results.filter(r => r.signals);
  const avgMs = ran > 0
    ? Math.round(withSignals.reduce((a, r) => a + r.signals.response_ms, 0) / (withSignals.length || 1))
    : 0;

  const withSourceRecall = withSignals.filter(r => r.signals.source_recall !== null);
  const avgSourceRecall  = withSourceRecall.length > 0
    ? withSourceRecall.reduce((a, r) => a + r.signals.source_recall, 0) / withSourceRecall.length
    : null;

  const withContains = withSignals.filter(r => r.signals.contains_expected !== null);
  const avgContains  = withContains.length > 0
    ? withContains.reduce((a, r) => a + r.signals.contains_expected, 0) / withContains.length
    : null;

  const oocEntries  = results.filter(r => r.must_decline && r.signals);
  const oocDeclined = oocEntries.filter(r => r.signals.declined_appropriately).length;
  const needsReview = withSignals.filter(r => r.signals.needs_review).length;

  // Per-category breakdown
  const byCat = {};
  for (const r of results) {
    const cat = r.category || 'unknown';
    if (!byCat[cat]) byCat[cat] = { total: 0, errored: 0, review: 0 };
    byCat[cat].total++;
    if (r.error) byCat[cat].errored++;
    if (r.signals?.needs_review) byCat[cat].review++;
  }

  const SEP = '─'.repeat(52);
  console.log(`\n${SEP}`);
  console.log('  Evaluation run summary');
  console.log(SEP);
  console.log(`  Queries:            ${ran}/${total} ran  (${errored} errors)`);
  console.log(`  Avg response time:  ${avgMs} ms`);
  if (avgSourceRecall !== null) {
    console.log(`  Avg source recall:  ${pct(avgSourceRecall)}  (n=${withSourceRecall.length})`);
  }
  if (avgContains !== null) {
    console.log(`  Avg expected-ans:   ${pct(avgContains)}  (n=${withContains.length})`);
  }
  if (oocEntries.length > 0) {
    console.log(`  OOC decline rate:   ${oocDeclined}/${oocEntries.length}  (${pct(oocDeclined / oocEntries.length)})`);
  }
  console.log(`  Flagged for review: ${needsReview}/${ran}`);
  console.log(`\n  By category:`);

  const catOrder = ['factual','comparative','source_lookup','timeline','out_of_corpus','unknown'];
  const sorted   = catOrder.filter(c => byCat[c]).concat(Object.keys(byCat).filter(c => !catOrder.includes(c)));
  for (const cat of sorted) {
    const s = byCat[cat];
    const flag = s.review > 0 ? `  ← ${s.review} review` : '';
    const err  = s.errored > 0 ? ` (${s.errored} err)` : '';
    console.log(`    ${cat.padEnd(20)}  ${String(s.total).padStart(2)} queries${err}${flag}`);
  }

  console.log(`\n  Results: ${outFile}`);
  console.log(SEP + '\n');
}

function pct(v) {
  return `${(v * 100).toFixed(0)}%`;
}

function _countUniqueDocs(evidence) {
  const seen = new Set();
  for (const e of evidence) {
    if (e.documentId) seen.add(e.documentId);
  }
  return seen.size;
}

module.exports = { scoreResponse, scoreSearchResponse, printSummary };
