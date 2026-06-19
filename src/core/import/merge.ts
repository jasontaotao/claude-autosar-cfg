// Sprint 14 ECUC ARXML Import — buildMergedView.
//
// Pure function that produces a `MergedView` from the immutable
// target docs and the current `ImportSession`. The merged view is a
// *virtual* representation; the source documents are never modified
// until `compileResolutionToPatches` + `applyPatchesToDocument` runs
// at commit time (spec §3.2 design invariant: source doc is fully
// untouched before commit).
//
// Segment naming:
//   - Combined View uses `[doc:N]` (useArxmlStore.wrapPackageUnderSegment)
//   - Import Merged View uses `[import:N]` (this file) — spec §5.3
//
// The view is consumed by the renderer (ModuleSelectionPanel +
// DiffTable) and by the validator (cross-ref / ref-dest etc.).

import type { ArxmlDocument, ArxmlElement, ArxmlModule } from '../arxml/types.js';

import type {
  ImportResolution,
  ImportSession,
  MergedModule,
  MergedView,
  ModuleSelection,
} from './types.js';

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * Build the virtual merged view from the immutable target documents
 * and the current import session.
 *
 *   - target documents are passed through unchanged
 *   - mergedModules lists every *selected* incoming module that
 *     passes the resolution filter (skip → dropped, keep-both →
 *     renamed to `<shortName>_imported`, overwrite / keep-existing →
 *     kept as-is)
 *   - missing resolutions default to 'overwrite' (spec §6.1 step 7
 *     surfaces this to the user via the commit-time confirm dialog)
 */
export function buildMergedView(
  targetDocuments: readonly ArxmlDocument[],
  session: ImportSession,
): MergedView {
  const resolutionsByPath = new Map<string, ImportResolution>();
  for (const r of session.resolutions) {
    resolutionsByPath.set(r.mergedModulePath, r.resolution);
  }

  const mergedModules: MergedModule[] = [];
  for (const sel of session.selections) {
    if (!sel.selected) continue;
    const resolution = resolutionsByPath.get(sel.mergedModulePath) ?? 'overwrite';
    const visible = renderSelection(sel, resolution);
    if (visible) mergedModules.push(visible);
  }

  return {
    targetDocuments,
    mergedModules,
    originalIncomingDocs: session.incomingDocs,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a single `ModuleSelection` + `ImportResolution` into the
 * `MergedModule` row that the panel renders. Returns `null` for
 * 'skip' (dropped from the view entirely).
 *
 *   - 'overwrite' / 'keep-existing' → keep shortName as-is
 *   - 'keep-both'                  → rename to `<shortName>_imported`
 *   - 'skip'                       → return null
 */
function renderSelection(
  sel: ModuleSelection,
  resolution: ImportResolution,
): MergedModule | null {
  if (resolution === 'skip') return null;
  const shortName =
    resolution === 'keep-both' ? `${sel.moduleShortName}_imported` : sel.moduleShortName;
  return {
    mergedModulePath: sel.mergedModulePath,
    sourceDocIndex: sel.sourceDocIndex,
    shortName,
    selected: sel.selected,
    collidesWithTarget: sel.collidesWithTarget,
    targetModulePath: sel.targetModulePath,
  };
}

/**
 * Walk an ArxmlDocument's package tree and yield every module found
 * inside it. Used by callers that need to enumerate existing modules
 * (e.g. collision detection in the store); exposed for completeness
 * even though buildMergedView itself only needs the session data.
 */
export function* iterModules(doc: ArxmlDocument): Generator<ArxmlModule> {
  for (const pkg of doc.packages) {
    for (const el of pkg.elements) {
      yield* walkForModules(el);
    }
  }
}

function* walkForModules(el: ArxmlElement): Generator<ArxmlModule> {
  if (el.kind === 'module') {
    yield el;
    return;
  }
  if (el.kind === 'container') {
    for (const child of el.children) {
      yield* walkForModules(child);
    }
  }
}

/**
 * Build a virtual merged-path for a module that lives at source
 * doc index `N`, package `P`, with short name `M`. The renderer
 * uses this when synthesising the package tree inside the merged
 * view (the actual package path comes from the package traversal
 * the renderer already does).
 */
export function mergedPathFor(
  sourceDocIndex: number,
  packagePath: string,
  shortName: string,
): string {
  return `/[import:${sourceDocIndex}]${packagePath}/${shortName}`;
}
