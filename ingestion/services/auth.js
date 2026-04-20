'use strict';

/**
 * GCP authentication for the ingestion pipeline.
 *
 * Kept in ingestion/services/ (not shared with backend/) so the Cloud Run Job
 * image can be built from the ingestion/ directory alone, with no dependency
 * on the backend package.
 *
 * google-auth-library is listed as an optionalDependency in ingestion/package.json.
 * The library handles ADC resolution (GOOGLE_APPLICATION_CREDENTIALS env var,
 * GCE metadata server, gcloud ADC) and internal token refresh.
 */

let _client    = null;
let _GoogleAuth = null;

function _loadLib() {
  if (_GoogleAuth) return _GoogleAuth;
  try {
    _GoogleAuth = require('google-auth-library').GoogleAuth;
  } catch {
    throw new Error(
      'google-auth-library is required for GCP authentication. ' +
      'Install it: npm install --save-optional google-auth-library',
    );
  }
  return _GoogleAuth;
}

async function getAccessToken() {
  const GoogleAuth = _loadLib();
  if (!_client) {
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    _client = await auth.getClient();
  }
  const { token } = await _client.getAccessToken();
  if (!token) throw new Error('Failed to obtain GCP access token');
  return token;
}

module.exports = { getAccessToken };
