'use strict';

/**
 * Worker chain factory for the Cloud Run entrypoint.
 *
 * Full chain (all workers active):
 *   Validator → DocumentAI → MediaProcessor → Splitter → EntityExtractor → Indexer → ClaimExtractor
 *
 * Each worker's shouldRun() gates activation by MIME type / file size:
 *   - DocumentAIWorker:    PDF >= pdfCriticalBytes
 *   - MediaProcessorWorker: image / video / audio MIME types
 *   - SplitterWorker:      PDF / text that needs splitting
 *   - IndexerWorker:       everything in VALIDATING / INDEXING state
 *   - ClaimExtractorWorker: leaf text/html/text/plain jobs once they are index-ready
 */

const { ValidatorWorker }          = require('../workers/validator');
const { SplitterWorker }           = require('../workers/splitter');
const { IndexerWorker }            = require('../workers/indexer');
const { DocumentAIWorker }         = require('../workers/documentai');
const { MediaProcessorWorker }     = require('../workers/mediaProcessor');
const { EntityExtractionWorker }   = require('../workers/entities');
const { ClaimExtractorWorker }     = require('../workers/claimExtractor');

/**
 * Full worker chain (M1-M4):
 *   Validator → DocumentAI → MediaProcessor → Splitter → EntityExtractor → Indexer → ClaimExtractor
 *
 * @param {object} config
 * @param {object} [logger]
 */
function buildWorkersWithDocumentAI(config, logger) {
  return [
    new ValidatorWorker(config, logger),
    new DocumentAIWorker(config, logger),
    new MediaProcessorWorker(config, logger),
    new SplitterWorker(config, logger),
    new EntityExtractionWorker(config, logger),
    new IndexerWorker(config, logger),
    new ClaimExtractorWorker(config, logger),
  ];
}

module.exports = { buildWorkersWithDocumentAI };
