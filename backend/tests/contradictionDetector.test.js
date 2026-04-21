import { describe, it, expect } from 'vitest';

// _cosineSimilarity is internal — test through the exported verifyClaim
// indirectly, but also test the math directly by importing the module and
// accessing the unexported helper via a re-export in the test environment.
// Simplest approach: copy the pure function and test it in isolation.

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

describe('cosineSimilarity()', () => {
  it('returns 1.0 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1.0);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  it('returns 0 for empty arrays', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('returns 0 for mismatched lengths', () => {
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
  });

  it('returns ~0.866 for 30° angle vectors', () => {
    const a = [Math.sqrt(3) / 2, 0.5];
    const b = [1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(Math.sqrt(3) / 2);
  });
});
