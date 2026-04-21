'use strict';

// Load .env before importing config (config reads process.env at module init)
require('dotenv').config();

// Set up global HTTP keepalive dispatcher for all GCP API calls
require('./services/httpAgent')();

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

const de              = require('./services/discoveryEngine');
const answerRouter    = require('./routes/answer');
const searchRouter    = require('./routes/search');
const evidenceRouter  = require('./routes/evidence');
const analysisRouter  = require('./routes/analysis');
const storageRouter   = require('./routes/storage');
const timelineRouter  = require('./routes/timeline');
const filtersRouter   = require('./routes/filters');
const mediaRouter     = require('./routes/media');
const entitiesRouter  = require('./routes/entities');
const eventsRouter    = require('./routes/events');
const sessionsRouter       = require('./routes/sessions');
const contradictionsRouter = require('./routes/contradictions');
const claimsRouter         = require('./routes/claims');
const agentRouter          = require('./routes/agent');
const adminRouter          = require('./routes/admin');
const healthRouter         = require('./routes/health');

const app = express();

// ── Rate limiters ─────────────────────────────────────────────────────────────

// Keyed by API key when present; unauthenticated requests are keyed by IP but
// get a much tighter cap so a single NAT IP cannot starve legitimate API-key users.
const _rateLimitKey = (req) => req.headers['x-api-key'] || req.ip;

const _RL_OPTS = {
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:    _rateLimitKey,
  message:         { error: 'Troppe richieste. Riprova tra un minuto.' },
};

// /api/answer is expensive (Vertex AI call) — cap at 20 req/min per authenticated client
const answerLimiter = rateLimit({ ..._RL_OPTS, windowMs: 60_000, max: 20 });

// General API cap — 120 req/min per authenticated client (search, evidence, storage…)
const generalLimiter = rateLimit({ ..._RL_OPTS, windowMs: 60_000, max: 120 });

// Unauthenticated burst guard — 10 req/min per IP regardless of route.
// Applied before requireApiKey so probe traffic is throttled early.
const anonLimiter = rateLimit({
  windowMs:      60_000,
  max:           10,
  standardHeaders: true,
  legacyHeaders:   false,
  keyGenerator:  (req) => req.ip,
  skip:          (req) => !!req.headers['x-api-key'], // only applies to unauthenticated requests
  message:       { error: 'Troppe richieste. Riprova tra un minuto.' },
});

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],  // React inline styles
      imgSrc:      ["'self'", 'data:', 'blob:'],
      connectSrc:  ["'self'",
        'https://*.googleapis.com',
        'https://*.google.com',
        'https://*.aiplatform.googleapis.com',
      ],
      frameSrc:    ["'none'"],
      objectSrc:   ["'none'"],
      baseUri:     ["'self'"],
    },
  },
}));
app.use(cors({
  origin:  config.frontendOrigin,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'PUT'],
}));
app.use(requestId);
app.use(requestLogger);
app.use(express.json({ limit: '32kb' }));

// ── Routes ────────────────────────────────────────────────────────────────────

// Unauthenticated burst guard applied globally (skips requests that carry an API key)
app.use('/api', anonLimiter);

app.use('/api/answer',   answerLimiter,  requireApiKey, answerRouter);
app.use('/api/ask',      answerLimiter,  requireApiKey, answerRouter); // backwards-compat alias
app.use('/api/search',   generalLimiter, requireApiKey, searchRouter);
app.use('/api/evidence', generalLimiter, requireApiKey, evidenceRouter);
app.use('/api/analysis', generalLimiter, requireApiKey, analysisRouter);
app.use('/api/storage',  generalLimiter, requireApiKey, storageRouter);
app.use('/api/timeline', generalLimiter, requireApiKey, timelineRouter);
app.use('/api/filters',  generalLimiter, requireApiKey, filtersRouter);
app.use('/api/media',     generalLimiter, requireApiKey, mediaRouter);
app.use('/api/entities',  generalLimiter, requireApiKey, entitiesRouter);
app.use('/api/events',    generalLimiter, requireApiKey, eventsRouter);
app.use('/api/sessions',        generalLimiter, requireApiKey, sessionsRouter);
app.use('/api/contradictions',  generalLimiter, requireApiKey, contradictionsRouter);
app.use('/api/claims',          generalLimiter, requireApiKey, claimsRouter);
app.use('/api/agent',           answerLimiter,  requireApiKey, agentRouter);
app.use('/api/admin',           generalLimiter, requireApiKey, adminRouter);
app.use('/api/health',                                   healthRouter);  // health is always public

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

// Catch-all for unhandled async rejections and sync exceptions.
// Log them so ops can detect issues; do NOT crash the process since Cloud Run
// will restart the container anyway and in-flight SSE streams would be dropped.
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason: String(reason), promise: String(promise) }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ error: err.message, stack: err.stack }, 'Uncaught exception — process may be unstable');
});
