import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock dependencies before importing the module under test ──────────────────

vi.mock('../config.js', () => ({
  default: { bigquery: { projectId: 'test-project', datasetId: 'evidence', location: 'EU' } },
}));

vi.mock('../services/auth.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('fake-token'),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('bigquery.query()', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(async () => {
    const mod = await import('../services/bigquery.js');
    mod.__setAccessTokenProvider();
  });

  it('throws when jobComplete is false', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok:   true,
      json: () => Promise.resolve({ jobComplete: false, jobReference: { jobId: 'job-123' } }),
    });

    const { query, __setAccessTokenProvider } = await import('../services/bigquery.js');
    __setAccessTokenProvider(async () => 'fake-token');
    await expect(query('SELECT 1')).rejects.toThrow(/timed out/i);
  });

  it('returns rows when jobComplete is true', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok:   true,
      json: () => Promise.resolve({
        jobComplete: true,
        schema: { fields: [{ name: 'id', type: 'STRING', mode: 'NULLABLE' }] },
        rows:   [{ f: [{ v: 'abc' }] }],
      }),
    });

    const { query, __setAccessTokenProvider } = await import('../services/bigquery.js');
    __setAccessTokenProvider(async () => 'fake-token');
    const rows = await query('SELECT id FROM t');
    expect(rows).toEqual([{ id: 'abc' }]);
  });

  it('normalizes BigQuery TIMESTAMP seconds to ISO strings', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok:   true,
      json: () => Promise.resolve({
        jobComplete: true,
        schema: { fields: [{ name: 'occurred_at', type: 'TIMESTAMP', mode: 'NULLABLE' }] },
        rows:   [{ f: [{ v: '-4.418496E8' }] }],
      }),
    });

    const { query, __setAccessTokenProvider } = await import('../services/bigquery.js');
    __setAccessTokenProvider(async () => 'fake-token');
    const rows = await query('SELECT occurred_at FROM t');
    expect(rows).toEqual([{ occurred_at: '1956-01-01T00:00:00.000Z' }]);
  });
});
