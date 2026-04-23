#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

loadEnv(path.join(__dirname, '../backend/.env'));

const { getAccessToken } = require('../backend/services/auth');
const ingestionConfig = require('../ingestion/config');

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.BQ_PROJECT_ID;
const LOCATION = String(process.env.GCS_LOCATION || process.env.GCP_LOCATION || 'EU').toUpperCase();
const CREATE_MISSING = process.argv.includes('--create-missing');
const FORMAT = valueOf('--format', 'text');
const OUTPUT = valueOf('--output', '');

if (!PROJECT) {
  console.error('GOOGLE_CLOUD_PROJECT non impostato.');
  process.exit(1);
}

async function main() {
  const bucketPlan = [
    { role: 'raw', name: ingestionConfig.buckets.raw, shouldExist: true, createIfMissing: false },
    { role: 'normalized', name: ingestionConfig.buckets.normalized, shouldExist: true, createIfMissing: true },
    { role: 'quarantine', name: ingestionConfig.buckets.quarantine, shouldExist: true, createIfMissing: true },
  ];

  const buckets = [];
  for (const item of bucketPlan) {
    if (!item.name) {
      buckets.push({ ...item, exists: false, status: 'missing_config' });
      continue;
    }

    const metadata = await getBucket(item.name).catch((err) => {
      if (err.code === 404) return null;
      throw err;
    });

    if (metadata) {
      buckets.push({
        ...item,
        exists: true,
        location: metadata.location || null,
        storageClass: metadata.storageClass || null,
        status: 'exists',
      });
      continue;
    }

    if (CREATE_MISSING && item.createIfMissing) {
      const created = await createBucket(item.name, LOCATION);
      buckets.push({
        ...item,
        exists: true,
        location: created.location || LOCATION,
        storageClass: created.storageClass || 'STANDARD',
        status: 'created',
      });
      continue;
    }

    buckets.push({ ...item, exists: false, status: item.shouldExist ? 'missing' : 'optional_missing' });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    project: PROJECT,
    location: LOCATION,
    docaiConfigured: {
      processorId: process.env.DOCAI_PROCESSOR_ID || null,
      layoutProcessorId: process.env.DOCAI_LAYOUT_PROCESSOR_ID || null,
      forceAllPdfs: ingestionConfig.docai?.forceAllPdfs === true,
      availableProcessors: await listProcessors(process.env.DOCAI_LOCATION || process.env.GCP_LOCATION || 'eu'),
    },
    buckets,
    recommendedEnv: {
      BUCKET_RAW: ingestionConfig.buckets.raw || null,
      BUCKET_NORMALIZED: ingestionConfig.buckets.normalized || null,
      BUCKET_QUARANTINE: ingestionConfig.buckets.quarantine || null,
      DOCAI_FORCE_ALL_PDFS: 'true',
    },
  };

  const rendered = render(report, FORMAT);
  if (OUTPUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUTPUT)), { recursive: true });
    fs.writeFileSync(path.resolve(OUTPUT), rendered, 'utf8');
  }
  process.stdout.write(rendered);
}

async function getBucket(bucketName) {
  const token = await getAccessToken();
  const res = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucketName}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) {
    const error = new Error(`Bucket ${bucketName} not found`);
    error.code = 404;
    throw error;
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Bucket lookup failed for ${bucketName} (${res.status}): ${detail.slice(0, 200)}`);
  }
  return res.json();
}

async function createBucket(bucketName, location) {
  const token = await getAccessToken();
  const res = await fetch(`https://storage.googleapis.com/storage/v1/b?project=${encodeURIComponent(PROJECT)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: bucketName,
      location,
      storageClass: 'STANDARD',
      iamConfiguration: {
        uniformBucketLevelAccess: { enabled: true },
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Bucket creation failed for ${bucketName} (${res.status}): ${detail.slice(0, 300)}`);
  }
  return res.json();
}

async function listProcessors(location) {
  const loc = String(location || 'eu').toLowerCase();
  const token = await getAccessToken();
  const res = await fetch(`https://${loc}-documentai.googleapis.com/v1/projects/${PROJECT}/locations/${loc}/processors`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return [{ error: `Document AI list failed (${res.status}): ${detail.slice(0, 160)}` }];
  }
  const data = await res.json();
  return (data.processors || []).map((processor) => ({
    name: processor.name || null,
    type: processor.type || null,
    displayName: processor.displayName || null,
    state: processor.state || null,
  }));
}

function render(report, format) {
  if (format === 'json') return `${JSON.stringify(report, null, 2)}\n`;
  if (format === 'markdown' || format === 'md') {
    return [
      '# Normalized Layer Provisioning',
      '',
      `Generato: ${report.generatedAt}`,
      '',
      `- progetto: \`${report.project}\``,
      `- location: \`${report.location}\``,
      '',
      '## Buckets',
      '',
      '| Role | Bucket | Status | Location | Storage class |',
      '|---|---|---|---|---|',
      ...report.buckets.map((bucket) =>
        `| ${bucket.role} | ${bucket.name || 'n/a'} | ${bucket.status} | ${bucket.location || 'n/a'} | ${bucket.storageClass || 'n/a'} |`),
      '',
      '## Document AI',
      '',
      '| Check | Value |',
      '|---|---|',
      `| DOCAI_PROCESSOR_ID | ${report.docaiConfigured.processorId || 'n/a'} |`,
      `| DOCAI_LAYOUT_PROCESSOR_ID | ${report.docaiConfigured.layoutProcessorId || 'n/a'} |`,
      `| DOCAI_FORCE_ALL_PDFS | ${report.docaiConfigured.forceAllPdfs} |`,
      '',
      '## Available Processors',
      '',
      '```json',
      JSON.stringify(report.docaiConfigured.availableProcessors || [], null, 2),
      '```',
      '',
      '## Recommended Env',
      '',
      '```bash',
      ...Object.entries(report.recommendedEnv).map(([key, value]) => `${key}=${value || ''}`),
      '```',
      '',
    ].join('\n');
  }

  return [
    `Normalized layer provisioning — ${report.generatedAt}`,
    `project: ${report.project}`,
    `location: ${report.location}`,
    '',
    ...report.buckets.map((bucket) => `- ${bucket.role}: ${bucket.name || 'n/a'} [${bucket.status}]`),
    '',
    `DOCAI_PROCESSOR_ID: ${report.docaiConfigured.processorId || 'n/a'}`,
    `DOCAI_LAYOUT_PROCESSOR_ID: ${report.docaiConfigured.layoutProcessorId || 'n/a'}`,
    `DOCAI_FORCE_ALL_PDFS: ${report.docaiConfigured.forceAllPdfs}`,
    `availableProcessors: ${JSON.stringify(report.docaiConfigured.availableProcessors || [])}`,
    '',
  ].join('\n');
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
