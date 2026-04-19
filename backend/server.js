'use strict';

// Load .env before importing config (config reads process.env at module init)
require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const config        = require('./config');
const { logger }    = require('./logger');
const requestId     = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');
const errorHandler  = require('./middleware/errorHandler');

const answerRouter   = require('./routes/answer');
const searchRouter   = require('./routes/search');
const evidenceRouter = require('./routes/evidence');
const healthRouter   = require('./routes/health');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(requestId);
app.use(requestLogger);
app.use(express.json({ limit: '32kb' }));
app.use(cors({
  origin:  config.frontendOrigin,
  methods: ['GET', 'POST'],
}));

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/api/answer',   answerRouter);
app.use('/api/search',   searchRouter);
app.use('/api/evidence', evidenceRouter);
app.use('/api/health',   healthRouter);

// Backwards-compatibility alias — keeps existing frontend calls working
// during any rolling deploy before the frontend is updated to /api/answer.
// Remove once all clients use /api/answer.
app.use('/api/ask', answerRouter);

// ── Error handler (must be last) ──────────────────────────────────────────────

app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────

config.printStartup(logger);

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, `Server listening on port ${config.port}`);
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
