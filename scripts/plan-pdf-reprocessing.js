#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

loadEnv(path.join(__dirname, '../backend/.env'));

const ingestionConfig = require('../ingestion/config');

const FORMAT = valueOf('--format', 'text');
const OUTPUT = valueOf('--output', '');
const INVENTORY_PATH = valueOf(
  '--inventory',
  path.join(__dirname, '../docs/reports/corpus-inventory-latest.json'),
);

async function main() {
  if (!fs.existsSync(INVENTORY_PATH)) {
    throw new Error(`Inventory file non trovato: ${INVENTORY_PATH}`);
  }

  const report = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
  const inventory = Array.isArray(report.inventory) ? report.inventory : [];
  const pdfCorpus = inventory.filter((row) => row.classification === 'corpus' && row.ext === 'pdf');
  const txtCorpus = inventory.filter((row) => row.classification === 'corpus' && row.ext === 'txt');

  const plan = {
    generatedAt: new Date().toISOString(),
    inventoryGeneratedAt: report.generatedAt || null,
    bucket: report.bucket || ingestionConfig.buckets.raw,
    corpusPdfDocuments: pdfCorpus.length,
    corpusTxtDocuments: txtCorpus.length,
    supportingObjects: inventory.filter((row) => row.classification === 'supporting').length,
    legacyObjects: inventory.filter((row) => row.classification === 'legacy').length,
    recommendedEnv: {
      BUCKET_RAW: ingestionConfig.buckets.raw || '',
      BUCKET_NORMALIZED: ingestionConfig.buckets.normalized || '',
      BUCKET_QUARANTINE: ingestionConfig.buckets.quarantine || '',
      DOCAI_FORCE_ALL_PDFS: 'true',
      DOCAI_PROCESSOR_ID: process.env.DOCAI_PROCESSOR_ID || '',
      DOCAI_LAYOUT_PROCESSOR_ID: process.env.DOCAI_LAYOUT_PROCESSOR_ID || '',
    },
    command: [
      'DOCAI_FORCE_ALL_PDFS=true',
      `BUCKET_RAW=${ingestionConfig.buckets.raw || ''}`,
      `BUCKET_NORMALIZED=${ingestionConfig.buckets.normalized || ''}`,
      `BUCKET_QUARANTINE=${ingestionConfig.buckets.quarantine || ''}`,
      'node ingestion/cloudrun/entrypoint.js scan',
      `gs://${report.bucket || ingestionConfig.buckets.raw}/`,
    ].join(' '),
    firstDocuments: pdfCorpus.slice(0, 20).map((row) => ({
      uri: row.uri,
      title: row.title,
      documentId: row.documentId,
    })),
  };

  const rendered = render(plan, FORMAT);
  if (OUTPUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUTPUT)), { recursive: true });
    fs.writeFileSync(path.resolve(OUTPUT), rendered, 'utf8');
  }
  process.stdout.write(rendered);
}

function render(plan, format) {
  if (format === 'json') return `${JSON.stringify(plan, null, 2)}\n`;
  if (format === 'markdown' || format === 'md') {
    return [
      '# PDF Reprocessing Plan',
      '',
      `Generato: ${plan.generatedAt}`,
      '',
      `- inventoryGeneratedAt: \`${plan.inventoryGeneratedAt}\``,
      `- bucket: \`${plan.bucket}\``,
      `- corpusPdfDocuments: \`${plan.corpusPdfDocuments}\``,
      `- corpusTxtDocuments: \`${plan.corpusTxtDocuments}\``,
      `- supportingObjects: \`${plan.supportingObjects}\``,
      `- legacyObjects: \`${plan.legacyObjects}\``,
      '',
      '## Recommended Env',
      '',
      '```bash',
      ...Object.entries(plan.recommendedEnv).map(([key, value]) => `${key}=${value}`),
      '```',
      '',
      '## Recommended Command',
      '',
      '```bash',
      plan.command,
      '```',
      '',
      '## First Documents',
      '',
      '```json',
      JSON.stringify(plan.firstDocuments, null, 2),
      '```',
      '',
    ].join('\n');
  }

  return [
    `PDF reprocessing plan — ${plan.generatedAt}`,
    `bucket: ${plan.bucket}`,
    `corpusPdfDocuments: ${plan.corpusPdfDocuments}`,
    `corpusTxtDocuments: ${plan.corpusTxtDocuments}`,
    `supportingObjects: ${plan.supportingObjects}`,
    `legacyObjects: ${plan.legacyObjects}`,
    '',
    `command: ${plan.command}`,
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
