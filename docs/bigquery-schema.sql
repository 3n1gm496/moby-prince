-- BigQuery DDL di riferimento per il dataset `evidence`
--
-- Questa versione documenta lo schema operativo corrente.
-- Per il provisioning parametrico usare anche:
--   ingestion/scripts/bq-create-tables.sql

CREATE TABLE IF NOT EXISTS `evidence.documents` (
  id STRING NOT NULL,
  vertex_document_id STRING,
  parent_document_id STRING,
  title STRING,
  source_uri STRING,
  normalized_uri STRING,
  document_type STRING,
  institution STRING,
  year INT64,
  legislature STRING,
  topic STRING,
  ocr_quality STRING,
  is_split BOOL,
  chunk_count INT64,
  word_count INT64,
  ingested_at TIMESTAMP,
  ingestion_job_id STRING,
  reprocessing_state STRING,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `evidence.chunks` (
  id STRING NOT NULL,
  document_id STRING NOT NULL,
  vertex_chunk_id STRING,
  content STRING NOT NULL,
  page_start INT64,
  page_end INT64,
  chunk_index INT64,
  word_count INT64,
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `evidence.entities` (
  id STRING NOT NULL,
  entity_type STRING NOT NULL,
  canonical_name STRING NOT NULL,
  aliases ARRAY<STRING>,
  description STRING,
  role STRING,
  nationality STRING,
  birth_year INT64,
  death_year INT64,
  org_type STRING,
  vessel_type STRING,
  imo_number STRING,
  latitude FLOAT64,
  longitude FLOAT64,
  location_type STRING,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `evidence.events` (
  id STRING NOT NULL,
  title STRING NOT NULL,
  description STRING,
  event_type STRING NOT NULL,
  occurred_at TIMESTAMP,
  date_text STRING,
  date_precision STRING,
  location STRING,
  latitude FLOAT64,
  longitude FLOAT64,
  entity_ids ARRAY<STRING>,
  source_claim_ids ARRAY<STRING>,
  is_disputed BOOL,
  dispute_notes STRING,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `evidence.claims` (
  id STRING NOT NULL,
  text STRING NOT NULL,
  claim_type STRING,
  document_id STRING NOT NULL,
  document_uri STRING,
  chunk_id STRING,
  page_reference STRING,
  entity_ids ARRAY<STRING>,
  event_id STRING,
  confidence FLOAT64,
  status STRING,
  extraction_method STRING,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `evidence.source_anchors` (
  id STRING NOT NULL,
  document_id STRING NOT NULL,
  claim_id STRING,
  event_id STRING,
  anchor_type STRING NOT NULL,
  page_number INT64,
  text_quote STRING,
  snippet STRING,
  time_start_seconds FLOAT64,
  time_end_seconds FLOAT64,
  frame_reference STRING,
  shot_reference STRING,
  anchor_confidence FLOAT64,
  source_uri STRING,
  mime_type STRING,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `evidence.entity_profiles` (
  entity_id STRING NOT NULL,
  summary STRING NOT NULL,
  aliases ARRAY<STRING>,
  role STRING,
  summary_version INT64 NOT NULL,
  source_claim_ids ARRAY<STRING>,
  generated_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS `evidence.evidence_links` (
  id STRING NOT NULL,
  claim_id STRING NOT NULL,
  chunk_id STRING NOT NULL,
  document_id STRING NOT NULL,
  link_type STRING NOT NULL,
  strength FLOAT64,
  note STRING,
  created_at TIMESTAMP NOT NULL
);
