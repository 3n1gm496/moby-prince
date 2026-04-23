import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

describe('events repo timeline contract', () => {
  it('uses source_anchors and the correct claim document URI field', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(__dirname, '../repos/events.js'), 'utf8');
    expect(src).toContain("source_anchors");
    expect(src).toContain("COALESCE(d.source_uri, c.document_uri)");
    expect(src).not.toContain("c.source_uri");
  });

  it('enriches entity event queries through the same timeline path', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(__dirname, '../repos/events.js'), 'utf8');
    expect(src).toContain("async function listByEntity");
    expect(src).toContain("_listTimelineInternal({ entityId, limit })");
  });
});
