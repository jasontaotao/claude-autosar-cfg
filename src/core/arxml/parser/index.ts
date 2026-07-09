// core/arxml/parser/index.ts
// Barrel re-export for the split ARXML parser. v1.41.x PATCH T4
// (file-size backlog) split the 819 LoC `src/core/arxml/parser.ts`
// into 3 sub-files under `./parser/`. This barrel preserves the
// internal `import { parseArxml } from './parser/index.js'` shape.
//
// The external shim at `../parser.ts` re-exports this barrel so
// `import { parseArxml } from '../core/arxml/parser'` keeps resolving
// through TypeScript's Bundler module resolution.

export * from './parse.js';
export * from './walk.js';
export * from './build.js';
