#!/usr/bin/env node
'use strict';

const { getAccessToken } = require('../services/auth');
const { insert, dml } = require('../services/bigquery');

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const DATASET = process.env.BQ_DATASET_ID || 'evidence';
const LOCATION = process.env.BQ_LOCATION || 'EU';
const REPLACE = process.argv.includes('--replace');

if (!PROJECT) {
  console.error('GOOGLE_CLOUD_PROJECT non impostato.');
  process.exit(1);
}

async function query(sql) {
  const token = await getAccessToken();
  const res = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT}/queries`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: sql,
      location: LOCATION,
      timeoutMs: 60000,
      useLegacySql: false,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`BQ query failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const fields = data.schema?.fields || [];
  return (data.rows || []).map((row) =>
    Object.fromEntries(fields.map((field, index) => [field.name, row.f[index]?.v ?? null])),
  );
}

function inferMimeType(uri) {
  const lower = String(uri || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (/\.(png|jpg|jpeg|gif|webp|bmp)$/i.test(lower)) return 'image/*';
  if (/\.(mp4|mov|mpeg|mpg|webm|avi)$/i.test(lower)) return 'video/*';
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(lower)) return 'audio/*';
  return null;
}

async function main() {
  if (REPLACE) {
    await dml(`DELETE FROM \`${DATASET}.source_anchors\` WHERE TRUE`);
  }

  const rows = await query(`
    SELECT id, document_id, document_uri, text, page_reference, created_at, updated_at
    FROM \`${PROJECT}.${DATASET}.claims\`
    ORDER BY created_at ASC
  `);

  const anchors = [];
  for (const row of rows) {
    const snippet = String(row.text || '').slice(0, 500);
    const pageMatch = String(row.page_reference || '').match(/(\d{1,4})/);
    const pageNumber = pageMatch ? Number(pageMatch[1]) : null;
    if (pageNumber != null) {
      anchors.push({
        id: `${row.id}-page`,
        document_id: row.document_id,
        claim_id: row.id,
        event_id: null,
        anchor_type: 'page',
        page_number: pageNumber,
        text_quote: null,
        snippet,
        time_start_seconds: null,
        time_end_seconds: null,
        frame_reference: null,
        shot_reference: null,
        anchor_confidence: 0.75,
        source_uri: row.document_uri || null,
        mime_type: inferMimeType(row.document_uri),
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }
    if (snippet) {
      anchors.push({
        id: `${row.id}-text`,
        document_id: row.document_id,
        claim_id: row.id,
        event_id: null,
        anchor_type: 'text_span',
        page_number: pageNumber,
        text_quote: snippet,
        snippet,
        time_start_seconds: null,
        time_end_seconds: null,
        frame_reference: null,
        shot_reference: null,
        anchor_confidence: 0.55,
        source_uri: row.document_uri || null,
        mime_type: inferMimeType(row.document_uri),
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
    }
  }

  for (let i = 0; i < anchors.length; i += 500) {
    await insert('source_anchors', anchors.slice(i, i + 500));
  }

  console.log(`Anchor scritti: ${anchors.length}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
