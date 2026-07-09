// core/project/bswmd/validate.ts
// BSWMD validation / version-detection helpers — re-export surface.
//
// Split from `src/core/project/bswmd.ts` as part of v1.41.x PATCH T1
// (file-size backlog). NOT to be confused with the larger
// `src/core/validation/validate.ts` module (which validates ARXML
// documents).
//
// This sub-file is the public re-export point for the BSWMD internal
// helpers that aren't part of the parsed data shape: version detection
// (`detectVersion` / `detectVersionLiteral`), the `asArray<T>`
// normalisation helper, and the post-parse default-value
// cross-check (`validateModuleDefaults`). The implementations live in
// `parse.js` to keep `parse.ts` free of cross-file dependencies on
// sibling sub-files; this file is a thin alias layer that gives
// downstream callers a logical import path (`./validate.js`) for
// these helpers.
//
// All types come from `./types.js`. Public surface mirrors the brief's
// slice (lines 448-475 + 571-585 of the pre-split `bswmd.ts`).

export { asArray, detectVersion, detectVersionLiteral, validateModuleDefaults } from './parse.js';
