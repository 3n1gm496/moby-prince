import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Verify the contradiction fallback was removed by inspecting source code.
// This catches accidental reintroduction of the unrelated-contradictions fallback.
describe('answer.js — no unrelated contradictions fallback', () => {
  it('does not call contradictionsRepo.list() as a fallback when no source URIs match', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(__dirname, '../routes/answer.js'), 'utf8');

    // The removed fallback block contained this exact pattern:
    const forbiddenPattern = /contradictions\.length\s*===\s*0.*contradictionsRepo\.list/s;
    expect(forbiddenPattern.test(src)).toBe(false);
  });

  it('still calls listBySourceUris when source URIs are found', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(__dirname, '../routes/answer.js'), 'utf8');
    expect(src).toContain('listBySourceUris');
  });
});
