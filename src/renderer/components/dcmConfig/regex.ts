// v1.31.1 PATCH — shared Dcm BSWMD path predicate.
//
// Single source of truth for "is this ARXML path a Dcm BSWMD?".
// Used by:
//   - App.tsx (gate derivation `hasDcmBswmd` for the AppHeader
//     dropdown enable + the ContextMenu entry visibility)
//   - ContextMenu.tsx (gates the "Generate Dcm Config" entry on
//     the right-click of a BSWMD row)
//   - DcmConfigTrigger.tsx (v1.30.0 PATCH discoverable usage)
//
// v1.31.0 PATCH duplicated this regex in two files (App.tsx +
// ContextMenu.tsx) — the FINAL whole-branch review flagged the
// duplication as Minor #21. v1.31.1 PATCH extracts the constant
// here so a future v1.32.0 MINOR can switch to BSWMD-parse-based
// detection (D4 trade-off) by editing one file.
//
// Trade-off (D4): filename regex is 1000x faster than parsing the
// BSWMD to find a `Dcm` module shortName. The trade-off is false
// positives for non-Dcm BSWMDs named like `BCM_Dcm_Compat.arxml` —
// these surface as `BSWMD file unreadable` at click time, which
// preserves the real "this is not a Dcm BSWMD" signal downstream.

/** Matches ARXML paths ending in `Dcm.arxml` or `Dcm_*.arxml`. Case-insensitive. */
export const DCM_BSWMD_PATH_REGEX: RegExp = /Dcm\.arxml$|Dcm_.*\.arxml$/i;

/** Test helper: same regex but exposed as a function for readability at call sites. */
export function isDcmBswmdPath(path: string): boolean {
  return DCM_BSWMD_PATH_REGEX.test(path);
}
