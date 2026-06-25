// src/core/generator/emit/types.ts
//
// `typeToCType` is the TS-callable counterpart of `cType()` in
// handlebars-helpers.ts. Re-export the same function so callers in
// `emit/*.ts` and tests don't have to know about the helper module.
//
// v1.13.2 PATCH-E: previously this file held a 37-line copy of the
// integer→C-type ladder (D-rev2 R1 finding). It now re-exports
// `cType` from `handlebars-helpers.ts` so the ladder lives in one
// place (`integerToCType`).

export { cType as typeToCType } from '../handlebars-helpers.js';
