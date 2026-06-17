// Sprint 13 #1 — `parseTemplateManifest` type guard tests.
//
// The guard validates the on-disk `template.json` shape:
//   { id: string (kebab-case), displayName: string, description: string }
//
// Cases (5):
//   1. valid manifest → returns the parsed object
//   2. missing displayName → returns null
//   3. missing description → returns null
//   4. missing id → returns null
//   5. id with uppercase letters → returns null (kebab-case required)

import { describe, expect, it } from 'vitest';

import { parseTemplateManifest } from '../parse-manifest.js';

describe('parseTemplateManifest (Sprint 13 #1)', () => {
  it('returns the parsed manifest for a valid object', () => {
    const r = parseTemplateManifest({
      id: 'empty',
      displayName: 'Empty',
      description: 'Start fresh',
    });
    expect(r).toEqual({
      id: 'empty',
      displayName: 'Empty',
      description: 'Start fresh',
    });
  });

  it('returns null when displayName is missing', () => {
    const r = parseTemplateManifest({
      id: 'empty',
      description: 'Start fresh',
    });
    expect(r).toBeNull();
  });

  it('returns null when description is missing', () => {
    const r = parseTemplateManifest({
      id: 'empty',
      displayName: 'Empty',
    });
    expect(r).toBeNull();
  });

  it('returns null when id is missing', () => {
    const r = parseTemplateManifest({
      displayName: 'Empty',
      description: 'Start fresh',
    });
    expect(r).toBeNull();
  });

  it('returns null when id contains uppercase letters', () => {
    const r = parseTemplateManifest({
      id: 'Classic',
      displayName: 'Classic',
      description: 'x',
    });
    expect(r).toBeNull();
  });
});
