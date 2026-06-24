import { describe, it, expect } from 'vitest';

import {
  ARXML_DIRECT_MAP_VERSIONS,
  SUPPORTED_ARXML_VERSIONS,
  type ArxmlDocument,
  type ArxmlVersion,
} from '../types.js';
import { mapBswmdVersionToArxml } from '../version.js';

describe('arxml types', () => {
  it('exposes supported ARXML versions', () => {
    expect(SUPPORTED_ARXML_VERSIONS).toContain('4.6');
    expect(SUPPORTED_ARXML_VERSIONS.length).toBeGreaterThanOrEqual(4);
  });

  it('ArxmlDocument is structurally usable', () => {
    const doc: ArxmlDocument = {
      path: '/tmp/can.arxml',
      version: '4.6',
      packages: [],
    };
    expect(doc.packages).toEqual([]);
    expect(doc.version).toBe('4.6');
  });
});

describe('ARXML_DIRECT_MAP_VERSIONS (v1.11.4 PATCH-A — single source of truth)', () => {
  it('is the canonical 13-item list of ARXML versions', () => {
    // Pins the canonical list size so any single-side edit (adding
    // to ARXML_DIRECT_MAP_VERSIONS without updating the derived
    // sets, or vice versa) trips this test.
    expect(ARXML_DIRECT_MAP_VERSIONS.length).toBe(13);
    // Major dotted-form versions must be present.
    expect(ARXML_DIRECT_MAP_VERSIONS).toContain('4.0');
    expect(ARXML_DIRECT_MAP_VERSIONS).toContain('4.2');
    expect(ARXML_DIRECT_MAP_VERSIONS).toContain('4.4');
    expect(ARXML_DIRECT_MAP_VERSIONS).toContain('4.6');
    expect(ARXML_DIRECT_MAP_VERSIONS).toContain('4.7');
    expect(ARXML_DIRECT_MAP_VERSIONS).toContain('5.0');
    // 5-digit literals present in the canonical list (00005 / 00006
    // are BSWMD-only entries — see SUPPORTED_ARXML_VERSIONS comment).
    expect(ARXML_DIRECT_MAP_VERSIONS).toContain('00005');
    expect(ARXML_DIRECT_MAP_VERSIONS).toContain('00006');
    expect(ARXML_DIRECT_MAP_VERSIONS).toContain('00046');
    expect(ARXML_DIRECT_MAP_VERSIONS).toContain('00048');
    expect(ARXML_DIRECT_MAP_VERSIONS).toContain('00049');
    expect(ARXML_DIRECT_MAP_VERSIONS).toContain('00050');
    expect(ARXML_DIRECT_MAP_VERSIONS).toContain('00051');
  });

  it('ArxmlVersion is the literal union of ARXML_DIRECT_MAP_VERSIONS', () => {
    // Compile-time: ArxmlVersion = (typeof ARXML_DIRECT_MAP_VERSIONS)[number].
    // Runtime: every entry in the list is a valid ArxmlVersion, and
    // assigning an entry to a variable typed ArxmlVersion compiles.
    const sample: ArxmlVersion = ARXML_DIRECT_MAP_VERSIONS[0];
    expect(typeof sample).toBe('string');
  });

  it('SUPPORTED_ARXML_VERSIONS is a strict subset of ARXML_DIRECT_MAP_VERSIONS (parser-accept ⊂ direct-map)', () => {
    // The parser-accept set must be entirely contained in the
    // direct-map set. This pins the v1.11.4 PATCH-A single-source
    // invariant — if someone adds to SUPPORTED_ARXML_VERSIONS
    // without updating ARXML_DIRECT_MAP_VERSIONS (or vice versa),
    // this test fails.
    for (const v of SUPPORTED_ARXML_VERSIONS) {
      expect(ARXML_DIRECT_MAP_VERSIONS).toContain(v);
    }
    // 00005 / 00006 are in the direct-map set (BSWMD may emit them)
    // but NOT in the parser-accept set (parser normalizes 5-digit
    // r-form to dotted form — 00005 / 00006 have no r-form
    // equivalent). This pins the intentional asymmetry.
    expect(ARXML_DIRECT_MAP_VERSIONS).toContain('00005');
    expect(ARXML_DIRECT_MAP_VERSIONS).toContain('00006');
    expect(SUPPORTED_ARXML_VERSIONS).not.toContain('00005');
    expect(SUPPORTED_ARXML_VERSIONS).not.toContain('00006');
    // Parser-accept set is 11 items (13 canonical - 2 excluded).
    expect(SUPPORTED_ARXML_VERSIONS.length).toBe(11);
  });

  it('mapBswmdVersionToArxml returns every ARXML_DIRECT_MAP_VERSIONS entry unchanged (full 1:1 direct-map)', () => {
    // The BSWMD→ARXML 1:1 direct-map set in version.ts derives from
    // ARXML_DIRECT_MAP_VERSIONS. Every entry must map to itself.
    for (const v of ARXML_DIRECT_MAP_VERSIONS) {
      expect(mapBswmdVersionToArxml(v)).toBe(v);
    }
  });
});
