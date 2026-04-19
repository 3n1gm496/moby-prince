#!/usr/bin/env node
'use strict';

/**
 * import-documents.js — Import documents into Vertex AI Search with structData
 * metadata populated.
 *
 * Usage:
 *
 *   # Import from a JSONL manifest file
 *   GOOGLE_CLOUD_PROJECT=project-fae202f2-19be-4d87-8cd \
 *   DATA_STORE_ID=<datastore-id> \
 *   node ingestion/scripts/import-documents.js --manifest ./corpus/manifest.jsonl
 *
 *   # Import all .txt files from a GCS prefix (no existing metadata)
 *   GOOGLE_CLOUD_PROJECT=project-fae202f2-19be-4d87-8cd \
 *   DATA_STORE_ID=<datastore-id> \
 *   GCS_PREFIX=gs://project-corpus-normalized/moby-prince/ \
 *   node ingestion/scripts/import-documents.js --scan-gcs
 *
 *   # Generate a manifest template from a GCS prefix (fill in metadata, then import)
 *   node ingestion/scripts/import-documents.js --gen-manifest ./corpus/manifest.jsonl
 *
 * Manifest JSONL format (one document per line):
 *   {
 *     "id": "unique-doc-id",
 *     "content": { "mimeType": "text/plain", "uri": "gs://bucket/path/file.txt" },
 *     "structData": {
 *       "document_type": "testimony",
 *       "institution": "procura_livorno",
 *       "year": 1991,
 *       "legislature": "X",
 *       "persons_mentioned": "Carlo Nardelli",
 *       "topic": "incendio",
 *       "ocr_quality": "medium"
 *     }
 *   }
 *
 * See docs/metadata-model.md for field definitions.
 */

const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const COLLECTION_ID = 'default_collection';
const BRANCH_ID     = 'default_branch';

async function main() {
  const projectId   = process.env.GOOGLE_CLOUD_PROJECT;
  const dataStoreId = process.env.DATA_STORE_ID;
  const location    = process.env.GCP_LOCATION || 'eu';
  const [,, mode, arg] = process.argv;

  if (!projectId)   die('GOOGLE_CLOUD_PROJECT is required');
  if (!dataStoreId) die('DATA_STORE_ID is required');

  console.log('\nMoby Prince — Vertex AI Search document import');
  console.log('─'.repeat(50));
  console.log(`Project:    ${projectId}`);
  console.log(`Datastore:  ${dataStoreId}`);
  console.log(`Location:   ${location}`);
  console.log('');

  switch (mode) {
    case '--manifest':   return importManifest(arg, projectId, dataStoreId, location);
    case '--gen-manifest': return genManifest(arg, projectId, dataStoreId, location);
    case '--scan-gcs':   return scanAndImport(projectId, dataStoreId, location);
    default:             return printHelp();
  }
}

// ── Import from JSONL manifest ────────────────────────────────────────────────

async function importManifest(manifestPath, projectId, dataStoreId, location) {
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    die(`Manifest file not found: ${manifestPath}`);
  }

  const lines = fs.readFileSync(manifestPath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('//'));

  console.log(`Importing ${lines.length} documents from ${manifestPath}...`);

  const token = await getAccessToken();
  const endpoint = _endpoint(location);

  let ok = 0, failed = 0;

  for (const line of lines) {
    let doc;
    try { doc = JSON.parse(line); }
    catch { console.warn(`  Skipping invalid JSON line: ${line.slice(0, 60)}`); failed++; continue; }

    const docId = doc.id || _idFromUri(doc.content?.uri || '');
    if (!docId) { console.warn('  Skipping document with no id and no content.uri'); failed++; continue; }

    const url =
      `https://${endpoint}/v1/projects/${projectId}/locations/${location}` +
      `/dataStores/${dataStoreId}/branches/${BRANCH_ID}/documents/${docId}`;

    const body = {
      id:         docId,
      structData: doc.structData || {},
      content:    doc.content    || {},
    };

    try {
      const res = await putJson(url, token, body);
      if (res.error) {
        console.warn(`  [FAIL] ${docId}: ${res.error.message}`);
        failed++;
      } else {
        console.log(`  [OK]   ${docId}`);
        ok++;
      }
    } catch (err) {
      console.warn(`  [ERR]  ${docId}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nImport complete: ${ok} succeeded, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

// ── GCS scan + import without manifest ───────────────────────────────────────

async function scanAndImport(projectId, dataStoreId, location) {
  const gcsPrefix = process.env.GCS_PREFIX;
  if (!gcsPrefix) die('GCS_PREFIX env var required for --scan-gcs');

  let storage;
  try {
    const { Storage } = require('@google-cloud/storage');
    storage = new Storage({ projectId });
  } catch {
    die('@google-cloud/storage is required for --scan-gcs. Run: npm install @google-cloud/storage');
  }

  const { bucket, name: prefix } = _parseGcsUri(gcsPrefix);
  const [files] = await storage.bucket(bucket).getFiles({ prefix });
  const txtFiles = files.filter(f => f.name.endsWith('.txt') && !f.name.endsWith('/'));

  console.log(`Found ${txtFiles.length} .txt files in ${gcsPrefix}`);
  console.log('Importing without structData metadata (metadata will be null until annotated).\n');

  const token = await getAccessToken();
  const endpoint = _endpoint(location);
  let ok = 0, failed = 0;

  for (const file of txtFiles) {
    const uri   = `gs://${bucket}/${file.name}`;
    const docId = _idFromUri(uri);
    const url   =
      `https://${endpoint}/v1/projects/${projectId}/locations/${location}` +
      `/dataStores/${dataStoreId}/branches/${BRANCH_ID}/documents/${docId}`;

    const body = {
      id:         docId,
      structData: {},
      content: { mimeType: 'text/plain', uri },
    };

    try {
      const res = await putJson(url, token, body);
      if (res.error) { console.warn(`  [FAIL] ${docId}: ${res.error.message}`); failed++; }
      else           { console.log(`  [OK]   ${docId}`); ok++; }
    } catch (err)   { console.warn(`  [ERR]  ${docId}: ${err.message}`); failed++; }
  }

  console.log(`\nImport complete: ${ok} succeeded, ${failed} failed.`);
}

// ── Generate a manifest template from GCS ────────────────────────────────────

async function genManifest(outPath, projectId, dataStoreId, location) {
  if (!outPath) die('Usage: --gen-manifest <output.jsonl>');

  const gcsPrefix = process.env.GCS_PREFIX;
  if (!gcsPrefix) die('GCS_PREFIX env var required for --gen-manifest');

  let storage;
  try {
    const { Storage } = require('@google-cloud/storage');
    storage = new Storage({ projectId });
  } catch {
    die('@google-cloud/storage is required. Run: npm install @google-cloud/storage');
  }

  const { bucket, name: prefix } = _parseGcsUri(gcsPrefix);
  const [files] = await storage.bucket(bucket).getFiles({ prefix });
  const txtFiles = files.filter(f => f.name.endsWith('.txt') && !f.name.endsWith('/'));

  console.log(`Generating manifest for ${txtFiles.length} files → ${outPath}`);

  const lines = txtFiles.map(file => {
    const uri   = `gs://${bucket}/${file.name}`;
    const docId = _idFromUri(uri);
    return JSON.stringify({
      id:      docId,
      content: { mimeType: 'text/plain', uri },
      structData: {
        document_type:     '',
        institution:       '',
        year:              null,
        legislature:       '',
        persons_mentioned: '',
        topic:             '',
        ocr_quality:       'medium',
      },
    });
  });

  fs.writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`\nManifest written to ${outPath}`);
  console.log('Fill in the structData fields for each document, then run:');
  console.log(`  node ingestion/scripts/import-documents.js --manifest ${outPath}`);
}

// ── Auth + HTTP helpers ───────────────────────────────────────────────────────

async function getAccessToken() {
  try {
    const { GoogleAuth } = require('google-auth-library');
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const client = await auth.getClient();
    const { token } = await client.getAccessToken();
    if (token) return token;
  } catch { /* fall through */ }

  try {
    const { execSync } = require('child_process');
    return execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
  } catch {
    die('No GCP credentials. Run: gcloud auth application-default login');
  }
}

function putJson(url, token, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ _raw: data, statusCode: res.statusCode }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function _endpoint(location) {
  return location === 'global'
    ? 'discoveryengine.googleapis.com'
    : `${location}-discoveryengine.googleapis.com`;
}

function _parseGcsUri(uri) {
  const m = uri.match(/^gs:\/\/([^/]+)\/(.*)$/);
  if (!m) throw new Error(`Invalid GCS URI: ${uri}`);
  return { bucket: m[1], name: m[2] };
}

function _idFromUri(uri) {
  const base = path.basename(uri, path.extname(uri));
  return base.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 63) +
    '-' + crypto.createHash('sha1').update(uri).digest('hex').slice(0, 8);
}

function printHelp() {
  console.log(`
Usage:
  node ingestion/scripts/import-documents.js <mode> [arg]

Modes:
  --manifest <file.jsonl>    Import documents from a JSONL manifest
  --scan-gcs                 Import all .txt files from GCS_PREFIX (no metadata)
  --gen-manifest <file.jsonl> Generate a manifest template from GCS_PREFIX

Environment:
  GOOGLE_CLOUD_PROJECT       GCP project ID (required)
  DATA_STORE_ID              Vertex AI Search datastore ID (required)
  GCS_PREFIX                 gs://bucket/prefix/ for GCS scan/manifest modes
  GCP_LOCATION               API location (default: eu)
`);
}

function die(msg) {
  process.stderr.write(msg + '\n');
  process.exit(1);
}

main().catch(err => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
