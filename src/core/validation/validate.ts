// core/validation/validate.ts
// Validation module shim — preserves the legacy `import { ... } from
// '../core/validation/validate.js'` import path for the in-module
// consumer (`src/core/validation/index.ts`) and direct external
// importers (none today, but the barrel preserves the surface).
//
// WHY THIS FILE EXISTS (mirrors the bswmd.ts shim rationale):
//
//   The brief / spec for v1.41.x PATCH T1 instructs splitting
//   `src/core/validation/validate.ts` (1019 LoC) into a 5-file
//   directory under `src/core/validation/validate/`. After the split
//   the directory's `index.ts` is the canonical barrel.
//
//   TypeScript with `moduleResolution: "Bundler"` + `module: "ESNext"`
//   does NOT auto-resolve a directory `index.ts` for `.js`-suffixed
//   relative imports — `./validate.js` resolves to `validate.ts` (file)
//   only. So either:
//
//     A. Update every consumer to use `./validate/index.js`.
//     B. Keep a thin shim file at `validate.ts` that re-exports from
//        `./validate/index.ts`.
//
//   This file is the workaround (B). The original `validate.ts` body
//   was deleted in T1's commit; this replacement shim re-introduces
//   the resolution target so the import graph stays intact.
//
//   Maintenance: when the project switches to `moduleResolution:
//   "Node16"` or extensionless imports (Bundler allows both), this
//   shim can be deleted and the directory's `index.ts` becomes the
//   resolution target natively.

// Internal sub-bundle re-exports — `checkCrossRefs`, `checkRefDests`,
// `checkRefCycles` live in `./validate/checks.js`. The original
// `validate.ts` re-exported them directly; this shim preserves that.
export { checkCrossRefs, checkRefDests, checkRefCycles } from './validate/checks.js';

export {
  validate,
  buildPathIndex,
  extractReferences,
  validateProject,
  buildShortNameIndex,
  tryResolveByShortName,
  tryResolveByShortNameWithIndex,
  validateVariantCoverage,
} from './validate/index.js';
export type { VariantCoverageValue, VariantCoverageWarning } from './validate/index.js';

// Path-normalize helpers — the original `validate.ts` also re-exported
// these from `./pathNormalize.js`. The shim preserves that surface so
// `validation/index.ts` (the module barrel) can keep its existing
// re-export list unchanged.
export { normalizePath, tryStripTypeSegment, resolveTargetPath } from './pathNormalize.js';
