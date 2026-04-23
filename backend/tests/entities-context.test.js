import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

describe('entities context route', () => {
  it('reads materialized profiles instead of generating summaries live', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(__dirname, '../routes/entities.js'), 'utf8');
    expect(src).toContain("profilesRepo.getEntityProfile");
    expect(src).not.toContain("generateJson(");
  });

  it('returns related entities in the entity context payload', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const src = fs.readFileSync(path.join(__dirname, '../routes/entities.js'), 'utf8');
    expect(src).toContain("relatedEntities");
    expect(src).toContain("entitiesRepo.listRelated");
  });
});
