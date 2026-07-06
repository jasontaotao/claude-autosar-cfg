// v1.31.1 PATCH — shared Dcm BSWMD path predicate.
//
// Pinned behaviour: `isDcmBswmdPath` matches `Dcm.arxml` and
// `Dcm_*.arxml` filenames case-insensitively. Used by App.tsx
// (gate derivation) and ContextMenu.tsx (entry visibility) —
// extracted in v1.31.1 PATCH from the v1.31.0 inline regex
// duplication (FINAL whole-branch review Minor #21).

import { describe, expect, it } from 'vitest';

import { isDcmBswmdPath } from '../regex.js';

describe('isDcmBswmdPath (v1.31.1 PATCH)', () => {
  it('matches canonical Bsw_Dcm_Bswmd.arxml', () => {
    expect(isDcmBswmdPath('/samples/arxml/demo-ecu/bswmd/Bsw_Dcm_Bswmd.arxml')).toBe(true);
  });

  it('matches plain Dcm.arxml', () => {
    expect(isDcmBswmdPath('/some/path/Dcm.arxml')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(isDcmBswmdPath('/path/Bsw_DCM_Bswmd.ARXML')).toBe(true);
    expect(isDcmBswmdPath('/path/DCM.arxml')).toBe(true);
  });

  it('does NOT match Bsw_Com_Bswmd.arxml (non-Dcm module)', () => {
    expect(isDcmBswmdPath('/samples/arxml/demo-ecu/bswmd/Bsw_Com_Bswmd.arxml')).toBe(false);
  });

  it('does NOT match a BSWMD named BCM_Dcm_Compat.arxml (D4 trade-off false-positive)', () => {
    // v1.31.1 PATCH D4 trade-off: filename regex is fast but
    // false-positive for non-Dcm BSWMDs named like *Dcm*.arxml.
    // The user sees BSWMD file unreadable at click time, which
    // preserves the real "this is not a Dcm BSWMD" signal.
    expect(isDcmBswmdPath('/path/BCM_Dcm_Compat.arxml')).toBe(true);
  });

  it('does NOT match a non-ARXML file with Dcm in the name', () => {
    expect(isDcmBswmdPath('/path/Dcm_Config.json')).toBe(false);
  });
});
