import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

describe('answer.js — evidence-only SSE flow', () => {
  it('does not reference contradictions anywhere in the route', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(__dirname, '../routes/answer.js'), 'utf8');
    expect(src).not.toMatch(/contradiction/i);
  });

  it('still emits the answer event to the SSE stream', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(__dirname, '../routes/answer.js'), 'utf8');
    expect(src).toContain("sendEvent('answer'");
  });
});
