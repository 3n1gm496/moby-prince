# Retrieval Strategy — Moby Prince Evidence Platform

## Overview

The platform exposes two distinct retrieval modes and one hybrid mode (planned). Understanding the trade-offs drives which endpoint callers should use and what future infrastructure changes will unlock.

---

## 1. Search vs Answer

### `POST /api/search` — Pure retrieval

Calls the Vertex AI Search `:search` API. Returns ranked chunks or documents with relevance scores. No language model is involved; cost is pure indexing + serving, latency is ~200–800 ms.

**Use when:**
- Building the evidence panel: fast, cheap, deterministic
- Debugging: which passages does the system actually retrieve?
- Implementing contradiction analysis: retrieve the same query with different filters and compare
- Export / bulk tooling that doesn't need synthesis

**Limitations:**
- Raw text only; no synthesis, no contextualisation
- User must read and interpret passages themselves

### `POST /api/answer` — Grounded generation

Calls the Vertex AI Search `:answer` API (v1alpha). Internally performs a search, passes the top-k chunks to Gemini as context, and returns a grounded natural-language answer with inline citations. Latency is ~8–20 s cold, ~5–12 s warm.

**Use when:**
- User poses a research question that requires synthesis across passages
- Multi-turn investigation session (session continuity via `sessionId`)
- Generating a summarised view of conflicting evidence

**Limitations:**
- Slower and more expensive than pure search
- Hallucination risk exists even with grounding; citations must be verified
- `v1alpha` API: feature surface may change without notice

### `POST /api/evidence/search` — Flat evidence retrieval

Same underlying call as `/api/search` in CHUNKS mode, but returns a flattened `evidence[]` array optimised for the evidence panel UI. This is the feed for the `EvidenceSection` component in each `MessageBubble`.

---

## 2. Evidence-First Approach

The core design principle is that **every answer must be auditable** against the source corpus. This shapes the architecture:

1. **Citations are normalised server-side** (`buildCitations` in `transformers/citations.js`) so the frontend receives a stable shape regardless of Discovery Engine API changes.

2. **Evidence is co-returned with every answer** (`buildEvidence` in `transformers/answer.js`). The `evidence[]` array carries the raw retrieved chunks alongside the synthesised answer so the frontend can show them without a second network request.

3. **Bidirectional citation↔evidence graph**: `citation.referenceIndices[]` maps citations to evidence items; `evidence[].citationIds[]` maps backwards. This enables:
   - Clicking an inline citation badge highlights the matching evidence card
   - Clicking an evidence citation chip opens the CitationPanel

4. **Struct metadata flows through to the UI**: when `item.metadata` is non-null, `EvidenceSection` renders documentary classification badges (document type, institution, year) directly on the evidence card without additional fetches.

---

## 3. Future Hybrid Retrieval Path

The current architecture is single-corpus, single-retrieval-mode. Three extensions are planned:

### 3a. Parallel retrieval + re-ranking

For complex queries, issue two parallel searches:
1. Semantic search (current, via embeddings)
2. Keyword search (`BM25`-style, via Vertex AI Search's full-text mode)

Merge and re-rank with a cross-encoder or Vertex AI Ranking API before passing to the LLM. This reduces the precision gap between rare named-entity queries (where BM25 wins) and conceptual queries (where semantic wins).

Implementation point: add a `retrievalMode: 'HYBRID'` option to `backend/services/discoveryEngine.js`; the transformer layer is unchanged.

### 3b. Cross-session evidence aggregation

Currently each `/api/answer` call is independent. A future `/api/sessions/:id/evidence` endpoint will aggregate all retrieved chunks across a session, deduplicated by `documentId + pageIdentifier`. This feeds a timeline or dossier builder without re-querying.

### 3c. Document AI enrichment loop

When a document is ingested via the GCS → Document AI → Discovery Engine pipeline (Phase 3 of the roadmap), chunks will carry layout-aware page coordinates. These enable:
- Exact page citation (not just page identifier from chunk boundaries)
- Table extraction from structured exhibits
- Figure/chart identification

The `pageIdentifier` field in the evidence schema is already in place; it will be populated more precisely once Document AI layout chunking is active.

---

## 4. Serving Controls (Vertex AI Search)

Serving controls are rules applied at query time by the Discovery Engine serving configuration — before retrieval, after retrieval, or at ranking time. They complement metadata filters by encoding institutional knowledge about document quality and relevance.

The current serving config (`default_serving_config`) has no controls applied. The following controls are planned for Phase 2/3:

### 4a. Boost controls

Boost high-quality documents at query time, without hard-filtering them out.

```json
{
  "boostAction": {
    "boost": 0.4,
    "filter": "struct.ocr_quality: \"high\""
  }
}
```

Effect: OCR-clean documents float to the top of search results; low-quality OCR documents still appear but rank lower.

Apply via: `ServingConfig.boostControlIds[]` → `BoostControl` resource.

### 4b. Filter controls (automatic server-side filters)

Apply a permanent filter that users cannot override — for example, to exclude documents under classification restriction:

```json
{
  "filterAction": {
    "filter": "NOT struct.classification: \"secret\""
  }
}
```

This is the right place for access control rules that must not be bypassable via the API.

### 4c. Redirect controls

Not directly applicable to an API-first architecture, but useful for known query patterns: if the query matches a known parliamentary question by ID (e.g. "atto 4-00123"), redirect to the specific document rather than doing a semantic search.

### 4d. Synonyms controls

Define domain synonyms so that "Moby Prince" ≡ "nave traghetto", "Agip Abruzzo" ≡ "petroliera", "MRCC" ≡ "centro di coordinamento soccorso":

```json
{
  "synonymsAction": {
    "synonyms": ["Moby Prince", "nave traghetto", "traghetto"]
  }
}
```

### Implementation path for serving controls

1. Create control resources via `v1/projects/.../locations/.../dataStores/.../controls`
2. Associate with the serving config: `PATCH servingConfigs/default_serving_config` with `boostControlIds`, `filterControlIds`, `synonymsControlIds`
3. No application code changes required — controls apply transparently to all `:search` and `:answer` calls

---

## 5. What Changes in the Datastore to Fully Enable Filters

| Change | Impact | Effort |
|--------|--------|--------|
| Apply struct schema with `filterable: true` on all metadata fields | Enables filter expressions | Low — one PATCH API call |
| Re-import documents with `structData` metadata populated | Enables all filter fields in practice | High — requires annotating every document |
| Add `persons_mentioned` field with normalised names | Enables person filter | Medium — requires NER or manual annotation |
| Activate `available: true` in `backend/filters/schema.js` | Connects API to expression builder | Trivial — one line per field |
| Activate `available: true` in `frontend/src/filters/schema.js` | Enables filter UI field | Trivial — one line per field |
| Configure boost controls for `ocr_quality` | Improves result ranking automatically | Low |
| Configure synonyms controls for domain terms | Improves recall on entity queries | Medium |

---

## 6. Performance Benchmarks (current baseline)

| Endpoint | Cold p50 | Warm p50 | Notes |
|----------|----------|----------|-------|
| `POST /api/search` | ~300 ms | ~180 ms | Pure retrieval, no LLM |
| `POST /api/evidence/search` | ~300 ms | ~180 ms | Same underlying call |
| `POST /api/answer` | ~14 s | ~9 s | Includes LLM generation |
| `GET /api/evidence/documents/:id/chunks` | ~250 ms | ~150 ms | Chunk list only |

Timeout budget: frontend 75 s, backend 55 s (with one retry on 5xx). Discovery Engine occasionally returns NDJSON on `:answer`; the backend normalises this transparently.

Stream idle timeout errors (Node.js undici) are a known issue with very long answers. Mitigated by the 55 s `AbortController` timeout with single retry.
