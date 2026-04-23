'use strict';

const bq = require('../services/bigquery');
const { normalizeEntityProfile } = require('../evidence/models');
const config = require('../config');

function _table(t) {
  return `\`${config.bigquery.projectId}.${config.bigquery.datasetId}.${t}\``;
}

async function getEntityProfile(entityId) {
  try {
    const rows = await bq.query(
      `SELECT *
       FROM ${_table('entity_profiles')}
       WHERE entity_id = @entityId
       LIMIT 1`,
      [bq.stringParam('entityId', entityId)],
    );
    return rows.length > 0 ? normalizeEntityProfile(rows[0]) : null;
  } catch (err) {
    if (/entity_profiles/i.test(err.message || '')) return null;
    if (/not found/i.test(err.message || '')) return null;
    throw err;
  }
}

module.exports = { getEntityProfile };
