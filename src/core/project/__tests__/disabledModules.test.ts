// Sprint 14 BSWMD-to-ECUC Task 4 — `BswmdDocument.disabledModules` + `getActiveModules`.
//
// Covers the three behavioral cases the picker chip (T11) and cascade-remove
// flow (T12) rely on:
//   1. `disabledModules` is optional — when absent, all modules are active.
//   2. When present, only modules whose `shortName` is in the set are filtered out.
//   3. Empty `modules` list yields empty active list (defensive, no exceptions).
//
// `as BswModuleDef` cast is intentional — `BswModuleDef` carries several fields
// (dialect, moduleId, containers, providedEntries, multiplicities) that aren't
// load-bearing for the filter, so the fixtures use a minimal literal shape and
// the cast bridges the type to `BswModuleDef`. Keeping the cast (rather than
// introducing a `Partial<BswModuleDef>` fixture type) avoids polluting the
// module's type surface.

import { describe, it, expect } from 'vitest';

import type { BswmdDocument, BswModuleDef } from '../bswmd.js';
import { getActiveModules } from '../bswmd.js';

// ---------------------------------------------------------------------------
// Fixtures — minimal shape, cast to `BswModuleDef` (see header comment).
// ---------------------------------------------------------------------------

const a = { shortName: 'A', path: '/A', containers: [], parameters: [], references: [] } as unknown as BswModuleDef;
const b = { shortName: 'B', path: '/B', containers: [], parameters: [], references: [] } as unknown as BswModuleDef;
const c = { shortName: 'C', path: '/C', containers: [], parameters: [], references: [] } as unknown as BswModuleDef;

describe('BswmdDocument.disabledModules', () => {
  it('defaults to empty set when omitted', () => {
    const doc: BswmdDocument = { version: '4.0', modules: [a, b], warnings: [] };
    expect(getActiveModules(doc)).toEqual([a, b]);
  });

  it('filters modules in disabledModules', () => {
    const doc: BswmdDocument = {
      version: '4.0',
      modules: [a, b, c],
      warnings: [],
      disabledModules: new Set(['B']),
    };
    const active = getActiveModules(doc);
    expect(active).toEqual([a, c]);
  });

  it('handles empty modules list', () => {
    const doc: BswmdDocument = { version: '4.0', modules: [], warnings: [] };
    expect(getActiveModules(doc)).toEqual([]);
  });
});
