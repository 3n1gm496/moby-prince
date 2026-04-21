'use strict';

/**
 * Worker chain factory for the Cloud Run entrypoint.
 *
 * Full chain (all workers active):
 *   Validator → DocumentAI → MediaProcessor → Splitter → Indexer
 *
 * Each worker's shouldRun() gates activation by MIME type / file size:
 *   - DocumentAIWorker:    PDF >= pdfCriticalBytes
 *   - MediaProcessorWorker: image / video / audio MIME types
 *   - SplitterWorker:      PDF / text that needs splitting
 *   - IndexerWorker:       everything in VALIDATING / INDEXING state
 */

const { ValidatorWorker }      = require('../workers/validator');
const { SplitterWorker }       = require('../workers/splitter');
const { IndexerWorker }        = require('../workers/indexer');
const { DocumentAIWorker }     = require('../workers/documentai');
const { MediaProcessorWorker } = require('../workers/mediaProcessor');

/**
 * @param {object} config
 * @param {object} [logger]
 */
function buildWorkersWithDocumentAI(config, logger) {
  return [
    new ValidatorWorker(config, logger),
    new DocumentAIWorker(config, logger),
    new MediaProcessorWorker(config, logger),
    new SplitterWorker(config, logger),
    new IndexerWorker(config, logger),
  ];
}

module.exports = { buildWorkersWithDocumentAI };
