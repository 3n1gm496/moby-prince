'use strict';

// Validate and centralise all environment-derived configuration.
// Loaded once at startup; throws immediately on missing required values
// so misconfiguration is visible before the server accepts requests.

function required(name) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return v.trim();
}

function optional(name, fallback = null) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

const nodeEnv   = optional('NODE_ENV', 'development');
const isProd    = nodeEnv === 'production';

const projectId   = required('GOOGLE_CLOUD_PROJECT');
const location    = optional('GCP_LOCATION', 'eu');
const engineId    = required('ENGINE_ID');
const dataStoreId = optional('DATA_STORE_ID');
const gcsBucket   = optional('GCS_BUCKET');
const apiKey      = optional('API_KEY');

// Validate FRONTEND_ORIGIN is a real URL (misconfiguration in prod would silently break CORS)
const frontendOriginRaw = optional('FRONTEND_ORIGIN', 'http://localhost:5173');
try { new URL(frontendOriginRaw); } catch {
  throw new Error(`Invalid FRONTEND_ORIGIN: "${frontendOriginRaw}" — must be a valid URL`);
}

const apiBase        = `https://${location}-discoveryengine.googleapis.com`;
const collectionBase = `${apiBase}/v1/projects/${projectId}/locations/${location}/collections/default_collection`;
const engineBase     = `${collectionBase}/engines/${engineId}`;

const config = {
  nodeEnv,
  isProd,
  port:           parseInt(optional('PORT', '3001'), 10),
  logLevel:       optional('LOG_LEVEL', isProd ? 'info' : 'debug'),
  projectId,
  location,
  engineId,
  dataStoreId,
  gcsBucket,
  apiKey,
  frontendOrigin: frontendOriginRaw,

  // BigQuery evidence layer (optional)
  bigquery: {
    projectId: optional('BQ_PROJECT_ID', projectId),
    datasetId: optional('BQ_DATASET_ID', 'evidence'),
    location:  optional('BQ_LOCATION', 'EU'),
  },

  // Firestore session persistence (optional — uses default database if unset)
  firestoreDb: optional('FIRESTORE_DB', '(default)'),

  // Gemini / Vertex AI region for generative calls (separate from DE region)
  geminiLocation: optional('GEMINI_LOCATION', 'us-central1'),

  // Document AI region (defaults to GCP_LOCATION)
  docAiLocation: optional('DOCAI_LOCATION', optional('GCP_LOCATION', 'eu')),

  // Daily call budget limits for the in-memory circuit breaker
  dailyGeminiLimit: parseInt(optional('DAILY_GEMINI_LIMIT', '500'),  10),
  dailyBqLimit:     parseInt(optional('DAILY_BQ_LIMIT',     '2000'), 10),

  // Adjacent chunks to include per matched chunk in :answer responses.
  // Increasing these values improves answer context at the cost of more tokens.
  chunkContextPrev: parseInt(optional('CHUNK_CONTEXT_PREV', '1'), 10),
  chunkContextNext: parseInt(optional('CHUNK_CONTEXT_NEXT', '1'), 10),

  // Endpoint URLs
  answerEndpoint: `${apiBase}/v1/projects/${projectId}/locations/${location}/collections/default_collection/engines/${engineId}/servingConfigs/default_serving_config:answer`,
  searchEndpoint: `${engineBase}/servingConfigs/default_serving_config:search`,

  // Datastore base for document/chunk lookup (requires DATA_STORE_ID)
  dataStoreBase: dataStoreId
    ? `${collectionBase}/dataStores/${dataStoreId}`
    : null,

  // Session path builder
  sessionPath(sessionId) {
    return `projects/${projectId}/locations/${location}/collections/default_collection/engines/${engineId}/sessions/${sessionId}`;
  },

  promptPreamble:
    "Sei un assistente storico specializzato nel disastro del Moby Prince (10 aprile 1991). " +
    "Rispondi in italiano, in modo preciso e documentato, citando le fonti disponibili. " +
    "Se l'informazione non è presente nei documenti, dichiaralo esplicitamente.",
};

/**
 * Log the active configuration at startup.
 * Call after the logger is ready: config.printStartup(log)
 */
config.printStartup = function printStartup(log) {
  log.info({
    nodeEnv:        config.nodeEnv,
    port:           config.port,
    logLevel:       config.logLevel,
    projectId:      config.projectId,
    location:       config.location,
    engineId:       config.engineId,
    dataStoreId:    config.dataStoreId ?? '(not set)',
    gcsBucket:      config.gcsBucket   ?? '(not set)',
    frontendOrigin: config.frontendOrigin,
    apiKeyEnabled:  !!config.apiKey,
    bqDataset:      `${config.bigquery.projectId}.${config.bigquery.datasetId}`,
  }, 'Server configuration loaded');

  if (!config.dataStoreId) {
    log.warn({}, 'DATA_STORE_ID is not set — chunk/document lookup endpoints will be disabled');
  }
  if (!config.gcsBucket) {
    log.warn({}, 'GCS_BUCKET is not set — storage browse/upload endpoints will be disabled');
  }
  if (!config.apiKey && config.isProd) {
    log.warn({}, 'API_KEY is not set — all API endpoints are publicly accessible');
  }
};

module.exports = config;
