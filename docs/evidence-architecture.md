# Evidence Architecture — Moby Prince Evidence Platform

## Overview

The platform operates in two complementary layers:

| Layer | Technology | Strengths | Limitations |
|-------|-----------|-----------|-------------|
| **Unstructured retrieval** | Vertex AI Search (Discovery Engine) | Semantic search across the full corpus, grounded answer generation, zero-shot question answering | No structured query, no entity graph, no timeline reconstruction |
| **Structured evidence** | BigQuery (`evidence` dataset) | Exact filtering, joins across entities, contradiction detection, timeline queries, aggregations | Requires explicit annotation; cannot answer freeform questions |

Neither layer replaces the other. The platform is designed so that a user's investigative workflow moves between them:

1. Start with a **natural language query** → Vertex AI Search returns grounded answer with citations
2. Interesting chunks are **elevated to claims** → stored in BigQuery with provenance
3. Claims are **linked to entities and events** → enabling timeline and contradiction views
4. A **dossier** assembles selected evidence into a structured argument

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        User (browser)                                │
│                                                                      │
│  Chat (/chat)          Timeline (/timeline)     Dossier (/dossier)  │
└─────────┬──────────────────────┬───────────────────────┬────────────┘
          │                      │                       │
          ▼                      ▼                       ▼
┌─────────────────┐   ┌──────────────────────────────────────────────┐
│  Express API    │   │             Express API (planned)             │
│                 │   │                                               │
│ POST /api/answer│   │ GET  /api/timeline/events                    │
│ POST /api/search│   │ GET  /api/contradictions                     │
│ GET  /api/evid… │   │ POST /api/dossier                            │
└────────┬────────┘   │ GET  /api/entities/:id                       │
         │            └──────────────┬───────────────────────────────┘
         │                           │
         ▼                           ▼
┌──────────────────┐      ┌─────────────────────┐
│  Vertex AI Search│      │      BigQuery        │
│  Discovery Engine│      │   evidence dataset   │
│                  │      │                      │
│  Corpus (PDFs,   │      │  documents  events   │
│  TXT chunks)     │      │  claims     entities │
│  Semantic index  │      │  chunks     contrad… │
│  Session memory  │      │  evidence_links      │
└──────────────────┘      └─────────────────────┘
         │                           │
         └───────────┬───────────────┘
                     │
              ┌──────▼──────┐
              │  GCS buckets │
              │  raw/        │
              │  normalized/ │
              │  quarantine/ │
              └─────────────┘
```

---

## Layer 1: Unstructured Retrieval (Vertex AI Search)

**Current state: fully operational**

The Discovery Engine layer handles all user-facing queries in the chat interface:

- `POST /api/answer` — grounded answer generation with citations (`:answer` API)
- `POST /api/search` — ranked document/chunk retrieval (`:search` API)
- `GET /api/evidence/documents/:id/chunks` — chunk lookup by document ID

**What it is good for:**
- Answering open-ended questions from the corpus without prior curation
- Returning the most relevant evidence passages for any query
- Multi-turn conversation with session-level context
- Metadata filtering (once `structData` is populated)

**What it cannot do:**
- Join across entities ("all claims involving both Carlo Nardelli and the MRCC")
- Temporal ordering ("show events in chronological order")
- Contradiction detection ("find two documents that say opposite things about the fog")
- Build dossiers (no saved evidence workspace)

---

## Layer 2: Structured Evidence (BigQuery)

**Current state: schema designed, tables not yet created, queries not yet wired**

The BigQuery layer is populated through two complementary processes:

### 2a. Ingestion-time population

When a document passes through the ingestion pipeline, its metadata is written to `evidence.documents` alongside the Vertex AI Search import. Chunks are written to `evidence.chunks` with the `vertex_chunk_id` populated once the Discovery Engine returns the document ID.

```
GCS raw/ file
    │
    ▼ IngestionJob pipeline
    ├── ValidatorWorker → evidence.documents (MERGE by id)
    ├── SplitterWorker  → evidence.chunks (INSERT)
    └── IndexerWorker   → set vertex_document_id, vertex_chunk_id
```

### 2b. Analyst-time population

Claims, events, entities, and contradictions are populated by human analysts or LLM-assisted extraction:

```
Chat session result
    │
    ▼ analyst selects a passage and clicks "Eleva a claim"   (future UI)
    ├── evidence.claims INSERT
    ├── evidence.evidence_links INSERT (link_type: supports)
    └── optionally: evidence.events INSERT or entity link
```

LLM-assisted extraction (future):
- Pass a chunk to Claude Sonnet with a structured extraction prompt
- Claude returns JSON: `{ claims: [], entities: [], event: {} }`
- Backend validates and inserts into BigQuery

---

## API Bridge Design

New backend routes will query BigQuery using `@google-cloud/bigquery`. All routes are read-only from the user's perspective; writes go through dedicated ingest/annotate endpoints.

```javascript
// backend/services/bigquery.js (planned)
const { BigQuery } = require('@google-cloud/bigquery');
const bq = new BigQuery({ projectId: config.projectId });

async function query(sql, params = {}) {
  const [rows] = await bq.query({ query: sql, params, location: 'EU' });
  return rows;
}
```

### Planned routes

```
GET  /api/timeline/events
     ?from=YYYY-MM-DD&to=YYYY-MM-DD
     &types[]=collision&types[]=fire
     &entities[]=vessel-moby-prince
     → { events: Event[], meta: { total, disputed } }

GET  /api/entities/:id
     → { entity: Entity, documents: Document[], claims: Claim[] }

GET  /api/contradictions
     ?types[]=temporal&status=open&severity=major
     → { contradictions: Contradiction[], meta: { total } }

POST /api/dossier
     body: { title, claimIds[], chunkIds[], notes }
     → { dossierId, ...dossier }

GET  /api/dossier/:id
     → { dossier: Dossier, claims: Claim[], chunks: Chunk[], entities: Entity[] }
```

---

## Future Features

### 1. Timeline of Events

**Purpose:** Chronological reconstruction of the Moby Prince disaster from 10 April 1991 through the parliamentary proceedings of 2022.

**Data source:** `evidence.events` joined with `evidence.entities` and `evidence.claims`

**UI:** `/timeline` — vertical timeline grouped by phase (pre-disaster navigation, the night of 10 April, rescue operations, investigations 1991–1993, trials 1993–1999, parliamentary commissions 1997–2022)

**Key query:**
```sql
SELECT e.*, ARRAY_AGG(c.text) AS supporting_claims
FROM evidence.events e
LEFT JOIN UNNEST(e.source_claim_ids) AS cid
LEFT JOIN evidence.claims c ON c.id = cid
WHERE e.occurred_at BETWEEN @from AND @to
  AND (@event_type IS NULL OR e.event_type = @event_type)
ORDER BY e.occurred_at ASC NULLS LAST, e.date_text ASC;
```

**Disputed events:** Events with `is_disputed = true` are shown with a visual marker and an expandable panel listing the conflicting claims.

**Interaction:** Clicking a timeline event opens a panel showing the source documents, the supporting claims, and any identified contradictions about that event.

---

### 2. Contradiction Matrix

**Purpose:** Structured view of all identified factual conflicts in the corpus, filterable by type, severity, document pair, and investigation phase.

**Data source:** `evidence.contradictions` joined with `evidence.claims`, `evidence.documents`

**UI:** `/contradictions` — searchable list of contradiction pairs. Each row shows:
- Claim A (text, document, year)
- vs Claim B (text, document, year)
- Contradiction type, severity, status
- Resolution (if resolved)

**Key query:**
```sql
SELECT
  con.*,
  ca.text AS claim_a_text, da.title AS doc_a_title, da.year AS doc_a_year,
  cb.text AS claim_b_text, db.title AS doc_b_title, db.year AS doc_b_year
FROM evidence.contradictions con
JOIN evidence.claims ca ON ca.id = con.claim_a_id
JOIN evidence.claims cb ON cb.id = con.claim_b_id
JOIN evidence.documents da ON da.id = con.document_a_id
JOIN evidence.documents db ON db.id = con.document_b_id
WHERE (@type IS NULL OR con.contradiction_type = @type)
  AND (@status IS NULL OR con.status = @status)
ORDER BY
  CASE con.severity WHEN 'major' THEN 0 WHEN 'significant' THEN 1 ELSE 2 END,
  con.created_at DESC;
```

**LLM-assisted detection:** A scheduled job can pass pairs of high-similarity chunks (by cosine similarity from Discovery Engine) to Claude Sonnet with the prompt: _"Do these two passages contradict each other? If yes, classify the contradiction type and severity."_

---

### 3. Dossier Builder

**Purpose:** Curated workspace where an analyst assembles evidence into a structured argument for a specific sub-question of the investigation.

**Workflow:**
1. Chat query returns evidence → analyst clicks "Add to dossier"
2. Dossier panel accumulates selected chunks and claims
3. Analyst adds narrative notes between evidence items
4. Dossier is exported as a structured PDF or printed

**Data model:**
```javascript
// Dossier is stored in BigQuery (planned: evidence.dossiers table)
{
  id: string,
  title: string,               // e.g. "Ritardo soccorsi — 10 aprile 1991"
  created_by: string,          // analyst name/session
  items: [
    { type: 'chunk',  id: string, note: string, order: number },
    { type: 'claim',  id: string, note: string, order: number },
    { type: 'note',   text: string,             order: number },
  ],
  entity_ids: string[],        // entities this dossier focuses on
  status: 'draft' | 'final',
  created_at: string,
  updated_at: string,
}
```

**UI:** `/dossier` — split view: left panel is the chat interface (query + results), right panel is the dossier workspace (drag-and-drop evidence items, inline notes). Export button generates PDF via Cloud Run.

---

### 4. Entity Views (Person / Source / Document)

**Purpose:** Entity-centric pages giving a 360° view of a specific person, vessel, organization, or location across the entire corpus.

**Examples:**
- **Carlo Nardelli** — all documents mentioning him, all claims attributed to him, his role in timeline events, contradictions involving his testimony
- **AGIP Abruzzo** — technical documents, navigational logs, chain of custody for physical evidence
- **Commissione Parlamentare XVIII** — all documents produced by or submitted to this commission, key conclusions, contradictions with earlier commissions

**URL pattern:** `/entities/:id`

**Key query:**
```sql
-- All documents mentioning this entity
SELECT d.*, COUNT(c.id) AS claim_count
FROM evidence.documents d
JOIN evidence.claims c ON c.document_id = d.id
WHERE @entity_id IN UNNEST(c.entity_ids)
GROUP BY d.id
ORDER BY d.year DESC;
```

---

## Data Flow: From Ingestion to Structured Evidence

```
1. PDF/TXT uploaded to gs://corpus-raw/

2. Ingestion pipeline runs (Cloud Run Job):
   a. ValidatorWorker   → validates file, writes evidence.documents (MERGE)
   b. SplitterWorker    → splits oversized files, writes evidence.chunks
   c. IndexerWorker     → imports to Discovery Engine, updates vertex_document_id
                          and vertex_chunk_id in BigQuery

3. Corpus metadata annotated:
   a. patch-schema.js   → Discovery Engine schema PATCH for structData fields
   b. import-documents.js → re-import with structData, update evidence.documents

4. Analyst workflow:
   a. Chat query → grounded answer with citations
   b. Analyst elevates key passages to claims → evidence.claims INSERT
   c. Analyst links claims to events → evidence.events INSERT or UPDATE
   d. Analyst flags contradictions → evidence.contradictions INSERT
   e. Analyst builds dossier → evidence.dossiers INSERT (planned table)

5. Analytics queries run in BigQuery:
   a. Timeline query → ordered events with dispute flags
   b. Contradiction matrix → open contradiction pairs by severity
   c. Entity network → all documents + claims per entity
```

---

## Backend Implementation Roadmap

| Route file | BigQuery table(s) | Status |
|-----------|-------------------|--------|
| `backend/routes/timeline.js` | `events`, `claims`, `entities` | Not yet implemented |
| `backend/routes/entities.js` | `entities`, `claims`, `documents` | Not yet implemented |
| `backend/routes/contradictions.js` | `contradictions`, `claims`, `documents` | Not yet implemented |
| `backend/routes/dossier.js` | `dossiers` (planned), `claims`, `chunks` | Not yet implemented |
| `ingestion/workers/bq-writer.js` | `documents`, `chunks` | Not yet implemented |

**Environment variables needed:**
```
BQ_PROJECT_ID    GCP project (usually same as GOOGLE_CLOUD_PROJECT)
BQ_DATASET_ID    BigQuery dataset name (default: evidence)
```

**IAM roles needed for backend SA:**
- `roles/bigquery.dataViewer` on the `evidence` dataset (read queries)
- `roles/bigquery.dataEditor` on the `evidence` dataset (claim/contradiction writes)
- `roles/bigquery.jobUser` on the project (to run query jobs)

---

## What Must Change to Activate This Layer

| Item | File | Action |
|------|------|--------|
| Create BQ dataset + tables | Cloud Shell | `bq mk` + `ingestion/scripts/bq-create-tables.sql` |
| Write BQ from ingestion pipeline | `ingestion/workers/indexer.js` | Add `BqWriter` context call after INDEX success |
| Add `@google-cloud/bigquery` | `backend/package.json` | `npm install @google-cloud/bigquery` |
| Create `backend/services/bigquery.js` | new | BQ client + parameterized query helper |
| Implement timeline route | `backend/routes/timeline.js` | Parameterized events query |
| Implement entities route | `backend/routes/entities.js` | Entity lookup + cross-table join |
| Implement contradictions route | `backend/routes/contradictions.js` | Contradiction list + severity filter |
| Implement dossier route | `backend/routes/dossier.js` | CRUD for dossier assembly |
| Wire frontend to API | `frontend/src/pages/*.jsx` | Remove empty-state, call API |
