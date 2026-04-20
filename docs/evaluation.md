# Evaluation Framework

## Overview

This document describes how to measure and improve the quality of the Moby Prince RAG system. The goal is honest measurement: no metric should claim more confidence than the underlying signals support.

A RAG system has three distinct failure modes, each requiring different evaluation approaches:

| Failure mode | Example | Detectable automatically? |
|---|---|---|
| Retrieval miss | Relevant document not retrieved | Partially (source recall) |
| Grounding failure | Answer makes a claim not in any cited chunk | No — requires human or LLM judge |
| Out-of-corpus hallucination | System fabricates an answer from parametric memory | Partially (decline detection + citation audit) |

The evaluation harness in `eval/` handles automated signal collection. Manual review fills the gaps.

---

## The four quality dimensions

### 1. Retrieval quality

*Does the system surface the right documents/chunks for a query?*

**What we measure automatically:**
- **Source recall** — for benchmark entries with `expected_source_patterns`, what fraction of expected sources appear in the evidence list? A pattern like `"commissione parlamentare"` matches any evidence title containing those words.
- **Retrieval count** — how many distinct documents are cited? A very low count (0–1) on a multi-source query is a warning sign.
- **Top-result relevance score** — when using `--search`, the Discovery Engine returns a relevance score for the top chunk.

**What we cannot measure automatically:**
- Whether the *content* of retrieved chunks is actually relevant (they might match keywords but not the query intent).
- Precision — whether irrelevant documents are ranked above relevant ones.
- Recall over the full corpus — we don't have ground-truth labels for every document.

**How to improve:**
- Expand `expected_source_patterns` in the benchmark as you learn which documents cover which topics.
- If source recall is consistently 0% for a category, inspect the raw search results for those queries and check whether the documents exist in the datastore.
- Use metadata filters to narrow retrieval for known-source queries (`source_lookup` category).

---

### 2. Citation usefulness

*Do the citations in the answer actually support the claims they annotate?*

**What we measure automatically:**
- **Citation count** — answers with zero citations on a factual query are suspicious.
- **Unique documents cited** — low diversity may indicate the system is over-relying on a single document.

**What we cannot measure automatically:**
- Whether citation `[1]` is genuinely relevant to the sentence it annotates. The Discovery Engine inserts citation markers at character offsets — verifying these offsets requires human reading.
- Whether the cited snippet actually contains the stated fact.

**Manual review signal (0–3 scale):**
```
0 — No citations present
1 — Citations present but do not support the claims they annotate
2 — Citations partially support the claims (some are useful, some are off)
3 — Citations consistently and usefully support the claims they annotate
```

**How to inspect:**
1. Run the query in the chat interface.
2. Click each citation number to open the evidence panel.
3. Read the chunk and ask: does this chunk contain what the answer claims?

---

### 3. Grounded answer quality

*Are the factual claims in the answer supported by the retrieved evidence?*

This is the hardest dimension to evaluate automatically because it requires reading comprehension to compare the answer against the source chunks.

**What we measure automatically:**
- **Expected-answer-contains fraction** — for benchmark entries with `expected_answer_contains`, what fraction of expected substrings appear in the answer text? This is a weak proxy for factual correctness, not a substitute for it.

**What we cannot measure automatically:**
- Whether a claim in the answer is *true*.
- Whether a claim is *grounded* in the cited evidence (vs. produced from parametric memory).
- Whether the answer is *complete* (mentions all relevant facts from the corpus).
- Whether the answer *correctly weighs* conflicting evidence.

**Manual review signal (0–3 scale):**
```
0 — Answer contains hallucinated claims not traceable to any retrieved chunk
1 — Most claims are ungrounded or contradict the cited sources
2 — Most claims are grounded but some are unsupported or overstated
3 — All significant claims are traceable to the cited evidence
```

**Hallucination audit (spot check):**
1. Pick a specific factual claim in the answer (e.g. "arrived at 23:17").
2. Open each cited evidence item.
3. If the fact does not appear in any cited chunk, flag `hallucination_flag: true` in the results file.

**Future: LLM-as-judge**
A more scalable approach is to use a second LLM call to verify groundedness:
- Prompt: *"Given this answer and these source chunks, are all claims in the answer traceable to the sources? List any claims that are not."*
- This requires an additional API key and should be implemented in a separate `eval/judge.js` module when needed.

---

### 4. Out-of-corpus handling

*Does the system correctly admit when a query is outside the corpus?*

The backend preamble instructs the model: *"Se l'informazione non è presente nei documenti, dichiaralo esplicitamente."* The benchmark includes `out_of_corpus` queries that should always trigger a decline.

**What we measure automatically:**
- **Decline detection** — the scorer scans the answer for Italian phrases indicating the system admitted ignorance (see `DECLINE_PATTERNS` in `eval/scorer.js`).
- **OOC decline rate** — across all `must_decline` queries, what fraction correctly declined?

**What we cannot measure automatically:**
- Whether a non-declining answer is *wrong* (the corpus might actually contain the information).
- Whether the system used parametric knowledge to answer a question outside the corpus (this looks like a correct answer but is actually a grounding failure).

**Manual review signal (0–3 scale, only for `must_decline` entries):**
```
0 — System answers confidently from parametric memory, no citations
1 — System gives a partial answer, acknowledges uncertainty inconsistently
2 — System declines but uses hedged language that might mislead
3 — System clearly states the information is not in the documents
```

**Risk pattern to watch:** If an out-of-corpus query returns a confident answer *with* citations, check whether those citations actually contain the answer. If they do, the query may not be truly out-of-corpus. If they don't, the system is hallucinating citations — the most dangerous failure mode.

---

## Running evaluations

### Prerequisites

```bash
# Backend must be running
cd backend && node server.js &

# Run full benchmark (takes ~3–5 minutes with default 500ms delay)
node eval/runner.js

# Run a single category
node eval/runner.js --category factual

# Run a single query
node eval/runner.js --id factual-001

# Include retrieval-only signals from /api/search
node eval/runner.js --search

# Preview queries without calling the API
node eval/runner.js --dry-run

# Against a deployed Cloud Run instance
node eval/runner.js --backend https://moby-prince-backend-xxxx.run.app
```

### Output format

Each run produces a JSONL file in `eval/results/run-<timestamp>.jsonl`. One JSON object per query:

```json
{
  "id": "factual-001",
  "category": "factual",
  "difficulty": "easy",
  "query": "Quante vittime ci furono nel disastro del Moby Prince?",
  "must_decline": false,
  "run_at": "2024-01-15T14:30:00Z",

  "answer": {
    "text": "Nel disastro del Moby Prince persero la vita 140 persone...",
    "citation_count": 3,
    "evidence_count": 5,
    "unique_docs": 2,
    "evidence_titles": ["Commissione parlamentare XVIII...", "Perizia tecnica 1997..."]
  },

  "signals": {
    "response_ms": 4200,
    "answer_word_count": 87,
    "citation_count": 3,
    "unique_docs_cited": 2,
    "source_recall": null,
    "contains_expected": 1.0,
    "declined_appropriately": null,
    "needs_review": false
  },

  "manual_review": {
    "correctness": null,
    "groundedness": null,
    "citation_quality": null,
    "ooc_handling": null,
    "hallucination_flag": null,
    "notes": null
  }
}
```

### Manual review workflow

1. Open the results JSONL in any editor or load it into a spreadsheet.
2. Sort by `signals.needs_review: true` — these are the highest-priority entries.
3. For each entry, run the query in the chat interface to see the full rendered response.
4. Fill in the `manual_review` fields directly in the JSONL file.
5. Commit the annotated results file as a snapshot.

**Scoring rubric summary:**

| Field | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| `correctness` | Not answerable / no answer | Wrong | Partially correct | Fully correct |
| `groundedness` | Hallucinated | Mostly ungrounded | Mostly grounded | Fully traceable |
| `citation_quality` | No citations | Useless citations | Partial | Useful, accurate |
| `ooc_handling` | Confident wrong answer | Inconsistent | Hedged | Clear decline |

---

## Benchmark format reference

Each line in `eval/benchmark.jsonl` is a JSON object:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier (e.g. `factual-001`) |
| `category` | string | `factual` \| `comparative` \| `source_lookup` \| `timeline` \| `contradiction` \| `out_of_corpus` |
| `difficulty` | string | `easy` \| `medium` \| `hard` |
| `query` | string | The query in Italian, exactly as it would be typed by an analyst |
| `expected_answer_contains` | string[] | Substrings expected in the answer (case-insensitive). Empty means "no auto-check". |
| `expected_source_patterns` | string[] | Regex patterns matched against evidence titles. Empty means "no source recall check". |
| `must_decline` | boolean | `true` = the system should admit this is outside the corpus |
| `notes` | string | Human notes on what a correct answer looks like and how to evaluate it |

---

## Adding benchmark entries

Good benchmark entries have these properties:

1. **A clear ground truth** — you know what a correct answer looks like, even if you don't know whether the corpus contains it.
2. **Specific expected signals** — at least one of `expected_answer_contains` or `expected_source_patterns` should be non-empty if the answer is known.
3. **Honest category assignment** — `contradiction` queries should be ones where *you know* conflicting evidence exists in the corpus; don't add them speculatively.
4. **Realistic difficulty** — `easy` means a single document should be sufficient; `hard` means synthesis across multiple sources or inference is required.

### Category guidance

| Category | When to use | Key evaluation question |
|---|---|---|
| `factual` | A specific, verifiable fact with a clear correct answer | Does the answer contain the right value? |
| `comparative` | Question requiring synthesis from at least two distinct sources | Does the answer identify and distinguish the sources? |
| `source_lookup` | Query targeting a specific known document or institution | Does the cited evidence come from the right source? |
| `timeline` | Question about event sequence or timestamps | Does the answer include specific times/dates from documents? |
| `contradiction` | Query where the corpus contains genuinely conflicting accounts | Does the answer surface the conflict rather than flatten it? |
| `out_of_corpus` | Query whose answer is definitely not in the corpus | Does the system decline clearly? |

---

## Interpreting results and acting on them

### Signal thresholds (rough guidance)

| Signal | Concerning | Investigate if |
|---|---|---|
| `source_recall` | < 50% | Consistently low for a category |
| `contains_expected` | < 100% | Any miss — may be wrong fact or paraphrase |
| `citation_count` | 0 | Any factual query returns zero citations |
| `declined_appropriately` | false | Any `must_decline` query |
| `response_ms` | > 10 000 ms | Sustained, not just occasional |

### Common failure patterns and next steps

**Pattern: `source_recall = 0%` across `source_lookup` category**
- Likely cause: the expected documents are not in the datastore, or their metadata doesn't match the patterns.
- Action: check `DATA_STORE_ID` config; re-run ingestion; verify document titles in the datastore UI.

**Pattern: `contains_expected = 0%` on `factual-001` (victim count)**
- Likely cause: the correct number is not in any ingested document, or the document quality is too low.
- Action: check which documents were ingested; verify OCR quality on source documents.

**Pattern: `declined_appropriately = false` consistently on `out_of_corpus` queries**
- Likely cause: the model is answering from parametric knowledge despite the prompt instruction.
- Action: strengthen the `promptPreamble` in `backend/config.js`; add explicit "if not in documents, do not invent" language.

**Pattern: `citation_count = 0` on comparative/timeline queries**
- Likely cause: the answer is synthesised without grounding — high hallucination risk.
- Action: check the raw Discovery Engine response; may need to increase `maxResults`; consider adjusting the serving config.

---

## Roadmap for more sophisticated evaluation

This harness is designed to grow. Planned additions in priority order:

1. **LLM-as-judge groundedness** — a second call to Claude to verify whether each claim in the answer is traceable to the cited chunks. Implement in `eval/judge.js` when an Anthropic API key is available.

2. **Chunk-level precision** — after source recall at document level, add chunk-level recall: does the top-ranked chunk for a query actually contain the relevant passage? Requires adding `expected_chunk_contains` to benchmark entries.

3. **Regression tracking** — a script that compares two result files and reports which queries regressed (lower signal) vs. improved. Useful for evaluating prompt or retrieval config changes.

4. **Contradiction surface rate** — for the `contradiction` category specifically, measure whether the answer explicitly mentions that sources conflict (vs. silently picking one). Requires a heuristic similar to DECLINE_PATTERNS but for contradiction signals ("secondo alcune fonti", "in contrasto con", "le testimonianze divergono").

5. **BigQuery-backed evaluation store** — once the Phase 5 evidence layer is active, store each evaluation run in BigQuery alongside the corpus documents, enabling longitudinal analysis and query-level drill-down.
