import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('timeline route hardening', () => {
  it('does not keep the legacy GCS timeline fallback', () => {
    const src = fs.readFileSync(path.join(__dirname, '../routes/timeline.js'), 'utf8');
    expect(src).not.toContain('_readGcsEvents');
    expect(src).not.toContain("source: 'gcs'");
    expect(src).toContain("source: 'bigquery'");
    expect(src).toContain('BigQuery non configurato');
  });

  it('server only mounts the authoritative timeline endpoint', () => {
    const src = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    expect(src).toContain("app.use('/api/timeline'");
    expect(src).not.toContain("app.use('/api/events'");
  });
});
