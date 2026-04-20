'use strict';

// Load .env before importing config (config reads process.env at module init)
require('dotenv').config();

const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');

const config             = require('./config');
const { logger }         = require('./logger');
const requestId          = require('./middleware/requestId');
const requestLogger      = require('./middleware/requestLogger');
const errorHandler       = require('./middleware/errorHandler');
const { requireApiKey }  = require('./middleware/auth');

const de             = require('./services/discoveryEngine');
const answerRouter   = require('./routes/answer');
const searchRouter   = require('./routes/search');
const evidenceRouter = require('./routes/evidence');
const analysisRouter = require('./routes/analysis');
const healthRouter   = require('./routes/health');

const app = express();

// ── Rate limiters ─────────────────────────────────────────────────────────────

// Rate-limit key: use API key when present so limits are per-client rather than
// per-IP (which breaks behind load balancers where all traffic shares one IP).
const _rateLimitKey = (req) => req.headers['x-api-key'] || req.ip;

// /api/answer is expensive (Vertex AI call) — cap at 20 req/min per client
const answerLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: _rateLimitKey,
  message: { error: 'Troppe richieste. Riprova tra un minuto.' },
});

// General API cap — 120 req/min per client (search, evidence, health)
const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: _rateLimitKey,
  message: { error: 'Troppe richieste. Riprova tra un minuto.' },
});

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(helmet({ contentSecurityPolicy: false })); // CSP managed by nginx
app.use(cors({
  origin:  config.frontendOrigin,
  methods: ['GET', 'POST'],
}));
app.use(requestId);
app.use(requestLogger);
app.use(express.json({ limit: '32kb' }));

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/api/answer',   answerLimiter,  requireApiKey, answerRouter);
app.use('/api/ask',      answerLimiter,  requireApiKey, answerRouter); // backwards-compat alias
app.use('/api/search',   generalLimiter, requireApiKey, searchRouter);
app.use('/api/evidence', generalLimiter, requireApiKey, evidenceRouter);
app.use('/api/analysis', generalLimiter, requireApiKey, analysisRouter);
app.use('/api/health',                                  healthRouter);  // health is always public

// ── Error handler (must be last) ──────────────────────────────────────────────

app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────

config.printStartup(logger);

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, `Server listening on port ${config.port}`);
  // Soft startup probe — validates DE connectivity without blocking the server.
  // Logs a warning on failure so ops can detect misconfiguration early, but
  // does not crash because the engine may be temporarily unavailable.
  de.search('_startup_probe_', { maxResults: 1 }).then(() => {
    logger.info({}, 'Discovery Engine connectivity probe passed');
  }).catch((err) => {
    logger.warn({ error: err.message }, 'Discovery Engine connectivity probe failed — search may be unavailable');
  });
});

// ── Graceful shutdown (Cloud Run sends SIGTERM before container stop) ─────────

function shutdown(signal) {
  logger.info({ signal }, 'Shutdown signal received — draining connections');
  server.close(() => {
    logger.info({}, 'All connections closed — exiting');
    process.exit(0);
  });
  // Force exit if connections don't drain within 10 s
  setTimeout(() => {
    logger.error({}, 'Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
