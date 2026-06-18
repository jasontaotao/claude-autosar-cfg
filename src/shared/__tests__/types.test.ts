// Sprint 14 Task 1 — ArxmlDocument.sourceBswmdPath contract test.
//
// Verifies the optional `sourceBswmdPath` field added to the shared
// ArxmlDocument type. The field is set by the BSWMD-to-ECUC skeleton
// flow (Task 8) so the cascade-remove flow (Task 12) can find
// dependents. Manual / Open ARXML flows leave it undefined.
//
// The test imports the re-export from `shared/types` (the public
// surface consumed by main + preload + renderer); the underlying
// declaration lives in `core/arxml/types.ts` but is re-exported here.

import { describe, expect, it } from 'vitest';

import type { ArxmlDocument } from '../types.js';

describe('ArxmlDocument.sourceBswmdPath (Sprint 14 Task 1)', () => {
  it('accepts optional sourceBswmdPath field', () => {
    const doc: ArxmlDocument = {
      path: '/proj/Can_Cfg.arxml',
      version: '4.6',
      packages: [],
      sourceBswmdPath: '/proj/Can_bswmd.arxml',
    };
    expect(doc.sourceBswmdPath).toBe('/proj/Can_bswmd.arxml');
  });

  it('is optional (can be omitted)', () => {
    const doc: ArxmlDocument = {
      path: '/proj/manual.arxml',
      version: '4.6',
      packages: [],
    };
    expect(doc.sourceBswmdPath).toBeUndefined();
  });
});
