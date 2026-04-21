/**
 * Client-side metadata filter schema for the Moby Prince corpus.
 *
 * Mirrors the backend backend/filters/schema.js but is structured for UI
 * rendering rather than expression building. Each field carries:
 *   key       - matches the backend SCHEMA key and the filters object property
 *   label     - Italian display label
 *   type      - 'enum' | 'number' | 'text'
 *   available - false = field shown as disabled ("coming soon"); the API
 *               accepts the value but drops it silently until corpus metadata
 *               is populated and available is set to true on the backend too
 *   options   - (enum) array of { value, label }
 *   min/max   - (number) inclusive range
 *   placeholder - (text) hint text
 */

export const FILTER_SCHEMA = [
  {
    key:       'documentType',
    label:     'Tipo documento',
    type:      'enum',
    available: true,
    options: [
      { value: 'testimony',        label: 'Testimonianza' },
      { value: 'report',           label: 'Relazione' },
      { value: 'expert_opinion',   label: 'Perizia' },
      { value: 'exhibit',          label: 'Allegato' },
      { value: 'decree',           label: 'Decreto' },
      { value: 'parliamentary_act',label: 'Atto parlamentare' },
      { value: 'press',            label: 'Stampa' },
      { value: 'investigation',    label: 'Indagine' },
    ],
  },
  {
    key:       'institution',
    label:     'Istituzione',
    type:      'enum',
    available: true,
    options: [
      { value: 'marina_militare',           label: 'Marina Militare' },
      { value: 'guardia_costiera',          label: 'Guardia Costiera' },
      { value: 'procura_livorno',           label: 'Procura di Livorno' },
      { value: 'commissione_parlamentare',  label: 'Commissione Parlamentare' },
      { value: 'tribunale',                 label: 'Tribunale' },
      { value: 'ministero_trasporti',       label: 'Min. dei Trasporti' },
      { value: 'rina',                      label: 'RINA' },
      { value: 'other',                     label: 'Altro' },
    ],
  },
  {
    key:         'year',
    label:       'Anno',
    type:        'number',
    available:   true,
    min:         1991,
    max:         2024,
    placeholder: 'es. 1991',
  },
  {
    key:       'legislature',
    label:     'Legislatura',
    type:      'enum',
    available: true,
    options: [
      { value: 'X',    label: 'X Legislatura' },
      { value: 'XI',   label: 'XI Legislatura' },
      { value: 'XII',  label: 'XII Legislatura' },
      { value: 'XIII', label: 'XIII Legislatura' },
      { value: 'XIV',  label: 'XIV Legislatura' },
      { value: 'XV',   label: 'XV Legislatura' },
      { value: 'XVI',  label: 'XVI Legislatura' },
      { value: 'XVII', label: 'XVII Legislatura' },
      { value: 'XVIII',label: 'XVIII Legislatura' },
      { value: 'XIX',  label: 'XIX Legislatura' },
    ],
  },
  {
    key:         'person',
    label:       'Persona citata',
    type:        'text',
    available:   true,
    placeholder: 'es. Carlo Nardelli',
  },
  {
    key:       'topic',
    label:     'Argomento',
    type:      'enum',
    available: true,
    options: [
      { value: 'incendio',        label: 'Incendio' },
      { value: 'collisione',      label: 'Collisione' },
      { value: 'soccorso',        label: 'Soccorso' },
      { value: 'responsabilita',  label: 'Responsabilità' },
      { value: 'indennizzo',      label: 'Indennizzo' },
      { value: 'rotta',           label: 'Rotta' },
      { value: 'comunicazioni',   label: 'Comunicazioni' },
      { value: 'radar',           label: 'Radar' },
      { value: 'nebbia',          label: 'Nebbia' },
      { value: 'vittime',         label: 'Vittime' },
    ],
  },
  {
    key:       'ocrQuality',
    label:     'Qualità OCR',
    type:      'enum',
    available: true,
    options: [
      { value: 'high',   label: 'Alta' },
      { value: 'medium', label: 'Media' },
      { value: 'low',    label: 'Bassa' },
    ],
  },
  {
    key:       'mediaType',
    label:     'Tipo media',
    type:      'enum',
    available: true,
    options: [
      { value: 'document', label: 'Documento' },
      { value: 'image',    label: 'Immagine' },
      { value: 'video',    label: 'Video' },
      { value: 'audio',    label: 'Audio' },
    ],
  },
  {
    key:       'containsSpeech',
    label:     'Contiene audio parlato',
    type:      'enum',
    available: true,
    options: [
      { value: 'true',  label: 'Sì' },
      { value: 'false', label: 'No' },
    ],
  },
  {
    key:         'locationDetected',
    label:       'Luogo rilevato',
    type:        'text',
    available:   true,
    placeholder: 'es. Porto di Livorno',
  },
];

/** Look up the human-readable label for a filter value. */
export function getFilterValueLabel(key, value) {
  const field = FILTER_SCHEMA.find(f => f.key === key);
  if (!field) return String(value);
  if (field.type === 'enum') {
    return field.options.find(o => o.value === value)?.label ?? String(value);
  }
  return String(value);
}
