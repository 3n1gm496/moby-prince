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

const projectId  = required('GOOGLE_CLOUD_PROJECT');
const location   = optional('GCP_LOCATION', 'eu');
const engineId   = required('ENGINE_ID');
const dataStoreId = optional('DATA_STORE_ID');

const apiBase        = `https://${location}-discoveryengine.googleapis.com`;
const collectionBase = `${apiBase}/v1/projects/${projectId}/locations/${location}/collections/default_collection`;
const engineBase     = `${collectionBase}/engines/${engineId}`;

const config = {
  port:           parseInt(optional('PORT', '3001'), 10),
  projectId,
  location,
  engineId,
  dataStoreId,
  frontendOrigin: optional('FRONTEND_ORIGIN', 'http://localhost:5173'),

  // Endpoint URLs
  // v1alpha is intentional for :answer — the v1 answer API lags behind on features
  answerEndpoint: `${apiBase}/v1alpha/projects/${projectId}/locations/${location}/collections/default_collection/engines/${engineId}/servingConfigs/default_serving_config:answer`,
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

module.exports = config;
