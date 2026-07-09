// core/project/bswmd/index.ts
// BSWMD module barrel — re-export surface.
//
// Split from `src/core/project/bswmd.ts` as part of v1.41.x PATCH T1
// (file-size backlog). TypeScript `moduleResolution: "Bundler"` resolves
// `import { ... } from '../project/bswmd'` to the legacy shim
// `bswmd.ts` (a thin re-export of this file) because the project is on
// `module: "ESNext"` + `.js`-suffixed relative imports, which Bundler
// mode does not auto-resolve to directory indexes.
//
// Internal consumers / tests import from `'../project/bswmd/index.js'`
// directly; the legacy path keeps working through the shim.
//
// Order matters: types come first so downstream files that only
// import types compile cleanly even when the runtime helpers are tree-
// shaken out.
//
// Avoid name collisions: `parse.js` exports the same helpers that
// `validate.js` re-exports (asArray / detectVersion / detectVersionLiteral
// / validateModuleDefaults). Re-exporting via `export * from './parse.js'`
// first, then via `validate.js` second, double-defines those names. Use
// a single `export * from './parse.js'` line and explicit `export * from
// './lookup.js'` + `export * from './validate.js'`.

export * from './types.js';
export * from './parse.js';
export * from './lookup.js';
