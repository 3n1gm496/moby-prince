# Technical Roadmap — Moby Prince Evidence Platform

## Current state after Phase 1

The backend is now a modular Express application. The frontend chat UI is unchanged and functional.

### API surface

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/api/answer` | Grounded answer + citations | ✅ live |
| POST | `/api/search` | Chunk/document retrieval, no LLM | ✅ live |
| POST | `/api/evidence/search` | Flat evidence list for workbench UI | ✅ live |
| GET  | `/api/evidence/documents/:id/chunks` | All chunks for a document | ✅ live (requires `DATA_STORE_ID`) |
| GET  | `/api/health` | Liveness + GCP auth probe | ✅ live |
| POST | `/api/ask` | Backwards-compat alias → `/api/answer` | ✅ temporary |

### Normalised response shapes

**POST /api/answer**
```json
{
  "answer": {
    "text": "string",
    "citations": [
      {
        "id": 1,
        "startIndex": 0,
        "endIndex": 42,
        "sources": [
          {
            "title": "string",
            "uri": "string | null",
            "snippet": "string | null",
            "pageIdentifier": "string | null",
            "documentId": "string | null"
          }
        ]
      }
    ],
    "relatedQuestions": ["string"],
    "steps": []
  },
  "session": { "id": "string | null", "name": "string | null" },
  "meta": {
    "searchResultsCount": 10,
    "uniqueDocumentsCount": 4,
    "searchMode": "CHUNKS"
  }
}
```

**POST /api/search**
```json
{
  "results": [
    {
      "id": "string",
      "rank": 1,
      "type": "chunk",
      "document": { "id": "string", "title": "string", "uri": "string | null" },
      "chunk": {
        "id": "string",
        "content": "string",
        "pageIdentifier": "string | null",
        "relevanceScore": 0.95
      }
    }
  ],
  "meta": { "query": "string", "totalResults": 10, "searchMode": "CHUNKS" }
}
```

**POST /api/evidence/search**
```json
{
  "evidence": [
    {
      "id": "string",
      "rank": 1,
      "documentId": "string | null",
      "title": "string | null",
      "uri": "string | null",
      "content": "string",
      "pageIdentifier": "string | null",
      "relevanceScore": 0.95
    }
  ],
  "meta": { "query": "string", "totalResults": 10, "searchMode": "CHUNKS" }
}
```

**GET /api/evidence/documents/:id/chunks**
```json
{
  "documentId": "string",
  "chunks": [
    { "id": "string", "content": "string", "pageIdentifier": "string | null" }
  ],
  "meta": { "total": 14 }
}
```

---

## Phase 2 — SDK migration + streaming + filters

**Target:** Replace manual REST fetches with `@google-cloud/discoveryengine` SDK.

### Why
The SDK provides typed proto wrappers, automatic retry with exponential backoff, proper error codes, and simpler testing via mocks. The transformers (`transformers/`) don't change — only the internals of `services/discoveryEngine.js`.

### Tasks
- [ ] `npm install @google-cloud/discoveryengine`
- [ ] Replace `_post(config.answerEndpoint, …)` with `ConversationalSearchServiceClient.answerQuery()`
- [ ] Replace `_post(config.searchEndpoint, …)` with `SearchServiceClient.search()`
- [ ] Replace `_get(…/chunks)` with `ChunkServiceClient.listChunks()` or `DocumentServiceClient`
- [ ] Add `filter` and `boostSpec` as optional request body fields on all routes
- [ ] Add `GET /api/documents/:id` — document metadata without chunks
- [ ] Streaming: SSE on `/api/answer` to deliver tokens as they arrive (reduces time-to-first-token from ~10s to ~1s)
- [ ] Structured logging with `pino` + request correlation IDs

### Assumption to validate
`getDocumentChunks` in Phase 1 calls the Chunk REST API directly. Verify the chunks endpoint is available for the configured datastore; if the datastore uses layout-aware chunking the path may differ slightly.

---

## Phase 3 — Document processing pipeline

**Target:** Control how documents enter the index; improve chunk quality.

### Tasks
- [ ] Document AI processor for PDF → structured JSON (layout-aware OCR)
- [ ] Ingest pipeline: GCS upload → Document AI → Discovery Engine import
- [ ] Metadata schema on documents:
  - `documentType`: `testimony | report | expert_opinion | exhibit | decree`
  - `date`: ISO 8601
  - `author`, `institution`
  - `classification`: `public | reserved | secret`
- [ ] Expose metadata as filter fields: `GET /api/answer?filter=documentType=testimony`
- [ ] `GET /api/documents` — paginated catalogue with metadata

---

## Phase 4 — BigQuery structured layer

**Target:** Enable analytics, deduplication, and cross-session evidence queries.

### Tasks
- [ ] BigQuery dataset: tables `documents`, `chunks`, `sessions`, `citations`, `feedback`
- [ ] Log every `/api/answer` call + feedback event to BQ
- [ ] `GET /api/analytics/timeline` — chronological event stream from BQ
- [ ] `POST /api/analytics/query` — structured query with date/type/keyword filters
- [ ] Cross-session citation frequency: which documents appear most across all queries

---

## Phase 5 — Investigative workbench UI

**Target:** Evidence-first interface. The chat becomes one view, not the whole product.

### Frontend additions
- [ ] **Evidence panel** — sidebar showing raw supporting chunks for the active answer, powered by `POST /api/evidence/search`
- [ ] **Document inspector** — click any citation → full chunk list via `GET /api/evidence/documents/:id/chunks`
- [ ] **Timeline view** — drag citations onto a temporal axis; export JSON/PDF
- [ ] **Dossier builder** — select answers + sources → structured PDF report
- [ ] **Contradiction flag** — highlight answers where the same passage is cited on both sides of a claim

### Backend additions
- [ ] `POST /api/dossier` — server-side PDF generation
- [ ] `GET /api/sessions/:id/evidence` — all evidence surfaces in one session

---

## Phase 6 — Production deployment

**Target:** Cloud Run + IAP, EU data residency, zero long-lived credentials.

### Tasks
- [ ] Cloud Run for backend and frontend (separate services, separate SAs)
- [ ] IAP in front of both services, restricted to authorised domain
- [ ] Service account roles: `discoveryengine.viewer`, `bigquery.dataViewer`
- [ ] Secret Manager for any non-ADC secrets
- [ ] Cloud Armor: rate limiting, geo restriction
- [ ] Cloud Monitoring: alert on p95 latency > 15s and error rate > 1%
- [ ] Terraform module for all infrastructure
- [ ] Cloud Build CI/CD: lint → test → build → deploy on merge to `main`

---

## Intentionally deferred (with rationale)

| Item | Deferred to | Reason |
|------|-------------|--------|
| `@google-cloud/discoveryengine` SDK | Phase 2 | v1alpha answer features not yet stable in SDK; REST works today |
| Streaming SSE answer tokens | Phase 2 | Requires refactor of the fetch layer; Phase 1 correctness first |
| Metadata filters in API | Phase 2 | Requires knowing the datastore schema fields first |
| BigQuery logging | Phase 4 | Needs a BQ dataset design decision before writing a single row |
| Document AI | Phase 3 | Only useful once the ingest pipeline is owned end-to-end |
| IAP / Cloud Run | Phase 6 | Dev/staging works fine with local ADC |
