-- BigQuery DDL: Create all structured evidence tables
-- Dataset: {project}.evidence (replace {project} with actual project ID)
--
-- Run from Cloud Shell:
--   PROJECT=project-fae202f2-19be-4d87-8cd
--   bq mk --location=EU --dataset ${PROJECT}:evidence
--   sed "s/{project}/${PROJECT}/g" ingestion/scripts/bq-create-tables.sql \
--     | bq query --use_legacy_sql=false
--
-- All tables use IF NOT EXISTS for idempotent deployment.
-- See docs/evidence-model.md for full field documentation.

-- ── 1. documents ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `{project}.evidence.documents` (
  id                  STRING    NOT NULL  OPTIONS(description='Deterministic ID: sha1(source_uri)[:16]'),
  vertex_document_id  STRING              OPTIONS(description='Discovery Engine document ID'),
  parent_document_id  STRING              OPTIONS(description='Set when this is a split part'),
  title               STRING,
  source_uri          STRING              OPTIONS(description='gs://raw-bucket/moby-prince/...'),
  normalized_uri      STRING              OPTIONS(description='gs://normalized-bucket/moby-prince/...'),
  document_type       STRING              OPTIONS(description='testimony|report|expert_opinion|exhibit|decree|parliamentary_act|press|investigation'),
  institution         STRING              OPTIONS(description='marina_militare|guardia_costiera|procura_livorno|commissione_parlamentare|tribunale|ministero_trasporti|rina|other'),
  year                INT64               OPTIONS(description='Document year 1991-2024'),
  legislature         STRING              OPTIONS(description='X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX'),
  topic               STRING              OPTIONS(description='incendio|collisione|soccorso|responsabilita|indennizzo|rotta|comunicazioni|radar|nebbia|vittime'),
  ocr_quality         STRING              OPTIONS(description='high|medium|low'),
  is_split            BOOL,
  chunk_count         INT64,
  word_count          INT64,
  ingested_at         TIMESTAMP,
  ingestion_job_id    STRING,
  created_at          TIMESTAMP NOT NULL,
  updated_at          TIMESTAMP NOT NULL
)
PARTITION BY DATE(created_at)
CLUSTER BY document_type, institution, year
OPTIONS(description='One row per ingested document or split part. Mirrors structData fields used in Vertex AI Search.');

-- ── 2. chunks ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `{project}.evidence.chunks` (
  id              STRING    NOT NULL  OPTIONS(description='Deterministic: sha1(document_id + chunk_index)'),
  document_id     STRING    NOT NULL  OPTIONS(description='FK → evidence.documents.id'),
  vertex_chunk_id STRING              OPTIONS(description='Discovery Engine chunk ID; set after indexing'),
  content         STRING    NOT NULL  OPTIONS(description='Full text of the chunk'),
  page_start      INT64,
  page_end        INT64,
  chunk_index     INT64               OPTIONS(description='0-based position within parent document'),
  word_count      INT64,
  created_at      TIMESTAMP NOT NULL
)
PARTITION BY DATE(created_at)
CLUSTER BY document_id
OPTIONS(description='Individual text chunks. Bridges Discovery Engine chunk IDs with BigQuery rows.');

-- ── 3. entities ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `{project}.evidence.entities` (
  id              STRING    NOT NULL  OPTIONS(description='UUID or human-readable slug e.g. person-chessa-ugo'),
  entity_type     STRING    NOT NULL  OPTIONS(description='PERSON|ORGANIZATION|VESSEL|LOCATION'),
  canonical_name  STRING    NOT NULL,
  aliases         ARRAY<STRING>,
  description     STRING,
  role            STRING              OPTIONS(description='Role in the Moby Prince disaster context'),

  -- Person-specific
  nationality     STRING,
  birth_year      INT64,
  death_year      INT64,

  -- Organization-specific
  org_type        STRING              OPTIONS(description='governmental|military|judicial|maritime|media'),

  -- Vessel-specific
  vessel_type     STRING              OPTIONS(description='ferry|tanker|naval|coast_guard'),
  imo_number      STRING,

  -- Location-specific
  latitude        FLOAT64,
  longitude       FLOAT64,
  location_type   STRING              OPTIONS(description='port|anchorage|sea_area|court|institution'),

  created_at      TIMESTAMP NOT NULL,
  updated_at      TIMESTAMP NOT NULL
)
CLUSTER BY entity_type
OPTIONS(description='Named entities: persons, organizations, vessels, locations. Canonical registry for cross-referencing.');

-- ── 4. events ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `{project}.evidence.events` (
  id              STRING    NOT NULL,
  title           STRING    NOT NULL,
  description     STRING,
  event_type      STRING    NOT NULL  OPTIONS(description='collision|fire|rescue|communication|navigation|administrative|judicial|parliamentary'),
  occurred_at     TIMESTAMP           OPTIONS(description='UTC; null when only date_text is known'),
  date_text       STRING              OPTIONS(description='Human-readable: "22:00 circa del 10 aprile 1991"'),
  date_precision  STRING              OPTIONS(description='exact|approximate|day|month|year'),
  location        STRING,
  latitude        FLOAT64,
  longitude       FLOAT64,
  entity_ids      ARRAY<STRING>       OPTIONS(description='Entity IDs involved → evidence.entities.id'),
  source_claim_ids ARRAY<STRING>      OPTIONS(description='Claim IDs asserting this event → evidence.claims.id'),
  is_disputed     BOOL,
  dispute_notes   STRING,
  created_at      TIMESTAMP NOT NULL,
  updated_at      TIMESTAMP NOT NULL
)
PARTITION BY DATE(occurred_at)
CLUSTER BY event_type, is_disputed
OPTIONS(description='Timestamped events on the Moby Prince disaster timeline. Used for the Timeline view.');

-- ── 5. claims ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `{project}.evidence.claims` (
  id                  STRING    NOT NULL,
  text                STRING    NOT NULL  OPTIONS(description='The factual assertion (verbatim or paraphrased)'),
  claim_type          STRING              OPTIONS(description='fact|interpretation|allegation|conclusion|retraction'),
  document_id         STRING    NOT NULL  OPTIONS(description='FK → evidence.documents.id'),
  chunk_id            STRING              OPTIONS(description='FK → evidence.chunks.id'),
  page_reference      STRING              OPTIONS(description='Human-readable page citation e.g. "p. 47"'),
  entity_ids          ARRAY<STRING>       OPTIONS(description='Entities this claim is about → evidence.entities.id'),
  event_id            STRING              OPTIONS(description='FK → evidence.events.id'),
  confidence          FLOAT64             OPTIONS(description='0.0-1.0 confidence score'),
  status              STRING              OPTIONS(description='unverified|corroborated|contradicted|retracted'),
  extraction_method   STRING              OPTIONS(description='manual|llm_extracted|ner_model'),
  created_at          TIMESTAMP NOT NULL,
  updated_at          TIMESTAMP NOT NULL
)
PARTITION BY DATE(created_at)
CLUSTER BY document_id, status, claim_type
OPTIONS(description='Atomic factual assertions extracted from documents. Primary unit for structured provenance, entity linking and timeline reconstruction.');

-- ── 6. evidence_links ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `{project}.evidence.evidence_links` (
  id          STRING    NOT NULL,
  claim_id    STRING    NOT NULL  OPTIONS(description='FK → evidence.claims.id'),
  chunk_id    STRING    NOT NULL  OPTIONS(description='FK → evidence.chunks.id'),
  document_id STRING    NOT NULL  OPTIONS(description='Denormalized for query performance'),
  link_type   STRING    NOT NULL  OPTIONS(description='supports|contradicts|mentions|references|qualifies'),
  strength    FLOAT64             OPTIONS(description='0.0-1.0 confidence in the link'),
  note        STRING,
  created_at  TIMESTAMP NOT NULL
)
PARTITION BY DATE(created_at)
CLUSTER BY claim_id, link_type
OPTIONS(description='Links between claims and the chunks that support, mention, qualify or otherwise document them.');
