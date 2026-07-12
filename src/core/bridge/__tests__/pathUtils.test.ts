// v1.54.0 PATCH T6 (F-A5-02 closure) — unit test for
// `core/bridge/pathUtils.ts:stripBswmdPackageRoot`. Pre-v1.54.0 this
// 28-LoC module had ZERO unit test coverage; only transitive coverage
// via `xlsxToEcucBatch.ts`. The function is the documented seam
// between BSWMD-absolute paths and module-relative target paths
// used by `applyPatchSteps.add-child` — a regression here would
// silently break every xlsx-driven Com-stack bridge.
//
// 5 cases covering happy + edge paths:
//   1. standard 2-segment path: `/Com/ComConfig` → `ComConfig`
//   2. deeply-nested path: `/Dcm/DcmDsp/DcmDspDid` → `DcmDsp/DcmDspDid`
//   3. single-segment path (no slash after root): `/ComConfig` → `ComConfig` (no-op passthrough)
//   4. multi-character package name preserved: `/Bsw_Com_Bswmd/ComConfig` → `ComConfig`
//   5. no leading slash (already-relative): `Com/ComConfig` → `ComConfig`

import { describe, expect, it } from 'vitest';

import { stripBswmdPackageRoot } from '../pathUtils.js';

describe('stripBswmdPackageRoot (v1.54.0 PATCH T6)', () => {
  it('strips the leading /<package>/ segment from a standard 2-segment BSWMD path', () => {
    expect(stripBswmdPackageRoot('/Com/ComConfig')).toBe('ComConfig');
  });

  it('strips only the FIRST segment when path is deeply nested', () => {
    // The companion to `core/arxml/extractPatch.ts#prefixDocRootPath`
    // re-applies the prefix at stitch time, so the trailing segments
    // must be preserved verbatim.
    expect(stripBswmdPackageRoot('/Dcm/DcmDsp/DcmDspDid')).toBe('DcmDsp/DcmDspDid');
  });

  it('returns single-segment paths unchanged (regex requires 2nd `/` to match)', () => {
    // Defensive: a path like `/ComConfig` has only ONE `/` and the
    // regex `/^\/[^/]+\//` requires at least 2. So `/ComConfig` does
    // NOT match and the function returns it verbatim. Document the
    // actual behavior so a future "fix" doesn't break callers that
    // rely on the tolerant passthrough.
    expect(stripBswmdPackageRoot('/ComConfig')).toBe('/ComConfig');
  });

  it('preserves multi-character package names (underscore-prefixed BSWMD modules)', () => {
    // BSWMD module shortNames often include `Bsw_*` prefixes per AUTOSAR
    // canonical naming. The regex `/^\/[^/]+\//` matches the entire
    // first segment regardless of character set.
    expect(stripBswmdPackageRoot('/Bsw_Com_Bswmd/ComConfig')).toBe('ComConfig');
  });

  it('handles already-relative paths (no leading slash at all)', () => {
    // The regex requires `^\/[^/]+\/`; a path with no leading slash
    // cannot match, so the input is returned unchanged. This case
    // exists to document the behavior — callers SHOULD pass
    // BSWMD-absolute paths (those returned by `parseBswmd`), but
    // tolerant passthrough is the safe default.
    expect(stripBswmdPackageRoot('Com/ComConfig')).toBe('Com/ComConfig');
  });
});
