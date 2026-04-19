'use strict';

// Load .env before importing config (config reads process.env at module init)
require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const config       = require('./config');
const errorHandler = require('./middleware/errorHandler');

const answerRouter   = require('./routes/answer');
const searchRouter   = require('./routes/search');
const evidenceRouter = require('./routes/evidence');
const healthRouter   = require('./routes/health');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────

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

app.listen(config.port, () => {
  console.log(`Moby Prince backend  →  http://localhost:${config.port}`);
  console.log(`Project: ${config.projectId}  |  Location: ${config.location}  |  Engine: ${config.engineId}`);
  if (config.dataStoreId) {
    console.log(`DataStore: ${config.dataStoreId}`);
  } else {
    console.log('DataStore: not configured (chunk lookup disabled)');
  }
});
