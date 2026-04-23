#!/usr/bin/env node
'use strict';

const { getAccessToken } = require('../services/auth');
const { insert, dml } = require('../services/bigquery');
const gemini = require('../services/gemini');

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const DATASET = process.env.BQ_DATASET_ID || 'evidence';
const LOCATION = process.env.BQ_LOCATION || 'EU';
const LIMIT = Math.min(parseInt(process.env.ENTITY_PROFILE_LIMIT || '250', 10) || 250, 1000);
const SUMMARY_VERSION = 1;

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

function profilePrompt(entity, claims, events) {
  return [
    'Sei un assistente storico specializzato nel caso Moby Prince.',
    'Scrivi un profilo sintetico, prudente e stabile per la UI.',
    'Massimo 3 frasi. Nessuna invenzione. Se i dati sono scarsi, restare sobri.',
    `Entità: ${entity.canonical_name} (${entity.entity_type})`,
    entity.role ? `Ruolo noto: ${entity.role}` : '',
    entity.description ? `Descrizione: ${entity.description}` : '',
    claims.length > 0 ? `Claim rilevanti:\n${claims.map((item, index) => `${index + 1}. ${item}`).join('\n')}` : '',
    events.length > 0 ? `Eventi collegati:\n${events.map((item, index) => `${index + 1}. ${item}`).join('\n')}` : '',
    'Rispondi SOLO in JSON con {"summary":"..."}',
  ].filter(Boolean).join('\n\n');
}

async function main() {
  const entities = await query(`
    SELECT
      e.id,
      e.entity_type,
      e.canonical_name,
      e.aliases,
      e.description,
      e.role,
      COALESCE(c.mention_count, 0) AS mention_count
    FROM \`${PROJECT}.${DATASET}.entities\` e
    LEFT JOIN (
      SELECT eid, COUNT(*) AS mention_count
      FROM \`${PROJECT}.${DATASET}.claims\`,
      UNNEST(entity_ids) AS eid
      GROUP BY eid
    ) c ON c.eid = e.id
    ORDER BY mention_count DESC, canonical_name ASC
    LIMIT ${LIMIT}
  `);

  console.log(`Entità da materializzare: ${entities.length}`);

  for (const entity of entities) {
    const claims = await query(`
      SELECT text
      FROM \`${PROJECT}.${DATASET}.claims\`
      WHERE '${entity.id}' IN UNNEST(entity_ids)
      ORDER BY confidence DESC, created_at DESC
      LIMIT 5
    `);
    const events = await query(`
      SELECT title
      FROM \`${PROJECT}.${DATASET}.events\`
      WHERE '${entity.id}' IN UNNEST(entity_ids)
      ORDER BY occurred_at ASC NULLS LAST, created_at ASC
      LIMIT 4
    `);

    let summary = null;
    try {
      const result = await gemini.generateJson(
        profilePrompt(
          entity,
          claims.map((row) => row.text).filter(Boolean),
          events.map((row) => row.title).filter(Boolean),
        ),
        512,
      );
      summary = typeof result?.summary === 'string' ? result.summary.trim() : null;
    } catch (err) {
      console.warn(`Profilo Gemini fallito per ${entity.canonical_name}: ${err.message}`);
    }

    if (!summary) {
      const rolePart = entity.role ? ` svolge il ruolo di ${entity.role}` : '';
      summary = `${entity.canonical_name}${rolePart} nel corpus Moby Prince.`;
    }

    await dml(`DELETE FROM \`${DATASET}.entity_profiles\` WHERE entity_id = @entityId`, { entityId: entity.id });
    await insert('entity_profiles', [{
      entity_id: entity.id,
      summary,
      aliases: Array.isArray(entity.aliases) ? entity.aliases : [],
      role: entity.role || null,
      summary_version: SUMMARY_VERSION,
      source_claim_ids: [],
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }]);

    console.log(`✔ ${entity.canonical_name}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
