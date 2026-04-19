# Moby Prince — Technical Roadmap

Investigative evidence platform built on Vertex AI Search + Google Cloud.

---

## Current state (post Phase 1)

```
frontend/          React 18 + Vite + Tailwind — chat, citations, sidebar, history
backend/
  server.js        Express entry point, routes wired
  config.js        Centralised, validated config
  routes/          answer · search · evidence · health
  services/        discoveryEngine (REST) · auth (ADC-based)
  transformers/    answer · search · citations (server-side normalisation)
  middleware/      validate · errorHandler
```

**API surface:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/answer` | Grounded answer with citations |
| POST | `/api/search` | Pure chunk/document retrieval |
| POST | `/api/evidence/search` | Flat evidence list for workbench panel |
| GET  | `/api/evidence/documents/:id/chunks` | All chunks for a document |
| GET  | `/api/health` | Liveness + auth probe |
| POST | `/api/ask` | Backwards-compat alias → `/api/answer` |

---

## Phase 2 — SDK migration + search enhancements

**Goal:** Replace manual REST with `@google-cloud/discoveryengine` SDK; add metadata filtering and serving controls.

- [ ] Install `@google-cloud/discoveryengine` v1.x
- [ ] Swap `services/discoveryEngine.js` `_post`/`_get` for SDK clients
  - `ConversationalSearchServiceClient.answerQuery()` → answer
  - `SearchServiceClient.search()` → search + evidence
  - `DocumentServiceClient.listChunks()` → chunk lookup
- [ ] Expose `filter` and `boostSpec` parameters on all search routes
- [ ] Add `GET /api/documents/:id` — document metadata endpoint
- [ ] Add serving config management (configurable `modelVersion`, `preamble`)
- [ ] Stream answer tokens to frontend via SSE (reduce time-to-first-token)
- [ ] Add structured logging (pino or winston) with request IDs

**Why SDK over raw REST:** Typed proto wrappers, automatic retries with exponential backoff, support for ADC scopes and impersonation, easier testing via mocks.

---

## Phase 3 — Document processing and chunk strategy

**Goal:** Control how documents enter the index; improve chunk quality for evidence retrieval.

- [ ] Document AI processor integration for PDF OCR and layout parsing
  - Layout-aware chunking (respect page breaks, section headings, tables)
  - Extract structured fields: date, author, document type, page range
- [ ] Ingest pipeline (Cloud Functions or Cloud Run job):
  - Upload raw documents to GCS
  - Process with Document AI → structured JSON
  - Import into Discovery Engine datastore with metadata
- [ ] Metadata schema for evidence documents:
  - `documentType`: testimony | report | expert_opinion | exhibit
  - `date`: ISO 8601
  - `author` / `institution`
  - `classification`
- [ ] Expose metadata as filter fields on search/answer/evidence routes
- [ ] `GET /api/documents` — paginated document catalogue with metadata

---

## Phase 4 — BigQuery structured evidence layer

**Goal:** Add a queryable structured layer alongside the vector search layer.

- [ ] BigQuery dataset for evidence records
  - Tables: `documents`, `chunks`, `citations`, `sessions`, `feedback`
- [ ] Session and feedback logging: write to BQ on every answer/feedback event
- [ ] `GET /api/analytics/timeline` — event timeline from BQ
- [ ] `POST /api/analytics/query` — structured BigQuery query endpoint (date ranges, document filters, keyword cross-references)
- [ ] Evidence deduplication across answers using BQ joins
- [ ] Document frequency analysis: which sources appear most across all sessions

---

## Phase 5 — Investigative workbench features

**Goal:** Turn the UI into an evidence workbench, not just a chatbot.

### Frontend features
- [ ] **Evidence panel**: dedicated side panel showing raw supporting chunks for the active answer, powered by `/api/evidence/search`
- [ ] **Document inspector**: click any citation → full document chunk list via `/api/evidence/documents/:id/chunks`
- [ ] **Timeline builder**: drag citations onto a timeline; export as JSON/PDF
- [ ] **Dossier generation**: select answers and sources → generate a structured PDF report
- [ ] **Contradiction detector**: flag answers where citations are cited on both sides of a claim
- [ ] **Cross-reference view**: show which documents appear across multiple answers in a session

### Backend features
- [ ] `POST /api/dossier` — server-side PDF generation (Puppeteer or WeasyPrint via Cloud Run)
- [ ] `GET /api/sessions/:id/evidence` — all evidence surfaces in a session
- [ ] `POST /api/sessions/:id/export` — export session + evidence as structured JSON

---

## Phase 6 — Production deployment (Cloud Run + IAP)

**Goal:** Secure, scalable EU deployment with identity-aware access.

- [ ] Cloud Run services for backend + frontend
  - Separate service accounts with minimal IAM roles
  - Backend: `roles/discoveryengine.viewer`, `roles/bigquery.dataViewer`
  - Frontend: static assets on Cloud Storage + Cloud CDN (or Cloud Run)
- [ ] Identity-Aware Proxy (IAP) in front of both services
  - Camera dei Deputati GSuite domain restriction
  - No API keys in frontend — IAP handles authentication
- [ ] Secret Manager for any non-ADC secrets
- [ ] Cloud Armor WAF for rate limiting and geo restrictions
- [ ] Cloud Monitoring + alerting for backend error rates and latency
- [ ] Terraform module for full infrastructure as code
- [ ] CI/CD via Cloud Build: lint → test → build → deploy on merge to `main`

---

## Architecture principles

1. **Vertex AI Search is the retrieval core** — do not replicate its indexing or ranking.
2. **Normalise at the boundary** — raw Discovery Engine shapes never reach the frontend.
3. **EU data residency by default** — `GCP_LOCATION=eu` in all environments.
4. **Evidence-first, not chat-first** — search and evidence routes are first-class, answer is one view on top of them.
5. **ADC everywhere** — no long-lived API keys; workload identity in production.
6. **Modular backend** — services, transformers, and routes are independently replaceable; swapping SDK or adding BQ should not touch routes.
