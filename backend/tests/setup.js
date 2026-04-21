// Provide minimum required env vars so config.js does not throw on import.
process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'test-project';
process.env.ENGINE_ID             = process.env.ENGINE_ID             || 'test-engine';
process.env.API_KEY               = process.env.API_KEY               || 'test-api-key';
