'use strict';

/**
 * GET /api/health
 *
 * Returns runtime configuration summary and GCP auth probe.
 * Safe to expose in non-public environments; does not return secrets.
 */

const { Router }       = require('express');
const config           = require('../config');
const { createLogger } = require('../logger');
const { getAccessToken } = require('../services/auth');

const log    = createLogger('health');
const router = Router();
const START  = Date.now();

router.get('/', async (req, res) => {
  let authStatus = 'ok';
  try {
    await getAccessToken();
  } catch (err) {
    authStatus = 'error';
    log.warn({ requestId: req.requestId, msg: err.message }, 'GCP auth check failed');
  }

  res.status(authStatus === 'ok' ? 200 : 503).json({
    status:    authStatus === 'ok' ? 'ok' : 'degraded',
    project:   config.projectId,
    location:  config.location,
    engine:    config.engineId,
    dataStore: config.dataStoreId ?? 'not configured',
    auth:      authStatus,
    uptimeMs:  Date.now() - START,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
