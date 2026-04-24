'use strict';

/**
 * Application-side domain models for the structured evidence layer.
 *
 * These are plain JavaScript objects used as the canonical shape contract
 * between the BigQuery schema (docs/evidence-model.md) and the API routes
 * (backend/routes/timeline.js, entities.js, dossier.js).
 *
 * Usage pattern:
 *   const row = await bq.query(EVENTS_BY_DATE);
 *   return row.map(normalizeEvent);
 *
 * JSDoc types are provided so IDEs give autocomplete and TypeScript projects
 * can import these as type references.
 *
 * None of these functions call BigQuery — they only normalize raw BQ row
 * objects into the API response shape. The BigQuery client and query helpers
 * live in backend/services/bigquery.js (planned).
 */

// ── Document ──────────────────────────────────────────────────────────────────

/**
 * @typedef {object} EvidenceDocument
 * @property {string}      id
 * @property {string|null} vertexDocumentId    Discovery Engine document ID
 * @property {string|null} parentDocumentId    Set when this is a split part
 * @property {string|null} title
 * @property {string|null} sourceUri           gs:// raw bucket URI
 * @property {string|null} normalizedUri       gs:// normalized bucket URI
 * @property {string|null} documentType        testimony|report|expert_opinion|exhibit|...
 * @property {string|null} institution         marina_militare|guardia_costiera|...
 * @property {number|null} year                Document year (not ingest year)
 * @property {string|null} legislature         X|XI|...|XIX
 * @property {string|null} topic               incendio|collisione|soccorso|...
 * @property {string|null} ocrQuality          high|medium|low
 * @property {boolean}     isSplit
 * @property {number|null} chunkCount
 * @property {number|null} wordCount
 * @property {string|null} ingestedAt          ISO timestamp
 * @property {string|null} ingestionJobId
 * @property {string|null} reprocessingState
 * @property {string}      createdAt
 * @property {string}      updatedAt
 */

/**
 * Normalize a BigQuery `evidence.documents` row into an EvidenceDocument.
 * @param {object} row
 * @returns {EvidenceDocument}
 */
function normalizeDocument(row) {
  return {
    id:               row.id,
    vertexDocumentId: row.vertex_document_id ?? null,
    parentDocumentId: row.parent_document_id ?? null,
    title:            row.title ?? null,
    sourceUri:        row.source_uri ?? null,
    normalizedUri:    row.normalized_uri ?? null,
    documentType:     row.document_type ?? null,
    institution:      row.institution ?? null,
    year:             row.year != null ? Number(row.year) : null,
    legislature:      row.legislature ?? null,
    topic:            row.topic ?? null,
    ocrQuality:       row.ocr_quality ?? null,
    isSplit:          row.is_split ?? false,
    chunkCount:       row.chunk_count != null ? Number(row.chunk_count) : null,
    wordCount:        row.word_count  != null ? Number(row.word_count)  : null,
    ingestedAt:       row.ingested_at ? _toIso(row.ingested_at) : null,
    ingestionJobId:   row.ingestion_job_id ?? null,
    reprocessingState: row.reprocessing_state ?? null,
    createdAt:        _toIso(row.created_at),
    updatedAt:        _toIso(row.updated_at),
  };
}

// ── Chunk ─────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} EvidenceChunk
 * @property {string}      id
 * @property {string}      documentId
 * @property {string|null} vertexChunkId       Discovery Engine chunk ID
 * @property {string}      content             Full text of the chunk
 * @property {number|null} pageStart
 * @property {number|null} pageEnd
 * @property {number|null} chunkIndex          0-based position within parent document
 * @property {number|null} wordCount
 * @property {string}      createdAt
 */

/**
 * @param {object} row
 * @returns {EvidenceChunk}
 */
function normalizeChunk(row) {
  return {
    id:             row.id,
    documentId:     row.document_id,
    vertexChunkId:  row.vertex_chunk_id ?? null,
    content:        row.content,
    pageStart:      row.page_start  != null ? Number(row.page_start)  : null,
    pageEnd:        row.page_end    != null ? Number(row.page_end)    : null,
    chunkIndex:     row.chunk_index != null ? Number(row.chunk_index) : null,
    wordCount:      row.word_count  != null ? Number(row.word_count)  : null,
    createdAt:      _toIso(row.created_at),
  };
}

// ── Entity ────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} EvidenceEntity
 * @property {string}      id
 * @property {'PERSON'|'ORGANIZATION'|'VESSEL'|'LOCATION'} entityType
 * @property {string}      canonicalName
 * @property {string[]}    aliases
 * @property {string|null} description
 * @property {string|null} role                Role in the Moby Prince disaster
 * @property {string|null} nationality         (PERSON)
 * @property {number|null} birthYear           (PERSON)
 * @property {number|null} deathYear           (PERSON)
 * @property {string|null} orgType             (ORGANIZATION)
 * @property {string|null} vesselType          (VESSEL)
 * @property {string|null} imoNumber           (VESSEL)
 * @property {number|null} latitude            (LOCATION)
 * @property {number|null} longitude           (LOCATION)
 * @property {string|null} locationType        (LOCATION)
 * @property {string}      createdAt
 * @property {string}      updatedAt
 */

/**
 * @param {object} row
 * @returns {EvidenceEntity}
 */
function normalizeEntity(row) {
  return {
    id:            row.id,
    entityType:    row.entity_type,
    canonicalName: row.canonical_name,
    aliases:       row.aliases ?? [],
    description:   row.description ?? null,
    role:          row.role ?? null,
    nationality:   row.nationality ?? null,
    birthYear:     row.birth_year  != null ? Number(row.birth_year)  : null,
    deathYear:     row.death_year  != null ? Number(row.death_year)  : null,
    orgType:       row.org_type ?? null,
    vesselType:    row.vessel_type ?? null,
    imoNumber:     row.imo_number ?? null,
    latitude:      row.latitude  != null ? Number(row.latitude)  : null,
    longitude:     row.longitude != null ? Number(row.longitude) : null,
    locationType:  row.location_type ?? null,
    createdAt:     _toIso(row.created_at),
    updatedAt:     _toIso(row.updated_at),
  };
}

// ── Event ─────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} EvidenceEvent
 * @property {string}      id
 * @property {string}      title
 * @property {string|null} description
 * @property {'collision'|'fire'|'rescue'|'communication'|'navigation'|'administrative'|'judicial'|'parliamentary'} eventType
 * @property {string|null} occurredAt          ISO timestamp (UTC)
 * @property {string|null} dateText            Human-readable: "22:00 circa del 10 aprile 1991"
 * @property {'exact'|'approximate'|'day'|'month'|'year'|null} datePrecision
 * @property {string|null} location
 * @property {number|null} latitude
 * @property {number|null} longitude
 * @property {string[]}    entityIds
 * @property {string[]}    sourceClaimIds
 * @property {boolean}     isDisputed
 * @property {string|null} disputeNotes
 * @property {string}      createdAt
 * @property {string}      updatedAt
 */

/**
 * @param {object} row
 * @returns {EvidenceEvent}
 */
function normalizeEvent(row) {
  return {
    id:              row.id,
    title:           row.title,
    description:     row.description ?? null,
    eventType:       row.event_type,
    occurredAt:      row.occurred_at ? _toIso(row.occurred_at) : null,
    dateText:        row.date_text ?? null,
    datePrecision:   row.date_precision ?? null,
    location:        row.location ?? null,
    latitude:        row.latitude  != null ? Number(row.latitude)  : null,
    longitude:       row.longitude != null ? Number(row.longitude) : null,
    entityIds:       row.entity_ids ?? [],
    sourceClaimIds:  row.source_claim_ids ?? [],
    isDisputed:      row.is_disputed ?? false,
    disputeNotes:    row.dispute_notes ?? null,
    createdAt:       _toIso(row.created_at),
    updatedAt:       _toIso(row.updated_at),
  };
}

// ── Claim ─────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} EvidenceClaim
 * @property {string}      id
 * @property {string}      text                The factual assertion
 * @property {'fact'|'interpretation'|'allegation'|'conclusion'|'retraction'|null} claimType
 * @property {string}      documentId
 * @property {string|null} documentUri
 * @property {string|null} chunkId
 * @property {string|null} pageReference       Human-readable: "p. 47"
 * @property {string[]}    entityIds
 * @property {string|null} eventId
 * @property {number|null} confidence          0.0–1.0
 * @property {'unverified'|'corroborated'|'challenged'|'retracted'} status
 * @property {'manual'|'llm_extracted'|'ner_model'|null} extractionMethod
 * @property {string}      createdAt
 * @property {string}      updatedAt
 */

/**
 * @param {object} row
 * @returns {EvidenceClaim}
 */
function normalizeClaim(row) {
  return {
    id:               row.id,
    text:             row.text,
    claimType:        row.claim_type ?? null,
    documentId:       row.document_id,
    documentUri:      row.document_uri ?? null,
    chunkId:          row.chunk_id ?? null,
    pageReference:    row.page_reference ?? null,
    entityIds:        row.entity_ids ?? [],
    eventId:          row.event_id ?? null,
    confidence:       row.confidence != null ? Number(row.confidence) : null,
    status:           row.status ?? 'unverified',
    extractionMethod: row.extraction_method ?? null,
    createdAt:        _toIso(row.created_at),
    updatedAt:        _toIso(row.updated_at),
  };
}

// ── EvidenceLink ──────────────────────────────────────────────────────────────

/**
 * @typedef {object} EvidenceLink
 * @property {string}      id
 * @property {string}      claimId
 * @property {string}      chunkId
 * @property {string}      documentId          Denormalized for query performance
 * @property {'supports'|'refutes'|'mentions'|'references'|'qualifies'} linkType
 * @property {number|null} strength            0.0–1.0
 * @property {string|null} note
 * @property {string}      createdAt
 */

/**
 * @param {object} row
 * @returns {EvidenceLink}
 */
function normalizeEvidenceLink(row) {
  return {
    id:         row.id,
    claimId:    row.claim_id,
    chunkId:    row.chunk_id,
    documentId: row.document_id,
    linkType:   row.link_type,
    strength:   row.strength != null ? Number(row.strength) : null,
    note:       row.note ?? null,
    createdAt:  _toIso(row.created_at),
  };
}

// ── SourceAnchor ──────────────────────────────────────────────────────────────

/**
 * @typedef {object} EvidenceSourceAnchor
 * @property {string}      id
 * @property {string}      documentId
 * @property {string|null} claimId
 * @property {string|null} eventId
 * @property {'page'|'text_span'|'timestamp'|'frame'|'shot'} anchorType
 * @property {number|null} pageNumber
 * @property {string|null} textQuote
 * @property {string|null} snippet
 * @property {number|null} timeStartSeconds
 * @property {number|null} timeEndSeconds
 * @property {string|null} frameReference
 * @property {string|null} shotReference
 * @property {number|null} confidence
 * @property {string|null} sourceUri
 * @property {string|null} mimeType
 * @property {string|null} createdAt
 * @property {string|null} updatedAt
 */

/**
 * @param {object} row
 * @returns {EvidenceSourceAnchor}
 */
function normalizeSourceAnchor(row) {
  return {
    id: row.id,
    documentId: row.document_id,
    claimId: row.claim_id ?? null,
    eventId: row.event_id ?? null,
    anchorType: row.anchor_type ?? 'text_span',
    pageNumber: row.page_number != null ? Number(row.page_number) : null,
    textQuote: row.text_quote ?? null,
    snippet: row.snippet ?? null,
    timeStartSeconds: row.time_start_seconds != null ? Number(row.time_start_seconds) : null,
    timeEndSeconds: row.time_end_seconds != null ? Number(row.time_end_seconds) : null,
    frameReference: row.frame_reference ?? null,
    shotReference: row.shot_reference ?? null,
    confidence: row.anchor_confidence != null ? Number(row.anchor_confidence) : null,
    sourceUri: row.source_uri ?? null,
    mimeType: row.mime_type ?? null,
    createdAt: row.created_at ? _toIso(row.created_at) : null,
    updatedAt: row.updated_at ? _toIso(row.updated_at) : null,
  };
}

// ── EvidenceSource ────────────────────────────────────────────────────────────

/**
 * @typedef {object} EvidenceSource
 * @property {string}      id
 * @property {string|null} claimId
 * @property {string|null} documentId
 * @property {string|null} title
 * @property {string|null} uri
 * @property {string|null} snippet
 * @property {string|null} pageReference
 * @property {string|null} mimeType
 * @property {string|null} documentType
 * @property {number|null} year
 * @property {EvidenceSourceAnchor[]} anchors
 */

/**
 * @param {object} row
 * @returns {EvidenceSource}
 */
function normalizeEvidenceSource(row) {
  const anchors = Array.isArray(row.anchors)
    ? row.anchors
        .filter(Boolean)
        .map(normalizeSourceAnchor)
    : [];

  return {
    id: row.id || row.claim_id || row.document_id || row.uri || row.title || 'source',
    claimId: row.claim_id ?? null,
    documentId: row.document_id ?? null,
    title: row.title ?? null,
    uri: row.uri ?? null,
    snippet: row.snippet ?? null,
    pageReference: row.page_reference ?? null,
    mimeType: row.mime_type ?? null,
    documentType: row.document_type ?? null,
    year: row.year != null ? Number(row.year) : null,
    anchors,
  };
}

// ── EntityProfile ─────────────────────────────────────────────────────────────

/**
 * @typedef {object} EvidenceEntityProfile
 * @property {string}      entityId
 * @property {string|null} summary
 * @property {string[]}    aliases
 * @property {string|null} role
 * @property {number|null} summaryVersion
 * @property {string|null} updatedAt
 */

/**
 * @param {object} row
 * @returns {EvidenceEntityProfile}
 */
function normalizeEntityProfile(row) {
  return {
    entityId: row.entity_id,
    summary: row.summary ?? null,
    aliases: row.aliases ?? [],
    role: row.role ?? null,
    summaryVersion: row.summary_version != null ? Number(row.summary_version) : null,
    updatedAt: row.updated_at ? _toIso(row.updated_at) : null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** BigQuery returns timestamps as Date objects or ISO strings; normalise to ISO. */
function _toIso(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object' && val.value) return val.value; // BQ BigQueryTimestamp
  return String(val);
}

module.exports = {
  normalizeDocument,
  normalizeChunk,
  normalizeEntity,
  normalizeEvent,
  normalizeClaim,
  normalizeEvidenceLink,
  normalizeSourceAnchor,
  normalizeEvidenceSource,
  normalizeEntityProfile,
};
