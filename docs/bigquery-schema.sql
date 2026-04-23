-- BigQuery DDL — evidence dataset
--
-- Run once per environment:
--   bq mk --dataset --location=EU ${PROJECT_ID}:evidence
--   bq query --nouse_legacy_sql < docs/bigquery-schema.sql
--
-- Required IAM roles:
--   ingestion service account : roles/bigquery.dataEditor
--   backend service account   : roles/bigquery.dataViewer
--
-- Tables follow the evidence/models.js normalizer contract.

-- ── documents ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `evidence.documents` (
  id                 STRING    NOT NULL,
  vertex_document_id STRING,
  parent_document_id STRING,
  title              STRING,
  source_uri         STRING,
  normalized_uri     STRING,
  document_type      STRING,
  institution        STRING,
  year               INT64,
  legislature        STRING,
  topic              STRING,
  ocr_quality        STRING,
  is_split           BOOL      NOT NULL DEFAULT FALSE,
  chunk_count        INT64,
  word_count         INT64,
  ingested_at        TIMESTAMP,
  created_at         TIMESTAMP NOT NULL,
  updated_at         TIMESTAMP NOT NULL
)
OPTIONS (description = 'Ingested documents — mirrors Discovery Engine structData');

-- ── chunks ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `evidence.chunks` (
  id              STRING    NOT NULL,
  document_id     STRING    NOT NULL,
  vertex_chunk_id STRING,
  content         STRING    NOT NULL,
  page_start      INT64,
  page_end        INT64,
  chunk_index     INT64,
  word_count      INT64,
  created_at      TIMESTAMP NOT NULL
)
OPTIONS (description = 'Document chunks indexed in Discovery Engine');

-- ── entities ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `evidence.entities` (
  id             STRING   NOT NULL,
  entity_type    STRING   NOT NULL,  -- PERSON | ORGANIZATION | VESSEL | LOCATION
  canonical_name STRING   NOT NULL,
  aliases        ARRAY<STRING>,
  description    STRING,
  role           STRING,
  nationality    STRING,
  birth_year     INT64,
  death_year     INT64,
  org_type       STRING,
  vessel_type    STRING,
  imo_number     STRING,
  latitude       FLOAT64,
  longitude      FLOAT64,
  location_type  STRING,
  created_at     TIMESTAMP NOT NULL,
  updated_at     TIMESTAMP NOT NULL
)
OPTIONS (description = 'Named entities extracted by NL API + Gemini canonicalization');

-- ── events ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `evidence.events` (
  id                STRING    NOT NULL,
  title             STRING    NOT NULL,
  description       STRING,
  event_type        STRING    NOT NULL,  -- collision|fire|rescue|communication|navigation|administrative|judicial|parliamentary
  occurred_at       TIMESTAMP,
  date_text         STRING,
  date_precision    STRING,              -- exact|approximate|day|month|year
  location          STRING,
  latitude          FLOAT64,
  longitude         FLOAT64,
  entity_ids        ARRAY<STRING>,
  source_claim_ids  ARRAY<STRING>,
  is_disputed       BOOL      NOT NULL DEFAULT FALSE,
  dispute_notes     STRING,
  created_at        TIMESTAMP NOT NULL,
  updated_at        TIMESTAMP NOT NULL
)
OPTIONS (description = 'Curated timeline events — sourced from BQ claims or manual entry');

-- ── claims ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `evidence.claims` (
  id                STRING    NOT NULL,
  text              STRING    NOT NULL,
  claim_type        STRING,              -- fact|interpretation|allegation|conclusion|retraction
  document_id       STRING    NOT NULL,  -- FK to evidence.documents.id (= ingestion job ID)
  chunk_id          STRING,
  page_reference    STRING,
  entity_ids        ARRAY<STRING>,
  event_id          STRING,
  confidence        FLOAT64,
  status            STRING    NOT NULL DEFAULT 'unverified',  -- unverified|corroborated|contradicted|retracted
  extraction_method STRING,              -- manual|llm_extracted|ner_model
  source_uri        STRING,              -- GCS URI for traceability
  created_at        TIMESTAMP NOT NULL,
  updated_at        TIMESTAMP NOT NULL
)
OPTIONS (description = 'Factual claims extracted by Gemini Flash from document text');

-- ── evidence_links ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `evidence.evidence_links` (
  id          STRING    NOT NULL,
  claim_id    STRING    NOT NULL,
  chunk_id    STRING    NOT NULL,
  document_id STRING    NOT NULL,
  link_type   STRING    NOT NULL,  -- supports|contradicts|mentions|references|qualifies
  strength    FLOAT64,
  note        STRING,
  created_at  TIMESTAMP NOT NULL
)
OPTIONS (description = 'Cross-reference between claims and source chunks used for provenance and verification');
