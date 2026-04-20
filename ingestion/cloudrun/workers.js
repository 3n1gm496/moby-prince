'use strict';

/**
 * Worker chain factory for the Cloud Run entrypoint.
 * Inserts DocumentAIWorker before IndexerWorker so large PDFs are routed
 * through Document AI instead of being quarantined.
 */

const { ValidatorWorker }  = require('../workers/validator');
const { SplitterWorker }   = require('../workers/splitter');
const { IndexerWorker }    = require('../workers/indexer');
const { DocumentAIWorker } = require('../workers/documentai');

/**
 * Build a worker chain that includes DocumentAIWorker.
 * Order: Validator → DocumentAI → Splitter → Indexer
 *
 * DocumentAIWorker only runs when:
 *   - status === VALIDATING
 *   - mimeType === application/pdf
 *   - fileSizeBytes >= config.split.pdfCriticalBytes
 *
 * @param {object} config
 * @param {object} [logger]
 */
function buildWorkersWithDocumentAI(config, logger) {
  return [
    new ValidatorWorker(config, logger),
    new DocumentAIWorker(config, logger),
    new SplitterWorker(config, logger),
    new IndexerWorker(config, logger),
  ];
}

module.exports = { buildWorkersWithDocumentAI };
