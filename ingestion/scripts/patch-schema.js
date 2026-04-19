#!/usr/bin/env node
'use strict';

/**
 * patch-schema.js — Apply the metadata structSchema to the Vertex AI Search
 * datastore so all 7 corpus metadata fields become filterable, indexable,
 * and retrievable.
 *
 * Usage (from Cloud Shell or any machine with GCP credentials):
 *
 *   GOOGLE_CLOUD_PROJECT=project-fae202f2-19be-4d87-8cd \
 *   DATA_STORE_ID=<your-datastore-id> \
 *   node ingestion/scripts/patch-schema.js
 *
 * After this succeeds:
 *   1. Re-import documents with structData (run import-documents.js).
 *   2. Set available: true in backend/filters/schema.js and
 *      frontend/src/filters/schema.js.
 *
 * See docs/metadata-model.md for the full field taxonomy.
 */

const https = require('https');

async function main() {
  const projectId   = process.env.GOOGLE_CLOUD_PROJECT;
  const dataStoreId = process.env.DATA_STORE_ID;
  const location    = process.env.GCP_LOCATION || 'eu';

  if (!projectId)   die('GOOGLE_CLOUD_PROJECT is required');
  if (!dataStoreId) die('DATA_STORE_ID is required');

  console.log('\nMoby Prince — Vertex AI Search schema patch');
  console.log('─'.repeat(50));
  console.log(`Project:    ${projectId}`);
  console.log(`Datastore:  ${dataStoreId}`);
  console.log(`Location:   ${location}`);
  console.log('');

  const token = await getAccessToken();

  // Full structSchema — mirrors docs/metadata-model.md
  const body = {
    structSchema: {
      properties: {
        document_type: {
          type: 'string',
          indexable: true,
          filterable: true,
          retrievable: true,
        },
        institution: {
          type: 'string',
          indexable: true,
          filterable: true,
          retrievable: true,
        },
        year: {
          type: 'integer',
          indexable: true,
          filterable: true,
          retrievable: true,
        },
        legislature: {
          type: 'string',
          indexable: true,
          filterable: true,
          retrievable: true,
        },
        persons_mentioned: {
          type: 'string',
          keyPropertyMapping: 'description',
          indexable: true,
          filterable: true,
          retrievable: true,
        },
        topic: {
          type: 'string',
          indexable: true,
          filterable: true,
          retrievable: true,
        },
        ocr_quality: {
          type: 'string',
          indexable: false,
          filterable: true,
          retrievable: true,
        },
      },
    },
  };

  const endpoint = location === 'global'
    ? 'discoveryengine.googleapis.com'
    : `${location}-discoveryengine.googleapis.com`;

  const url =
    `https://${endpoint}/v1/projects/${projectId}/locations/${location}` +
    `/dataStores/${dataStoreId}/schema/default_schema` +
    `?updateMask=structSchema`;

  console.log(`PATCH ${url}\n`);

  const response = await patchJson(url, token, body);

  if (response.error) {
    console.error('API error:');
    console.error(JSON.stringify(response.error, null, 2));
    process.exit(1);
  }

  console.log('Schema patch successful.\n');
  console.log('Response:');
  console.log(JSON.stringify(response, null, 2));
  console.log('');
  console.log('Next steps:');
  console.log('  1. Annotate documents and run:');
  console.log('     node ingestion/scripts/import-documents.js');
  console.log('  2. Set available: true in backend/filters/schema.js');
  console.log('     and frontend/src/filters/schema.js');
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function getAccessToken() {
  // 1. google-auth-library (installed in Cloud Run / locally with npm install)
  try {
    const { GoogleAuth } = require('google-auth-library');
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const client = await auth.getClient();
    const { token } = await client.getAccessToken();
    if (token) return token;
  } catch { /* fall through */ }

  // 2. GCE / Cloud Run metadata server
  try {
    return await _metadataToken();
  } catch { /* fall through */ }

  // 3. gcloud CLI fallback (works in Cloud Shell)
  try {
    const { execSync } = require('child_process');
    return execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
  } catch {
    die('No GCP credentials found. Run: gcloud auth application-default login');
  }
}

function _metadataToken() {
  return new Promise((resolve, reject) => {
    const req = https.get({
      hostname: 'metadata.google.internal',
      path: '/computeMetadata/v1/instance/service-accounts/default/token',
      headers: { 'Metadata-Flavor': 'Google' },
      timeout: 2000,
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data).access_token); }
        catch { reject(new Error('Bad metadata response')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Metadata timeout')); });
  });
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function patchJson(url, token, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'PATCH',
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

function die(msg) {
  process.stderr.write(msg + '\n');
  process.exit(1);
}

main().catch(err => {
  process.stderr.write(`Error: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
