#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

loadEnv(path.join(__dirname, '../backend/.env'));

const { getAccessToken } = require('../backend/services/auth');

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.BQ_PROJECT_ID;
const LOCATION = String(process.env.DOCAI_LOCATION || process.env.GCP_LOCATION || 'eu').toLowerCase();
const CREATE_MISSING = process.argv.includes('--create-missing');
const FORMAT = valueOf('--format', 'text');
const OUTPUT = valueOf('--output', '');

if (!PROJECT) {
  console.error('GOOGLE_CLOUD_PROJECT non impostato.');
  process.exit(1);
}

async function main() {
  const before = await listProcessors();
  const actions = [];

  const existingOcr = before.find((processor) => processor.type === 'OCR_PROCESSOR');
  const existingLayout = before.find((processor) => processor.type === 'LAYOUT_PARSER_PROCESSOR');

  if (CREATE_MISSING && !existingOcr) {
    const created = await createProcessor('moby-prince-ocr', 'OCR_PROCESSOR');
    actions.push({ action: 'created', type: 'OCR_PROCESSOR', processor: summarize(created) });
  }
  if (CREATE_MISSING && !existingLayout) {
    const created = await createProcessor('moby-prince-layout', 'LAYOUT_PARSER_PROCESSOR');
    actions.push({ action: 'created', type: 'LAYOUT_PARSER_PROCESSOR', processor: summarize(created) });
  }

  const after = await listProcessors();
  const ocr = after.find((processor) => processor.type === 'OCR_PROCESSOR') || null;
  const layout = after.find((processor) => processor.type === 'LAYOUT_PARSER_PROCESSOR') || null;

  const report = {
    generatedAt: new Date().toISOString(),
    project: PROJECT,
    location: LOCATION,
    before: before.map(summarize),
    actions,
    after: after.map(summarize),
    recommendedEnv: {
      DOCAI_LOCATION: LOCATION,
      DOCAI_PROCESSOR_ID: processorIdOf(ocr),
      DOCAI_LAYOUT_PROCESSOR_ID: processorIdOf(layout),
    },
  };

  const rendered = render(report, FORMAT);
  if (OUTPUT) {
    fs.mkdirSync(path.dirname(path.resolve(OUTPUT)), { recursive: true });
    fs.writeFileSync(path.resolve(OUTPUT), rendered, 'utf8');
  }
  process.stdout.write(rendered);
}

async function listProcessors() {
  const token = await getAccessToken();
  const res = await fetch(`https://${LOCATION}-documentai.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}/processors`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Document AI list processors failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.processors || [];
}

async function createProcessor(displayName, type) {
  const token = await getAccessToken();
  const res = await fetch(`https://${LOCATION}-documentai.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}/processors`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      displayName,
      type,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Document AI create processor failed for ${type} (${res.status}): ${detail.slice(0, 300)}`);
  }
  return res.json();
}

function summarize(processor) {
  return {
    name: processor.name || null,
    type: processor.type || null,
    displayName: processor.displayName || null,
    state: processor.state || null,
  };
}

function processorIdOf(processor) {
  if (!processor?.name) return '';
  const parts = processor.name.split('/');
  return parts[parts.length - 1] || '';
}

function render(report, format) {
  if (format === 'json') return `${JSON.stringify(report, null, 2)}\n`;
  if (format === 'markdown' || format === 'md') {
    return [
      '# Document AI Processor Provisioning',
      '',
      `Generato: ${report.generatedAt}`,
      '',
      `- progetto: \`${report.project}\``,
      `- location: \`${report.location}\``,
      '',
      '## Actions',
      '',
      '```json',
      JSON.stringify(report.actions, null, 2),
      '```',
      '',
      '## Processors',
      '',
      '```json',
      JSON.stringify(report.after, null, 2),
      '```',
      '',
      '## Recommended Env',
      '',
      '```bash',
      ...Object.entries(report.recommendedEnv).map(([key, value]) => `${key}=${value}`),
      '```',
      '',
    ].join('\n');
  }

  return [
    `Document AI processor provisioning — ${report.generatedAt}`,
    `project: ${report.project}`,
    `location: ${report.location}`,
    `actions: ${JSON.stringify(report.actions)}`,
    `recommendedEnv: ${JSON.stringify(report.recommendedEnv)}`,
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
