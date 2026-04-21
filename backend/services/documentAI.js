'use strict';

/**
 * Document AI REST client for the backend server.
 *
 * Used for on-demand (synchronous) document processing via the Layout Parser.
 * The ingestion pipeline uses its own @google-cloud/documentai SDK client for
 * batch processing; this module is for query-time enrichment and the storage
 * route re-processing trigger.
 *
 * Required env vars:
 *   GOOGLE_CLOUD_PROJECT        GCP project ID (sourced from config)
 *   DOCAI_LAYOUT_PROCESSOR_ID   Layout Parser processor ID
 *   DOCAI_LOCATION              Document AI region (default: eu)
 */

const config = require('../config');
const { getAccessToken } = require('./auth');

const DOCAI_LOCATION = process.env.DOCAI_LOCATION || config.location || 'eu';

/**
 * Synchronously process a GCS document with the Layout Parser.
 * Returns the Document AI Document JSON.
 *
 * Suitable for documents up to ~15 MB. Use the ingestion batch API for larger
 * PDFs (the ingestion worker already handles that path).
 *
 * @param {string} gcsUri        gs://bucket/path/to/file.pdf
 * @param {string} processorId   Layout Parser processor ID
 * @returns {Promise<object>}    Document AI Document JSON (doc.pages, doc.text, doc.documentLayout, …)
 */
async function processDocument(gcsUri, processorId) {
  const token    = await getAccessToken();
  const endpoint =
    `https://${DOCAI_LOCATION}-documentai.googleapis.com/v1/projects/${config.projectId}` +
    `/locations/${DOCAI_LOCATION}/processors/${processorId}:process`;

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      gcsDocument: { gcsUri, mimeType: 'application/pdf' },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Document AI HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.document;
}

/**
 * Calculate OCR quality from per-token confidence scores.
 *
 * @param {object} docJson   Document AI Document JSON
 * @returns {'high'|'medium'|'low'|null}
 */
function calcOcrQuality(docJson) {
  const confs = [];
  for (const page of (docJson.pages || [])) {
    for (const token of (page.tokens || [])) {
      const c = token.layout?.confidence;
      if (typeof c === 'number') confs.push(c);
    }
  }
  if (confs.length === 0) return null;
  const avg = confs.reduce((s, v) => s + v, 0) / confs.length;
  return avg > 0.9 ? 'high' : avg > 0.7 ? 'medium' : 'low';
}

/**
 * Classify document layout from block structure.
 * Handles both Layout Parser format (documentLayout.blocks) and OCR format
 * (pages[].blocks[]).
 *
 * @param {object} docJson   Document AI Document JSON
 * @returns {'prose'|'structured'|'table_heavy'}
 */
function classifyLayoutType(docJson) {
  let tables = 0, headings = 0, other = 0;

  if (docJson.documentLayout?.blocks) {
    for (const blk of docJson.documentLayout.blocks) {
      if (blk.tableBlock)                                    tables++;
      else if (blk.textBlock?.type?.startsWith('heading'))   headings++;
      else                                                   other++;
    }
  } else {
    for (const page of (docJson.pages || [])) {
      for (const block of (page.blocks || [])) {
        const t = block.layout?.blockType || '';
        if (t.includes('TABLE'))                                  tables++;
        else if (t.includes('HEADING') || t.includes('TITLE'))   headings++;
        else                                                      other++;
      }
    }
  }

  const total = tables + headings + other || 1;
  if (tables / total > 0.2)   return 'table_heavy';
  if (headings / total > 0.1) return 'structured';
  return 'prose';
}

module.exports = { processDocument, calcOcrQuality, classifyLayoutType };
