// core/project/bswmd/validate.ts
// BSWMD validation / version-detection helpers — re-export surface +
// `validateModuleDefaults` real impl.
//
// Split from `src/core/project/bswmd.ts` as part of v1.41.x PATCH T1
// (file-size backlog). NOT to be confused with the larger
// `src/core/validation/validate.ts` module (which validates ARXML
// documents).
//
// This sub-file owns the post-parse default-value cross-check
// (`validateModuleDefaults`) + its internal `walkContainerDefaults`
// walker, and re-exports `asArray` / `detectVersion` /
// `detectVersionLiteral` (whose implementations still live in
// `parse.js` for historical reasons).
//
// Re-export surface mirrors the brief's slice (lines 448-475 +
// 571-585 of the pre-split `bswmd.ts`).
//
// v1.46.0 MINOR T1 (cycle-break): moved `validateModuleDefaults` real
// impl from `parse.ts` into this file. The circular re-export
// (`parse.ts` imports `validateModuleDefaults` from `./validate.js`,
// `validate.ts` re-exports it from `./parse.js`) is now broken —
// `parse.ts` no longer needs to declare `validateModuleDefaults` and
// `validate.ts` no longer imports any runtime helpers from `parse.js`
// for the `validateModuleDefaults` impl.
//
// `walkContainerDefaults` is a private walker used only by
// `validateModuleDefaults` and lives in this file too (the
// single-file coupling is preserved).

import type { BswModuleDef, ContainerDef } from './types.js';

// Re-exports: thin alias layer for downstream callers that prefer
// `./validate.js` over `./parse.js` for these helpers. Impls still
// live in `parse.js` per historical split (T0 step 0 baseline).
export { asArray, detectVersion, detectVersionLiteral } from './parse.js';

// ---------------------------------------------------------------------------
// Default-value validation (called by parseBswmd after walkPackagesForModules)
// ---------------------------------------------------------------------------

/**
 * Walk every module and emit a warning when an enumeration param's
 * `<DEFAULT-VALUE>` is not in its declared `<LITERALS>` set.
 *
 * Sprint 13 Stage 5.D — non-fatal cross-check. The vendor-tool failure
 * mode this guards against is: BSWMD declares LITERALS=[A,B] but
 * DEFAULT-VALUE=C. The renderer's default-value editor can't
 * roundtrip this — the value "C" would not be valid for the dropdown.
 * A warning lets the project panel surface a degraded-state banner.
 *
 * Scope: only enumeration params (other kinds are bounded by MIN/MAX
 * and validated in the schema layer, not by literal set). Walks
 * `subContainers` and `choices` recursively — same traversal pattern
 * as `findContainerInTree`.
 */
export function validateModuleDefaults(modules: readonly BswModuleDef[], warnings: string[]): void {
  for (const mod of modules) {
    for (const c of mod.containers) {
      walkContainerDefaults(c, warnings);
    }
  }
}

function walkContainerDefaults(container: ContainerDef, warnings: string[]): void {
  for (const p of container.parameters) {
    // Only enumeration params carry a literal set. Other kinds are out
    // of scope: integer/float are bounded by MIN/MAX, string/function-name
    // by length constraints, boolean is two-valued.
    if (p.kind !== 'enumeration') continue;
    if (typeof p.defaultValue !== 'string') continue;
    if (p.enumerationLiterals.length === 0) continue;
    if (p.enumerationLiterals.includes(p.defaultValue)) continue;
    warnings.push(
      `DEFAULT-VALUE '${p.defaultValue}' for enumeration param '${p.path}' is not in declared literals [${p.enumerationLiterals.join(', ')}]`,
    );
  }
  for (const sub of container.subContainers) {
    walkContainerDefaults(sub, warnings);
  }
  for (const choice of container.choices) {
    walkContainerDefaults(choice, warnings);
  }
}
