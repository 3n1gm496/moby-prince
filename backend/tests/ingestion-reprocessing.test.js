import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const { createJob } = require('../../ingestion/state/job.js');
const { IndexerWorker } = require('../../ingestion/workers/indexer.js');
const { toDocumentId } = require('../../ingestion/lib/documentId.js');

function makeLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

describe('ingestion reprocessing hardening', () => {
  it('uses a stable canonical document id derived from the original filename', () => {
    const documentId = toDocumentId('Archiviazione-2010.pdf');
    expect(documentId).toMatch(/^archiviazione-2010-[a-f0-9]{8}$/);
    expect(toDocumentId('Archiviazione-2010.pdf')).toBe(documentId);
  });

  it('skips Discovery Engine indexing for normalized child jobs and preserves the canonical document id', async () => {
    const worker = new IndexerWorker({
      dryRun: false,
      dataStoreId: 'test-datastore',
      projectId: 'test-project',
      location: 'eu',
      index: { skipNormalizedChildren: true },
    }, makeLogger());

    const job = createJob('gs://moby-prince-normalized/moby-prince/Archiviazione-2010_part_001.html', {
      originalFilename: 'Archiviazione-2010_part_001.html',
      parentJobId: 'parent-job',
      mimeType: 'text/html',
      canonical_document_id: 'archiviazione-2010-7c1b4cb8',
      canonical_source_uri: 'gs://moby-prince/Fonti Giudiziarie/Archiviazione-2010.pdf',
      skip_indexing: true,
      purge_claims: true,
      page_start: 1,
      page_end: 1,
    });

    const result = await worker.run(job, {});

    expect(result.halt).toBe(false);
    expect(result.outputs).toMatchObject({
      skipped: true,
      reason: 'normalized-child',
      documentId: 'archiviazione-2010-7c1b4cb8',
    });
    expect(result.job.status).toBe('INDEXED');
    expect(result.job.documentId).toBe('archiviazione-2010-7c1b4cb8');
  });
});
