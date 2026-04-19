# Structured Evidence Model — Moby Prince Evidence Platform

## Purpose

This document defines the BigQuery schema for the structured evidence layer of the Moby Prince Evidence Platform. It is the companion to `docs/evidence-architecture.md`, which explains how this layer coexists with Vertex AI Search unstructured retrieval.

The structured layer enables:
- **Timeline reconstruction** — ordered events with provenance and dispute tracking
- **Contradiction detection** — claim A from document X conflicts with claim B from document Y
- **Dossier assembly** — curated collections of evidence, claims, and entity links
- **Entity-centric views** — all documents, claims, and events involving a specific person, vessel, or institution

---

## Dataset

```
BigQuery dataset: `{project}.evidence`
Location: EU (europe-west1, matching Vertex AI Search deployment)
```

All tables are created with `IF NOT EXISTS` to support idempotent deployment. Partitioned tables use `DATE` partitioning on `created_at` or `occurred_at`; clustering keys are chosen to support the most common filter patterns.

---

## Tables

### 1. `evidence.documents`

One row per ingested document (or document split part). Mirrors the `structData` fields used in Vertex AI Search so the two layers stay in sync.

```sql
CREATE TABLE IF NOT EXISTS `{project}.evidence.documents` (
  -- Identity
  id                  STRING    NOT NULL,  -- deterministic: sha1(source_uri)[:16]
  vertex_document_id  STRING,             -- Discovery Engine document ID (cross-ref)
  parent_document_id  STRING,             -- set when this is a split part

  -- Content descriptors
  title               STRING,
  source_uri          STRING,             -- gs://raw-bucket/moby-prince/...
  normalized_uri      STRING,             -- gs://normalized-bucket/moby-prince/...

  -- Metadata taxonomy (mirrors backend/filters/schema.js)
  document_type       STRING,             -- testimony | report | expert_opinion | exhibit
                                          -- decree | parliamentary_act | press | investigation
  institution         STRING,             -- marina_militare | guardia_costiera | ...
  year                INT64,              -- document year (not ingest year); 1991–2024
  legislature         STRING,             -- X | XI | ... | XIX
  topic               STRING,             -- incendio | collisione | soccorso | ...
  ocr_quality         STRING,             -- high | medium | low

  -- Ingestion provenance
  is_split            BOOL,
  chunk_count         INT64,
  word_count          INT64,
  ingested_at         TIMESTAMP,
  ingestion_job_id    STRING,             -- IngestionJob.jobId for audit trail

  -- Record metadata
  created_at          TIMESTAMP NOT NULL,
  updated_at          TIMESTAMP NOT NULL
)
PARTITION BY DATE(created_at)
CLUSTER BY document_type, institution, year;
```

**Notes:**
- `id` is deterministic from `source_uri` so re-imports are idempotent (use `MERGE`, not `INSERT`).
- `vertex_document_id` is the foreign key for cross-referencing chunks retrieved by Discovery Engine.
- `parent_document_id` mirrors `IngestionJob.parentJobId` from the ingestion pipeline.

---

### 2. `evidence.chunks`

One row per text chunk. The bridge between Discovery Engine chunk IDs and BigQuery rows. Populated during ingestion after text extraction and splitting.

```sql
CREATE TABLE IF NOT EXISTS `{project}.evidence.chunks` (
  -- Identity
  id              STRING    NOT NULL,   -- deterministic: sha1(document_id + chunk_index)
  document_id     STRING    NOT NULL,   -- FK → evidence.documents.id
  vertex_chunk_id STRING,              -- Discovery Engine chunk ID (from search results)

  -- Content
  content         STRING    NOT NULL,  -- full text of the chunk
  page_start      INT64,               -- first source page
  page_end        INT64,               -- last source page
  chunk_index     INT64,               -- position within the parent document (0-based)
  word_count      INT64,

  -- Record metadata
  created_at      TIMESTAMP NOT NULL
)
PARTITION BY DATE(created_at)
CLUSTER BY document_id;
```

**Notes:**
- `vertex_chunk_id` is set after Discovery Engine indexing; may be null for chunks pending indexing.
- When a search result returns `chunkInfo.id`, look up this table to enrich with page numbers and exact text.

---

### 3. `evidence.entities`

Named entities appearing in the corpus. The canonical registry for persons, organizations, vessels, and locations referenced by claims and events.

```sql
CREATE TABLE IF NOT EXISTS `{project}.evidence.entities` (
  -- Identity
  id              STRING    NOT NULL,   -- UUID or human-readable slug: person-nardelli-carlo
  entity_type     STRING    NOT NULL,   -- PERSON | ORGANIZATION | VESSEL | LOCATION

  -- Naming
  canonical_name  STRING    NOT NULL,   -- authoritative full name
  aliases         ARRAY<STRING>,        -- alternative names, abbreviations, misspellings

  -- Description
  description     STRING,
  role            STRING,               -- role in the Moby Prince disaster context
                                        -- e.g. 'comandante Moby Prince', 'comandante AGIP Abruzzo'

  -- Person-specific
  birth_year      INT64,
  death_year      INT64,               -- null unless died in disaster or known deceased
  nationality     STRING,

  -- Organization-specific
  org_type        STRING,               -- governmental | military | judicial | maritime | media

  -- Vessel-specific
  vessel_type     STRING,               -- ferry | tanker | naval | coast_guard
  imo_number      STRING,

  -- Location-specific
  latitude        FLOAT64,
  longitude       FLOAT64,
  location_type   STRING,               -- port | anchorage | sea_area | court | institution

  -- Record metadata
  created_at      TIMESTAMP NOT NULL,
  updated_at      TIMESTAMP NOT NULL
)
CLUSTER BY entity_type;
```

**Key entities** (to be populated manually or via NER pipeline):

| id | entity_type | canonical_name | role |
|----|-------------|----------------|------|
| `vessel-moby-prince` | VESSEL | Moby Prince | Traghetto passeggeri Navarma |
| `vessel-agip-abruzzo` | VESSEL | AGIP Abruzzo | Petroliera SNAM |
| `person-chessa-ugo` | PERSON | Ugo Chessa | Comandante Moby Prince |
| `person-nardelli-carlo` | PERSON | Carlo Nardelli | Unico sopravvissuto |
| `org-procura-livorno` | ORGANIZATION | Procura della Repubblica di Livorno | Autorità giudiziaria |
| `org-mrcc-livorno` | ORGANIZATION | MRCC Livorno | Centro di coordinamento soccorso |
| `location-porto-livorno` | LOCATION | Porto di Livorno | Luogo del disastro |

---

### 4. `evidence.events`

Timestamped events on the Moby Prince disaster timeline. Each event has a precision field because many times are disputed or approximate.

```sql
CREATE TABLE IF NOT EXISTS `{project}.evidence.events` (
  -- Identity
  id              STRING    NOT NULL,

  -- Description
  title           STRING    NOT NULL,
  description     STRING,
  event_type      STRING    NOT NULL,  -- collision | fire | rescue | communication
                                       -- navigation | administrative | judicial | parliamentary

  -- Temporal data
  occurred_at     TIMESTAMP,           -- UTC; null when only date_text is known
  date_text       STRING,              -- human-readable: "22:00 circa del 10 aprile 1991"
  date_precision  STRING,              -- exact | approximate | day | month | year

  -- Spatial data
  location        STRING,
  latitude        FLOAT64,
  longitude       FLOAT64,

  -- Links
  entity_ids      ARRAY<STRING>,       -- entities involved (→ evidence.entities.id)
  source_claim_ids ARRAY<STRING>,      -- claims asserting this event (→ evidence.claims.id)

  -- Dispute tracking
  is_disputed     BOOL,
  dispute_notes   STRING,              -- brief description of what is disputed and by whom

  -- Record metadata
  created_at      TIMESTAMP NOT NULL,
  updated_at      TIMESTAMP NOT NULL
)
PARTITION BY DATE(occurred_at)
CLUSTER BY event_type, is_disputed;
```

**Core events** (seed data for the timeline):

| event_type | date_text | title |
|------------|-----------|-------|
| `navigation` | 10 apr 1991, ~21:30 | Moby Prince salpa da Porto Livorno |
| `collision` | 10 apr 1991, ~22:25 | Collisione con AGIP Abruzzo |
| `fire` | 10 apr 1991, ~22:25 | Incendio a bordo del Moby Prince |
| `communication` | 10 apr 1991, ~22:26 | Prima chiamata di soccorso MRCC |
| `rescue` | 10 apr 1991, 23:00+ | Arrivo primi soccorsi (ritardo contestato) |
| `administrative` | 11 apr 1991 | Apertura inchiesta della Capitaneria di Porto |
| `judicial` | 1993 | Inizio primo processo Tribunale di Livorno |
| `parliamentary` | 1997–1998 | X Commissione parlamentare d'inchiesta |
| `parliamentary` | 2021–2022 | XVIII Commissione parlamentare d'inchiesta (Camera) |

---

### 5. `evidence.claims`

Atomic factual assertions extracted from documents. The primary unit of structured evidence for cross-referencing and contradiction detection.

```sql
CREATE TABLE IF NOT EXISTS `{project}.evidence.claims` (
  -- Identity
  id                  STRING    NOT NULL,

  -- The assertion
  text                STRING    NOT NULL,  -- verbatim or paraphrased claim text
  claim_type          STRING,              -- fact | interpretation | allegation
                                           -- conclusion | retraction

  -- Source provenance
  document_id         STRING    NOT NULL,  -- FK → evidence.documents.id
  chunk_id            STRING,              -- FK → evidence.chunks.id (most specific source)
  page_reference      STRING,              -- e.g. "p. 47" for human-readable citation

  -- Links
  entity_ids          ARRAY<STRING>,       -- entities the claim is about
  event_id            STRING,              -- event this claim relates to

  -- Assessment
  confidence          FLOAT64,             -- 0.0–1.0; manually assigned or model-scored
  status              STRING,              -- unverified | corroborated | contradicted | retracted
  extraction_method   STRING,              -- manual | llm_extracted | ner_model

  -- Record metadata
  created_at          TIMESTAMP NOT NULL,
  updated_at          TIMESTAMP NOT NULL
)
PARTITION BY DATE(created_at)
CLUSTER BY document_id, status, claim_type;
```

**Claim types defined:**

| Type | Meaning |
|------|---------|
| `fact` | Objectively verifiable assertion (time, position, communication log entry) |
| `interpretation` | Analysis or conclusion drawn from facts (e.g., "the fog was light") |
| `allegation` | Unverified assertion made by a party (e.g., "MRCC was warned at 22:28") |
| `conclusion` | Final determination by a judicial or parliamentary body |
| `retraction` | A previous claim that was subsequently withdrawn or corrected |

---

### 6. `evidence.evidence_links`

Junction table linking claims to the chunks that support, contradict, or reference them. A single claim may have many supporting chunks across many documents; a single chunk may support many claims.

```sql
CREATE TABLE IF NOT EXISTS `{project}.evidence.evidence_links` (
  -- Identity
  id          STRING    NOT NULL,

  -- Junction
  claim_id    STRING    NOT NULL,   -- FK → evidence.claims.id
  chunk_id    STRING    NOT NULL,   -- FK → evidence.chunks.id
  document_id STRING    NOT NULL,   -- denormalized for query performance

  -- Link classification
  link_type   STRING    NOT NULL,   -- supports | contradicts | mentions | references | qualifies
  strength    FLOAT64,              -- 0.0–1.0 confidence in the link assessment
  note        STRING,               -- analyst note explaining the link

  -- Record metadata
  created_at  TIMESTAMP NOT NULL
)
PARTITION BY DATE(created_at)
CLUSTER BY claim_id, link_type;
```

**Link types:**

| Type | Meaning |
|------|---------|
| `supports` | Chunk provides evidence that the claim is true |
| `contradicts` | Chunk provides evidence that the claim is false or inconsistent |
| `mentions` | Chunk references the same facts but neither supports nor contradicts |
| `references` | Chunk explicitly references the document or authority behind the claim |
| `qualifies` | Chunk adds nuance or conditions to the claim without contradicting it |

---

### 7. `evidence.contradictions`

Recorded contradictions between pairs of claims. Each row represents an identified conflict that an analyst has flagged for investigation.

```sql
CREATE TABLE IF NOT EXISTS `{project}.evidence.contradictions` (
  -- Identity
  id                  STRING    NOT NULL,

  -- The two conflicting claims
  claim_a_id          STRING    NOT NULL,   -- FK → evidence.claims.id
  claim_b_id          STRING    NOT NULL,   -- FK → evidence.claims.id
  document_a_id       STRING    NOT NULL,   -- denormalized
  document_b_id       STRING    NOT NULL,   -- denormalized

  -- Classification
  contradiction_type  STRING,               -- factual | temporal | testimonial
                                            -- interpretive | procedural
  severity            STRING,               -- minor | significant | major
  description         STRING,               -- analyst description of the conflict

  -- Resolution tracking
  status              STRING,               -- open | resolved | contested | under_review
  resolution          STRING,               -- how it was resolved (if resolved)
  detected_by         STRING,               -- manual | llm_flagged
  detected_at         TIMESTAMP,
  resolved_at         TIMESTAMP,

  -- Record metadata
  created_at          TIMESTAMP NOT NULL,
  updated_at          TIMESTAMP NOT NULL
)
PARTITION BY DATE(created_at)
CLUSTER BY contradiction_type, status, severity;
```

**Contradiction types:**

| Type | Example |
|------|---------|
| `factual` | Document A says collision at 22:25, document B says 22:28 |
| `temporal` | Two testimonies give incompatible sequences of events |
| `testimonial` | Witness A contradicts witness B on the same event |
| `interpretive` | Expert A concludes fog was <100m visibility; expert B says >500m |
| `procedural` | Document A says SOS was issued at T+2min; radio logs show T+7min |

---

## Entity–Relationship Summary

```
documents ──< chunks          (1 document → N chunks)
documents ──< claims          (1 document → N claims)
chunks    ──< evidence_links  (1 chunk supports/contradicts N claims)
claims    ──< evidence_links  (1 claim has N supporting/contradicting chunks)
claims    ──< contradictions  (1 claim may be in N contradiction pairs)
entities ─── events           (M:N via events.entity_ids ARRAY)
entities ─── claims           (M:N via claims.entity_ids ARRAY)
```

---

## BigQuery Deployment

```bash
# Create dataset
bq mk --location=EU --dataset ${GOOGLE_CLOUD_PROJECT}:evidence

# Apply all table schemas
bq query --use_legacy_sql=false < ingestion/scripts/bq-create-tables.sql
```

The DDL file `ingestion/scripts/bq-create-tables.sql` contains all 7 `CREATE TABLE IF NOT EXISTS` statements above with `{project}` replaced by the actual project ID.

---

## Activation Checklist

- [ ] Create BigQuery dataset `evidence` in EU region
- [ ] Run `ingestion/scripts/bq-create-tables.sql` to create all 7 tables
- [ ] Populate `evidence.documents` from the ingestion pipeline audit log
- [ ] Populate `evidence.chunks` from Discovery Engine chunk export
- [ ] Populate `evidence.entities` seed data (key persons, vessels, orgs)
- [ ] Populate `evidence.events` seed data (core timeline events)
- [ ] Wire `backend/routes/timeline.js` to query `evidence.events`
- [ ] Wire `backend/routes/contradictions.js` to query `evidence.contradictions`
- [ ] Wire `backend/routes/dossier.js` for dossier CRUD
- [ ] Set `BQ_DATASET_ID` and `BQ_PROJECT_ID` environment variables in Cloud Run

See `docs/evidence-architecture.md` for the full activation sequence and API design.
