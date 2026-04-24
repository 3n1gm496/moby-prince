'use strict';

const path = require('path');

const bq = require('./bigquery');
const { getAccessToken } = require('./auth');
const { toDocumentId } = require('../lib/documentId');

const PROJECT = process.env.BQ_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || null;
const DATASET = process.env.BQ_DATASET_ID || 'evidence';

function isEnabled() {
  return !!PROJECT;
}

function sqlString(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function sqlTimestamp(value) {
  return value ? `TIMESTAMP(${sqlString(new Date(value).toISOString())})` : 'CURRENT_TIMESTAMP()';
}

function sqlNumber(value) {
  return Number.isFinite(value) ? String(value) : 'NULL';
}

async function resolveCanonicalDocumentId({ sourceUri, originalFilename }) {
  if (!isEnabled() || !sourceUri) return toDocumentId(originalFilename || sourceUri);

  const token = await getAccessToken();
  const res = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT}/queries`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `
        SELECT id
        FROM \`${PROJECT}.${DATASET}.documents\`
        WHERE source_uri = @sourceUri
        ORDER BY
          CASE
            WHEN vertex_document_id IS NOT NULL THEN 0
            WHEN normalized_uri IS NULL THEN 1
            ELSE 2
          END,
          created_at ASC
        LIMIT 1
      `,
      location: process.env.BQ_LOCATION || 'EU',
      timeoutMs: 30_000,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: [{
        name: 'sourceUri',
        parameterType: { type: 'STRING' },
        parameterValue: { value: sourceUri },
      }],
    }),
  });

  if (!res.ok) return toDocumentId(originalFilename || sourceUri);
  const data = await res.json();
  const id = data.rows?.[0]?.f?.[0]?.v;
  return id || toDocumentId(originalFilename || sourceUri);
}

async function upsertReprocessingMetadata({
  documentId,
  sourceUri,
  normalizedUri,
  title,
  ocrQuality,
  chunkCount,
  ingestionJobId,
  reprocessingState,
}) {
  if (!isEnabled() || !documentId) return false;

  const now = new Date().toISOString();
  const safeTitle = title || path.basename(String(sourceUri || documentId));

  const sql = `
    MERGE \`${PROJECT}.${DATASET}.documents\` AS target
    USING (
      SELECT
        CAST(${sqlString(documentId)} AS STRING) AS id,
        CAST(${sqlString(safeTitle)} AS STRING) AS title,
        CAST(${sqlString(sourceUri || null)} AS STRING) AS source_uri,
        CAST(${sqlString(normalizedUri || null)} AS STRING) AS normalized_uri,
        CAST(${sqlString(ocrQuality || null)} AS STRING) AS ocr_quality,
        CAST(${sqlNumber(chunkCount)} AS INT64) AS chunk_count,
        CAST(${sqlString(ingestionJobId || null)} AS STRING) AS ingestion_job_id,
        CAST(${sqlString(reprocessingState || null)} AS STRING) AS reprocessing_state,
        ${sqlTimestamp(now)} AS now_ts
    ) AS source
    ON target.id = source.id
    WHEN MATCHED THEN
      UPDATE SET
        title = COALESCE(target.title, source.title),
        source_uri = COALESCE(target.source_uri, source.source_uri),
        normalized_uri = source.normalized_uri,
        ocr_quality = source.ocr_quality,
        chunk_count = source.chunk_count,
        ingestion_job_id = source.ingestion_job_id,
        reprocessing_state = source.reprocessing_state,
        updated_at = source.now_ts
    WHEN NOT MATCHED THEN
      INSERT (
        id,
        vertex_document_id,
        parent_document_id,
        title,
        source_uri,
        normalized_uri,
        document_type,
        institution,
        year,
        legislature,
        topic,
        ocr_quality,
        is_split,
        chunk_count,
        word_count,
        ingested_at,
        ingestion_job_id,
        reprocessing_state,
        created_at,
        updated_at
      )
      VALUES (
        source.id,
        NULL,
        NULL,
        source.title,
        source.source_uri,
        source.normalized_uri,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        source.ocr_quality,
        FALSE,
        source.chunk_count,
        NULL,
        source.now_ts,
        source.ingestion_job_id,
        source.reprocessing_state,
        source.now_ts,
        source.now_ts
      )
  `;

  await bq.dml(sql);
  return true;
}

module.exports = { isEnabled, resolveCanonicalDocumentId, upsertReprocessingMetadata };
