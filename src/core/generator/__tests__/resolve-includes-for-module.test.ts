// src/core/generator/__tests__/resolve-includes-for-module.test.ts
//
// v1.15.0 MINOR (B-1) — unit tests for `resolveIncludesForModule`.
// The helper replaces the inline 6-line block in EcuCGenerator.emit
// and McuGenerator.emit (cross-helper Set-based dedup of self + ref
// includes, preserving the existing AUTOSAR convention ordering:
// selfPaths first, refPaths second).

import { describe, it, expect } from 'vitest';

import { resolveIncludesForModule } from '../modules/_shared.js';

describe('resolveIncludesForModule (v1.15.0 MINOR B-1)', () => {
  it('returns selfPaths only when module has <STD-INCLUDES> but no refs', () => {
    // Arrange
    const bswmdIndex = new Map([
      [
        'EcuC',
        { shortName: 'EcuC', includes: ['Os/Os_Cfg.h', 'Dem/Dem_Cfg.h'] },
      ],
    ]);
    // Act
    const out = resolveIncludesForModule('EcuC', [], bswmdIndex);
    // Assert
    expect(out.selfPaths).toEqual(['Os/Os_Cfg.h', 'Dem/Dem_Cfg.h']);
    expect(out.refPaths).toEqual([]);
  });

  it('returns refPaths only when module has refs but no <STD-INCLUDES>', () => {
    // Arrange
    const bswmdIndex = new Map([
      ['EcuC', { shortName: 'EcuC' }],
      ['Os', { shortName: 'Os', moduleHeader: 'Os/Os_Cfg.h' }],
    ]);
    const refs = [{ targetModule: 'Os', path: 'EcuC/OsRef', targetPath: 'Os/OsCoreRef' }];
    // Act
    const out = resolveIncludesForModule('EcuC', refs, bswmdIndex);
    // Assert
    expect(out.selfPaths).toEqual([]);
    expect(out.refPaths).toEqual(['Os/Os_Cfg.h']);
  });

  it('returns selfPaths + refPaths when module has both, deduped', () => {
    // Arrange — ref-target header happens to match a self-include.
    // The helper must emit the path exactly once, in selfPaths order.
    const bswmdIndex = new Map([
      ['EcuC', { shortName: 'EcuC', includes: ['Os/Os_Cfg.h', 'Dem/Dem_Cfg.h'] }],
      ['Os', { shortName: 'Os', moduleHeader: 'Os/Os_Cfg.h' }],
    ]);
    const refs = [{ targetModule: 'Os', path: 'EcuC/OsRef', targetPath: 'Os/OsCoreRef' }];
    // Act
    const out = resolveIncludesForModule('EcuC', refs, bswmdIndex);
    // Assert — selfPaths first, refPaths empty (the shared path is in self)
    expect(out.selfPaths).toEqual(['Os/Os_Cfg.h', 'Dem/Dem_Cfg.h']);
    expect(out.refPaths).toEqual([]);
  });

  it('returns empty arrays for a module with neither self-includes nor refs', () => {
    // Arrange
    const bswmdIndex = new Map([['EcuC', { shortName: 'EcuC' }]]);
    // Act
    const out = resolveIncludesForModule('EcuC', [], bswmdIndex);
    // Assert
    expect(out.selfPaths).toEqual([]);
    expect(out.refPaths).toEqual([]);
  });

  it('does not mutate the cross-helper dedup contract', () => {
    // The helper's internal Set is local; the returned `selfPaths` is
    // a fresh array. The test asserts the helper is fully immutable
    // (no shared state between calls).
    // Arrange
    const bswmdIndex = new Map([
      ['EcuC', { shortName: 'EcuC', includes: ['A/A.h', 'B/B.h'] }],
    ]);
    // Act — call twice
    const a = resolveIncludesForModule('EcuC', [], bswmdIndex);
    const b = resolveIncludesForModule('EcuC', [], bswmdIndex);
    // Assert — both calls return independent arrays with the same content
    expect(a.selfPaths).toEqual(['A/A.h', 'B/B.h']);
    expect(b.selfPaths).toEqual(['A/A.h', 'B/B.h']);
    expect(a.selfPaths).not.toBe(b.selfPaths); // different array refs
  });

  it('silently drops invalid self-include paths (SEC3 owns the diagnostic)', () => {
    // The helper passes paths through `buildSelfIncludes`, which calls
    // `validateHeaderPath` and drops failures. The validator
    // (validateModuleHeaderPaths) owns the BSW-SEC-002 push; the
    // helper is silent for invalid paths.
    // Arrange
    const bswmdIndex = new Map([
      [
        'EcuC',
        { shortName: 'EcuC', includes: ['ok.h', 'bad$(rm).h'] },
      ],
    ]);
    // Act
    const out = resolveIncludesForModule('EcuC', [], bswmdIndex);
    // Assert
    expect(out.selfPaths).toEqual(['ok.h']);
  });
});
