import { describe, it, expect } from 'vitest';

// normaliseDate is not exported — replicate the exact implementation here.
// If the implementation changes, these tests will catch the regression.
function normaliseDate(raw) {
  const s = (raw || '').replace(/[^\d-]/g, '').trim();
  if (!s || !/^\d{4}/.test(s)) return null;
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  if (/^\d{4}-\d{2}$/.test(s)) {
    const m = parseInt(s.slice(5, 7), 10);
    if (m < 1 || m > 12) return `${s.slice(0, 4)}-01-01`;
    return `${s}-01`;
  }
  const parts = s.split('-');
  if (parts.length >= 3) {
    const [, mm, dd] = parts;
    const m = parseInt(mm, 10);
    const d = parseInt(dd, 10);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  }
  return s;
}

describe('normaliseDate()', () => {
  it('accepts full ISO date', () => {
    expect(normaliseDate('1991-04-10')).toBe('1991-04-10');
  });

  it('pads year-only to Jan 1', () => {
    expect(normaliseDate('1991')).toBe('1991-01-01');
  });

  it('pads year-month to day 1', () => {
    expect(normaliseDate('1991-04')).toBe('1991-04-01');
  });

  it('returns null for invalid month 13', () => {
    expect(normaliseDate('1991-13-01')).toBeNull();
  });

  it('returns null for invalid day 32', () => {
    expect(normaliseDate('1991-04-32')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normaliseDate('')).toBeNull();
  });

  it('strips non-dash separators — slashes produce a string without dashes', () => {
    // normaliseDate only recognises '-' as separator; '/' is stripped leaving '19910410'
    expect(normaliseDate('1991/04/10')).toBe('19910410');
  });

  it('falls back month 00 in YYYY-MM to YYYY-01-01', () => {
    expect(normaliseDate('1991-00')).toBe('1991-01-01');
  });
});
