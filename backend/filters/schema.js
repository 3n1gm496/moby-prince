'use strict';

/**
 * Metadata taxonomy for the Moby Prince corpus — single source of truth.
 *
 * Each enum field carries `options: [{ value, label }]` so the API can serve
 * the complete UI schema to the frontend without a separate static copy.
 * `buildFilterExpression` and `validateFiltersObject` derive allowed values
 * from `options` at runtime.
 *
 * `available: true`  → field active; filter expressions are built and the
 *                      frontend renders it as an enabled control.
 * `available: false` → field disabled; expression builder silently drops it;
 *                      frontend shows "in arrivo" badge.
 *
 * To activate a field:
 *   1. Set `available: true` here.
 *   2. Declare the field as filterable in the Vertex AI Search datastore schema.
 *   3. Verify corpus documents have the field populated.
 *   See docs/metadata-model.md for the full configuration guide.
 */

const SCHEMA = {
  documentType: {
    field:     'document_type',
    label:     'Tipo documento',
    type:      'enum',
    options: [
      { value: 'testimony',         label: 'Testimonianza'     },
      { value: 'report',            label: 'Relazione'         },
      { value: 'expert_opinion',    label: 'Perizia'           },
      { value: 'exhibit',           label: 'Allegato'          },
      { value: 'decree',            label: 'Decreto'           },
      { value: 'parliamentary_act', label: 'Atto parlamentare' },
      { value: 'press',             label: 'Stampa'            },
      { value: 'investigation',     label: 'Indagine'          },
    ],
    available: true,
  },

  institution: {
    field:     'institution',
    label:     'Istituzione',
    type:      'enum',
    options: [
      { value: 'marina_militare',          label: 'Marina Militare'          },
      { value: 'guardia_costiera',         label: 'Guardia Costiera'         },
      { value: 'procura_livorno',          label: 'Procura di Livorno'       },
      { value: 'commissione_parlamentare', label: 'Commissione Parlamentare' },
      { value: 'tribunale',                label: 'Tribunale'                },
      { value: 'ministero_trasporti',      label: 'Min. dei Trasporti'       },
      { value: 'rina',                     label: 'RINA'                     },
      { value: 'other',                    label: 'Altro'                    },
    ],
    available: true,
  },

  year: {
    field:       'year',
    label:       'Anno',
    type:        'number',
    min:         1991,
    max:         2024,
    placeholder: 'es. 1991',
    available:   true,
  },

  legislature: {
    field:     'legislature',
    label:     'Legislatura',
    type:      'enum',
    options: [
      { value: 'X',     label: 'X Legislatura'    },
      { value: 'XI',    label: 'XI Legislatura'   },
      { value: 'XII',   label: 'XII Legislatura'  },
      { value: 'XIII',  label: 'XIII Legislatura' },
      { value: 'XIV',   label: 'XIV Legislatura'  },
      { value: 'XV',    label: 'XV Legislatura'   },
      { value: 'XVI',   label: 'XVI Legislatura'  },
      { value: 'XVII',  label: 'XVII Legislatura' },
      { value: 'XVIII', label: 'XVIII Legislatura'},
      { value: 'XIX',   label: 'XIX Legislatura'  },
    ],
    available: true,
  },

  person: {
    field:       'persons_mentioned',
    label:       'Persona citata',
    type:        'text',
    placeholder: 'es. Carlo Nardelli',
    available:   true,
  },

  topic: {
    field:     'topic',
    label:     'Argomento',
    type:      'enum',
    options: [
      { value: 'incendio',       label: 'Incendio'       },
      { value: 'collisione',     label: 'Collisione'     },
      { value: 'soccorso',       label: 'Soccorso'       },
      { value: 'responsabilita', label: 'Responsabilità' },
      { value: 'indennizzo',     label: 'Indennizzo'     },
      { value: 'rotta',          label: 'Rotta'          },
      { value: 'comunicazioni',  label: 'Comunicazioni'  },
      { value: 'radar',          label: 'Radar'          },
      { value: 'nebbia',         label: 'Nebbia'         },
      { value: 'vittime',        label: 'Vittime'        },
    ],
    available: true,
  },

  ocrQuality: {
    field:     'ocr_quality',
    label:     'Qualità OCR',
    type:      'enum',
    options: [
      { value: 'high',   label: 'Alta'  },
      { value: 'medium', label: 'Media' },
      { value: 'low',    label: 'Bassa' },
    ],
    available: true,
  },

  mediaType: {
    field:     'media_type',
    label:     'Tipo media',
    type:      'enum',
    options: [
      { value: 'document', label: 'Documento' },
      { value: 'image',    label: 'Immagine'  },
      { value: 'video',    label: 'Video'     },
      { value: 'audio',    label: 'Audio'     },
    ],
    available: true,
  },

  containsSpeech: {
    field:     'contains_speech',
    label:     'Contiene audio parlato',
    type:      'enum',
    options: [
      { value: 'true',  label: 'Sì' },
      { value: 'false', label: 'No' },
    ],
    available: true,
  },

  locationDetected: {
    field:       'locations_detected',
    label:       'Luogo rilevato',
    type:        'text',
    placeholder: 'es. Porto di Livorno',
    available:   true,
  },
};

/**
 * Build a Vertex AI Search filter expression string from a structured filter
 * object. Only fields where schema.available === true generate clauses.
 * Returns null when no filterable clauses are active.
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
        const allowed = spec.options.map(o => o.value);
        if (!allowed.includes(String(value))) {
          return {
            valid: false,
            error: `Valore non valido per "${key}": "${value}". Ammessi: ${allowed.join(', ')}.`,
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
