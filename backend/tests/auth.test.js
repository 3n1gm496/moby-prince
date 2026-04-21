import { describe, it, expect, vi, beforeEach } from 'vitest';

// setup.js sets API_KEY=test-api-key so config loads with a real apiKey.
const { requireApiKey } = await import('../middleware/auth.js');

describe('requireApiKey middleware', () => {
  function makeReq(overrides = {}) {
    return { headers: {}, query: {}, ...overrides };
  }

  let res, next;
  beforeEach(() => {
    res  = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    next = vi.fn();
  });

  it('passes when correct X-API-Key header is present', () => {
    requireApiKey(makeReq({ headers: { 'x-api-key': 'test-api-key' } }), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects when api_key query param is used instead of header', () => {
    requireApiKey(makeReq({ query: { api_key: 'test-api-key' } }), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects when no credentials at all', () => {
    requireApiKey(makeReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
