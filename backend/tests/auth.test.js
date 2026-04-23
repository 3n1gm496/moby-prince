import { describe, it, expect, vi, beforeEach } from 'vitest';

async function loadRequireApiKey({ apiKey = 'test-api-key', trustIapHeaders = false } = {}) {
  process.env.API_KEY = apiKey;
  process.env.TRUST_IAP_HEADERS = trustIapHeaders ? 'true' : 'false';
  vi.resetModules();
  const { requireApiKey } = await import('../middleware/auth.js');
  return requireApiKey;
}

describe('requireApiKey middleware', () => {
  function makeReq(overrides = {}) {
    return { headers: {}, query: {}, ...overrides };
  }

  let res, next;
  beforeEach(() => {
    process.env.API_KEY = 'test-api-key';
    process.env.TRUST_IAP_HEADERS = 'false';
    res  = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    next = vi.fn();
  });

  it('passes when correct X-API-Key header is present', async () => {
    const requireApiKey = await loadRequireApiKey();
    requireApiKey(makeReq({ headers: { 'x-api-key': 'test-api-key' } }), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects when api_key query param is used instead of header', async () => {
    const requireApiKey = await loadRequireApiKey();
    requireApiKey(makeReq({ query: { api_key: 'test-api-key' } }), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects when no credentials at all', async () => {
    const requireApiKey = await loadRequireApiKey();
    requireApiKey(makeReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('accepts trusted IAP headers when enabled', async () => {
    const requireApiKey = await loadRequireApiKey({ trustIapHeaders: true });
    requireApiKey(makeReq({ headers: { 'x-goog-authenticated-user-email': 'accounts.google.com:user@example.com' } }), res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
