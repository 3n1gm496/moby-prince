#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

loadEnv(path.join(__dirname, '../backend/.env'));

const { getAccessToken } = require('../backend/services/auth');
const bq = require('../backend/services/bigquery');
const de = require('../backend/services/discoveryEngine');

const PROJECT = process.env.BQ_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const DATASET = process.env.BQ_DATASET_ID || 'evidence';
const BUCKET = process.env.BUCKET_RAW || process.env.GCS_BUCKET;
const FORMAT = valueOf('--format', 'text');
const OUTPUT = valueOf('--output', '');
const JSON_OUTPUT = valueOf('--json-output', '');

if (!PROJECT || !BUCKET) {
  console.error('GOOGLE_CLOUD_PROJECT/BQ_PROJECT_ID e GCS_BUCKET sono obbligatori.');
  process.exit(1);
}

async function main() {
  const [objects, bqDocuments, deDocuments] = await Promise.all([
    listAllBucketObjects(BUCKET),
    listBqDocuments(),
    listDeDocuments(),
  ]);

  const bqByUri = new Map(bqDocuments.map((doc) => [doc.source_uri, doc]));
  const deByUri = new Map(deDocuments.map((doc) => [doc.uri, doc]));

  const inventory = objects.map((object) => buildInventoryRow(object, bqByUri.get(object.uri), deByUri.get(object.uri)));
  const counts = summarize(inventory, bqDocuments, deDocuments);

  const report = {
    generatedAt: new Date().toISOString(),
    project: PROJECT,
    dataset: DATASET,
    bucket: BUCKET,
    counts,
    highlights: {
      legacyCandidates: inventory.filter((row) => row.classification === 'legacy').slice(0, 20),
      orphanCandidates: inventory.filter((row) => row.classification === 'orphan').slice(0, 20),
      bqOnlyDocuments: bqDocuments.filter((doc) => !deByUri.has(doc.source_uri)).slice(0, 20),
      deOnlyDocuments: deDocuments.filter((doc) => !bqByUri.has(doc.uri)).slice(0, 20),
    },
    inventory,
  };

  const rendered = render(report, FORMAT);
  if (OUTPUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUTPUT)), { recursive: true });
    fs.writeFileSync(path.resolve(OUTPUT), rendered, 'utf8');
  }
  if (JSON_OUTPUT) {
    fs.mkdirSync(path.dirname(path.resolve(JSON_OUTPUT)), { recursive: true });
    fs.writeFileSync(path.resolve(JSON_OUTPUT), JSON.stringify(report, null, 2), 'utf8');
  }
  process.stdout.write(rendered);
}

function buildInventoryRow(object, bqDocument, deDocument) {
  const ext = extensionOf(object.name);
  const classification = classifyObject(object.name, ext, Boolean(bqDocument), Boolean(deDocument));
  return {
    uri: object.uri,
    path: object.name,
    ext,
    sizeBytes: object.size ? Number(object.size) : null,
    classification,
    inBigQuery: Boolean(bqDocument),
    inDiscoveryEngine: Boolean(deDocument),
    documentId: bqDocument?.id || null,
    documentType: bqDocument?.document_type || null,
    title: bqDocument?.title || deDocument?.title || basenameWithoutExt(object.name),
    vertexDocumentId: deDocument?.id || bqDocument?.vertex_document_id || null,
  };
}

function classifyObject(name, ext, inBigQuery, inDiscoveryEngine) {
  if (name.endsWith('/')) return 'supporting';
  if (name.startsWith('_timeline/')) return 'legacy';
  if ((ext === 'pdf' || ext === 'txt') && (inBigQuery || inDiscoveryEngine)) return 'corpus';
  if (ext === 'json' || ext === 'jsonl' || ext === 'csv') return 'supporting';
  if (inBigQuery || inDiscoveryEngine) return 'corpus';
  return 'orphan';
}

function summarize(inventory, bqDocuments, deDocuments) {
  const byClassification = {};
  for (const row of inventory) byClassification[row.classification] = (byClassification[row.classification] || 0) + 1;

  return {
    bucketObjects: inventory.length,
    bigQueryDocuments: bqDocuments.length,
    discoveryEngineDocuments: deDocuments.length,
    matchedAcrossAllThree: inventory.filter((row) => row.inBigQuery && row.inDiscoveryEngine).length,
    bucketOnly: inventory.filter((row) => !row.inBigQuery && !row.inDiscoveryEngine).length,
    bqOnly: bqDocuments.filter((doc) => !inventory.some((row) => row.uri === doc.source_uri && row.inDiscoveryEngine)).length,
    deOnly: deDocuments.filter((doc) => !inventory.some((row) => row.uri === doc.uri && row.inBigQuery)).length,
    classifications: byClassification,
  };
}

async function listBqDocuments() {
  return bq.query(`
    SELECT id, vertex_document_id, title, source_uri, document_type
    FROM \`${PROJECT}.${DATASET}.documents\`
    ORDER BY source_uri
  `);
}

async function listDeDocuments() {
  const docs = [];
  let pageToken = null;
  do {
    const data = await de.listDocuments(pageToken, 100);
    for (const doc of (data.documents || [])) {
      const uri = doc.content?.uri || null;
      const parts = (doc.name || '').split('/');
      docs.push({
        id: parts[parts.length - 1] || null,
        uri,
        title: doc.structData?.title || null,
      });
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return docs.filter((doc) => doc.uri);
}

async function listAllBucketObjects(bucket) {
  const objects = [];
  let pageToken = null;
  do {
    const data = await listBucketObjects(bucket, pageToken);
    for (const item of (data.items || [])) {
      objects.push({
        name: item.name,
        uri: `gs://${bucket}/${item.name}`,
        size: item.size || null,
      });
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return objects.sort((a, b) => a.name.localeCompare(b.name));
}

async function listBucketObjects(bucket, pageToken = null) {
  const token = await getAccessToken();
  const params = new URLSearchParams({
    maxResults: '1000',
    projection: 'noAcl',
    fields: 'nextPageToken,items(name,size)',
  });
  if (pageToken) params.set('pageToken', pageToken);
  const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`GCS list failed for ${bucket} (${res.status}): ${detail.slice(0, 200)}`);
  }
  return res.json();
}

function render(report, format) {
  if (format === 'json') return `${JSON.stringify(report, null, 2)}\n`;
  if (format === 'markdown' || format === 'md') {
    return [
      '# Corpus Inventory',
      '',
      `Generato: ${report.generatedAt}`,
      '',
      `- bucket: \`${report.bucket}\``,
      `- dataset: \`${report.project}.${report.dataset}\``,
      '',
      '## Summary',
      '',
      '| Check | Value |',
      '|---|---:|',
      `| bucketObjects | ${report.counts.bucketObjects} |`,
      `| bigQueryDocuments | ${report.counts.bigQueryDocuments} |`,
      `| discoveryEngineDocuments | ${report.counts.discoveryEngineDocuments} |`,
      `| matchedAcrossAllThree | ${report.counts.matchedAcrossAllThree} |`,
      `| bucketOnly | ${report.counts.bucketOnly} |`,
      `| bqOnly | ${report.counts.bqOnly} |`,
      `| deOnly | ${report.counts.deOnly} |`,
      ...Object.entries(report.counts.classifications).map(([key, value]) => `| classification:${key} | ${value} |`),
      '',
      '## Legacy Candidates',
      '',
      '```json',
      JSON.stringify(report.highlights.legacyCandidates, null, 2),
      '```',
      '',
      '## Orphan Candidates',
      '',
      '```json',
      JSON.stringify(report.highlights.orphanCandidates, null, 2),
      '```',
      '',
      '## BQ Only Documents',
      '',
      '```json',
      JSON.stringify(report.highlights.bqOnlyDocuments, null, 2),
      '```',
      '',
      '## DE Only Documents',
      '',
      '```json',
      JSON.stringify(report.highlights.deOnlyDocuments, null, 2),
      '```',
      '',
    ].join('\n');
  }

  return [
    `Corpus inventory — ${report.generatedAt}`,
    `bucket: ${report.bucket}`,
    `dataset: ${report.project}.${report.dataset}`,
    '',
    `bucketObjects: ${report.counts.bucketObjects}`,
    `bigQueryDocuments: ${report.counts.bigQueryDocuments}`,
    `discoveryEngineDocuments: ${report.counts.discoveryEngineDocuments}`,
    `matchedAcrossAllThree: ${report.counts.matchedAcrossAllThree}`,
    `bucketOnly: ${report.counts.bucketOnly}`,
    `bqOnly: ${report.counts.bqOnly}`,
    `deOnly: ${report.counts.deOnly}`,
    ...Object.entries(report.counts.classifications).map(([key, value]) => `classification:${key}: ${value}`),
    '',
  ].join('\n');
}

function extensionOf(name) {
  const idx = name.lastIndexOf('.');
  return idx === -1 ? '' : name.slice(idx + 1).toLowerCase();
}

function basenameWithoutExt(name) {
  return path.basename(name).replace(/\.[^.]+$/, '');
}

function valueOf(flag, fallback) {
  const arg = process.argv.slice(2).find((item) => item.startsWith(`${flag}=`));
  return arg ? arg.slice(flag.length + 1) : fallback;
}

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
