'use strict';

/**
 * Cloud Natural Language API REST client.
 * Used by backend routes for on-demand entity analysis.
 *
 * The ingestion EntityExtractionWorker uses its own inlined REST call
 * with the ingestion auth module; this service is for backend-facing use.
 */

const { getAccessToken } = require('./auth');

const NL_ENDPOINT = 'https://language.googleapis.com/v1/documents:analyzeEntities';

// Italian honorifics / titles stripped before storing person names
const TITLE_RE = /^(cap\.?|capitano|comandante|amm\.?|ammiraglio|col\.?|colonnello|gen\.?|generale|dott\.?|dr\.?|ing\.?|on\.?|onorevole|sen\.?|senatore|prof\.?|professore|avv\.?|avvocato|sig\.?|signor[ae]?|vice\s+)?/i;

/**
 * Extract named entities from Italian plain text.
 *
 * @param {string} text   Plain text (max 1 000 000 bytes)
 * @returns {Promise<object[]>}  Array of entity objects from the NL API
 */
async function analyzeEntities(text) {
  const token = await getAccessToken();
  const res   = await fetch(NL_ENDPOINT, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      document:     { type: 'PLAIN_TEXT', language: 'it', content: text.slice(0, 1_000_000) },
      encodingType: 'UTF8',
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Natural Language API HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.entities || [];
}

/**
 * Group entities by type and normalize names.
 *
 * @param {object[]} entities  Raw NL API entities array
 * @param {number}   [minSalience=0.01]  Skip entities below this salience threshold
 * @returns {{ persons: string[], organizations: string[], locations: string[] }}
 */
function groupEntities(entities, minSalience = 0.01) {
  const persons       = new Set();
  const organizations = new Set();
  const locations     = new Set();

  for (const e of entities) {
    if ((e.salience || 0) < minSalience) continue;
    const name = (e.name || '').trim();
    if (!name) continue;

    switch (e.type) {
      case 'PERSON':
        { const n = _normalizePerson(name); if (n) persons.add(n); break; }
      case 'ORGANIZATION':
        organizations.add(name);
        break;
      case 'LOCATION':
        locations.add(name);
        break;
    }
  }

  return {
    persons:       [...persons],
    organizations: [...organizations],
    locations:     [...locations],
  };
}

function _normalizePerson(name) {
  const n = name.replace(TITLE_RE, '').trim();
  return n.length >= 2 ? n : null;
}

module.exports = { analyzeEntities, groupEntities };
