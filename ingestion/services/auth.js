'use strict';

/**
 * GCP authentication for the ingestion pipeline.
 *
 * Kept in ingestion/services/ (not shared with backend/) so the Cloud Run Job
 * image can be built from the ingestion/ directory alone, with no dependency
 * on the backend package.
 *
 * Resolution order:
 *   1. google-auth-library (ADC: GOOGLE_APPLICATION_CREDENTIALS env var,
 *      GCE/Cloud Run metadata server, gcloud ADC file) — handles token refresh
 *   2. gcloud CLI fallback — works in Cloud Shell and local dev when
 *      google-auth-library is not installed (optionalDependency)
 */

let _client     = null;
let _GoogleAuth = null;

function _loadLib() {
  if (_GoogleAuth) return _GoogleAuth;
  try {
    _GoogleAuth = require('google-auth-library').GoogleAuth;
    return _GoogleAuth;
  } catch {
    return null; // fall through to gcloud CLI
  }
}

async function getAccessToken() {
  const GoogleAuth = _loadLib();

  if (GoogleAuth) {
    if (!_client) {
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      _client = await auth.getClient();
    }
    const { token } = await _client.getAccessToken();
    if (token) return token;
  }

  // Fallback: gcloud CLI (works in Cloud Shell and local dev without the library)
  try {
    const { execSync } = require('child_process');
    const token = execSync('gcloud auth print-access-token', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (token) return token;
  } catch { /* fall through */ }

  throw new Error(
    'Could not obtain a GCP access token.\n' +
    '  Option 1: npm install google-auth-library (then run gcloud auth application-default login)\n' +
    '  Option 2: gcloud auth application-default login\n' +
    '  Option 3: Set GOOGLE_APPLICATION_CREDENTIALS to a service account key file',
  );
}

module.exports = { getAccessToken };
