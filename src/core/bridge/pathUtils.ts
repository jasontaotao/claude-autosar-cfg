// core/bridge/pathUtils.ts
//
// Small BSWMD-path utilities used by the bridge-layer mappers
// (`xlsxToEcucBatch.ts`, `xlsxDcmServicesToEcucBatch.ts`, etc.).
// v1.28.0 MINOR — extracted `stripBswmdPackageRoot` from the
// Com-stack mapper (`xlsxToEcucBatch.ts:71`, was inline `.replace(/^\/[^/]+\//, '')`)
// to close the v1.27.2 PATCH release notes §"Out of Scope (deferred)"
// item that flagged this as a single-site extraction candidate.
// At the time it was flagged, it was a YAGNI call; with v1.28.0
// MINOR bundling the broader mapper-shape alignment work into a
// future MINOR, the helper takes its place as the documented
// surface for the operation so future alignment work can replace
// it without grep'ing for inline regexes.

/**
 * Strip the leading `/<packageName>/` segment from a BSWMD-side
 * container path. E.g. `/Com/ComConfig/ComIPdu` → `ComConfig/ComIPdu`,
 * `/Dcm/DcmDspDid` → `DcmDspDid`.
 *
 * Used by the Com-stack xlsx mapper to translate BSWMD-absolute paths
 * to module-relative target paths suitable for `applyPatchSteps.add-child`.
 * Companion to `core/arxml/extractPatch.ts#prefixDocRootPath`, which
 * re-applies the prefix at stitch time.
 */
export function stripBswmdPackageRoot(bswmdPath: string): string {
  return bswmdPath.replace(/^\/[^/]+\//, '');
}
