import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock dependencies before importing the module under test ──────────────────

vi.mock('../config', () => ({
  default: { bigquery: { projectId: 'test-project', datasetId: 'evidence', location: 'EU' } },
}));

vi.mock('../services/auth', () => ({
  getAccessToken: vi.fn().mockResolvedValue('fake-token'),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('bigquery.query()', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });

  it('throws when jobComplete is false', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok:   true,
      json: () => Promise.resolve({ jobComplete: false, jobReference: { jobId: 'job-123' } }),
    });

    const { query } = await import('../services/bigquery.js');
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

    const { query } = await import('../services/bigquery.js');
    const rows = await query('SELECT id FROM t');
    expect(rows).toEqual([{ id: 'abc' }]);
  });
});
