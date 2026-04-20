'use strict';

/**
 * Metadata taxonomy for the Moby Prince corpus.
 *
 * `available: true` means the field is active — the API builds filter
 * expressions for it and the frontend shows it as an enabled input.
 * Set to `false` to disable a field without removing it (expression builder
 * silently drops it; frontend shows it as "in arrivo").
 *
 * To activate a field:
 *   1. Set `available: true` here.
 *   2. Ensure the field is declared in the Vertex AI Search datastore schema
 *      as an indexed filterable attribute.
 *   3. Verify documents have the field populated (via import metadata JSON or
 *      Document AI enrichment pipeline).
 *   See docs/metadata-model.md for the full datastore configuration guide.
 *
 * Filter expression syntax (Vertex AI Search struct data):
 *   String/enum: struct.<field>: "<value>"
 *   Number:      struct.<field> = <n>
 *   Text exact:  struct.<field>: "<value>"
 */

const SCHEMA = {
  documentType: {
    field:     'document_type',
    label:     'Tipo documento',
    type:      'enum',
    values:    [
      'testimony', 'report', 'expert_opinion', 'exhibit',
      'decree', 'parliamentary_act', 'press', 'investigation',
    ],
    available: true,
  },

  institution: {
    field:     'institution',
    label:     'Istituzione',
    type:      'enum',
    values:    [
      'marina_militare', 'guardia_costiera', 'procura_livorno',
      'commissione_parlamentare', 'tribunale', 'ministero_trasporti',
      'rina', 'other',
    ],
    available: true,
  },

  year: {
    field:     'year',
    label:     'Anno',
    type:      'number',
    min:       1991,
    max:       2024,
    available: true,
  },

  legislature: {
    field:     'legislature',
    label:     'Legislatura',
    type:      'enum',
    values:    ['X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX'],
    available: true,
  },

  person: {
    field:     'persons_mentioned',
    label:     'Persona citata',
    type:      'text',
    available: true,
  },

  topic: {
    field:     'topic',
    label:     'Argomento',
    type:      'enum',
    values:    [
      'incendio', 'collisione', 'soccorso', 'responsabilita',
      'indennizzo', 'rotta', 'comunicazioni', 'radar', 'nebbia', 'vittime',
    ],
    available: true,
  },

  ocrQuality: {
    field:     'ocr_quality',
    label:     'Qualità OCR',
    type:      'enum',
    values:    ['high', 'medium', 'low'],
    // Populated only when the Document AI pipeline is active and has assessed
    // each document. Leaving available: false prevents spurious filter clauses
    // against a field that is null for all pipeline-indexed documents.
    available: false,
  },
};

/**
 * Build a Vertex AI Search filter expression string from a structured filter
 * object. Only fields where schema.available === true generate clauses.
 * Returns null when no filterable clauses are active.
 *
 * @param {object|null} filters
 * @returns {string|null}
 */
function buildFilterExpression(filters) {
  if (!filters || typeof filters !== 'object') return null;

  const clauses = [];

  for (const [key, value] of Object.entries(filters)) {
    const spec = SCHEMA[key];
    if (!spec || !spec.available) continue;
    if (value === null || value === undefined || value === '') continue;

    switch (spec.type) {
      case 'enum':
      case 'text': {
        const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        clauses.push(`struct.${spec.field}: "${escaped}"`);
        break;
      }
      case 'number': {
        const n = Number(value);
        if (!Number.isNaN(n)) clauses.push(`struct.${spec.field} = ${n}`);
        break;
      }
    }
  }

  return clauses.length > 0 ? clauses.join(' AND ') : null;
}

/**
 * Validate a filters object from a request body.
 * Returns { valid: true } or { valid: false, error: string }.
 *
 * Validation is intentionally lenient: unknown values on unavailable fields
 * are accepted (they will be ignored during expression building). Only
 * type/range errors on known fields are rejected.
 *
 * @param {unknown} filters
 * @returns {{ valid: boolean, error?: string }}
 */
function validateFiltersObject(filters) {
  if (filters === undefined || filters === null) return { valid: true };
  if (typeof filters !== 'object' || Array.isArray(filters)) {
    return { valid: false, error: '"filters" deve essere un oggetto.' };
  }

  for (const [key, value] of Object.entries(filters)) {
    if (!(key in SCHEMA)) {
      return { valid: false, error: `Chiave filtro non riconosciuta: "${key}".` };
    }
    if (value === null || value === undefined) continue;

    const spec = SCHEMA[key];

    switch (spec.type) {
      case 'number': {
        const n = Number(value);
        if (Number.isNaN(n)) {
          return { valid: false, error: `Il filtro "${key}" deve essere un numero.` };
        }
        if (spec.min !== undefined && n < spec.min) {
          return { valid: false, error: `Il filtro "${key}" deve essere >= ${spec.min}.` };
        }
        if (spec.max !== undefined && n > spec.max) {
          return { valid: false, error: `Il filtro "${key}" deve essere <= ${spec.max}.` };
        }
        break;
      }
      case 'enum': {
        if (!spec.values.includes(String(value))) {
          return {
            valid: false,
            error: `Valore non valido per "${key}": "${value}". Ammessi: ${spec.values.join(', ')}.`,
          };
        }
        break;
      }
      case 'text': {
        if (typeof value !== 'string' || !value.trim()) {
          return { valid: false, error: `Il filtro "${key}" deve essere una stringa non vuota.` };
        }
        break;
      }
    }
  }

  return { valid: true };
}

module.exports = { SCHEMA, buildFilterExpression, validateFiltersObject };
