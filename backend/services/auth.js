'use strict';

const { GoogleAuth } = require('google-auth-library');

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

// Cache the client instance; the library handles token refresh internally.
let _client = null;

async function getAccessToken() {
  if (!_client) {
    _client = await auth.getClient();
  }
  const { token } = await _client.getAccessToken();
  if (!token) throw new Error('Failed to obtain GCP access token');
  return token;
}

module.exports = { getAccessToken };
