'use strict';

/**
 * GET /api/health
 *
 * Returns runtime configuration summary and GCP auth probe.
 * Safe to expose in non-public environments; does not return secrets.
 */

const { Router } = require('express');
const config = require('../config');
const { getAccessToken } = require('../services/auth');

const router = Router();

router.get('/', async (_req, res) => {
  let authStatus = 'ok';
  try {
    await getAccessToken();
  } catch (err) {
    authStatus = 'error';
    console.error('[health] GCP auth check failed:', err.message);
  }

  res.status(authStatus === 'ok' ? 200 : 503).json({
    status:    authStatus === 'ok' ? 'ok' : 'degraded',
    project:   config.projectId,
    location:  config.location,
    engine:    config.engineId,
    dataStore: config.dataStoreId ?? 'not configured',
    auth:      authStatus,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
