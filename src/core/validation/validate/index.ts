// core/validation/validate/index.ts
// Validation module barrel — re-exports the public API of the validate
// sub-files.
//
// Split from `src/core/validation/validate.ts` as part of v1.41.x
// PATCH T1 (file-size backlog). The original `validate.ts` is kept as
// a thin redirect shim (see comment at top of that file) so existing
// import paths (`import { ... } from './validate.js'`) keep resolving
// under TypeScript's `moduleResolution: "Bundler"` + `module: "ESNext"`
// combination, which does not auto-resolve directory indexes for
// `.js`-suffixed relative imports.
//
// Internal consumers should import from the canonical barrel
// (`'./validate/index.js'`) once migrated. The shim file remains the
// public surface until the project switches tsconfig or refactors all
// consumer imports.

export { validate } from './walk.js';
export { buildPathIndex, extractReferences, validateProject } from './project.js';
export {
  buildShortNameIndex,
  tryResolveByShortName,
  tryResolveByShortNameWithIndex,
  validateVariantCoverage,
} from './coverage.js';
export type { VariantCoverageValue, VariantCoverageWarning } from './coverage.js';
// NOTE: `checkCrossRefs`, `checkRefDests`, `checkRefCycles`, `checkParam`,
// `checkContainerMultiplicity`, `typeMatches`, `canonicalCycleKey`,
// `emitRefCycleError`, `isUnsetPlaceholder` are NOT re-exported here.
// They are internal helpers used by `validateProject` and `validate`.
// External callers go through the higher-level entry points.
