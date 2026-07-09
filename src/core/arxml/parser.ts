// core/arxml/parser.ts
// SHIM — re-exports the split parser barrel at `./parser/index.js`.
// v1.41.x PATCH T4 (file-size backlog) split the original 819 LoC
// body of this file into 3 sub-files under `./parser/`. This shim
// preserves the public surface so all existing consumers
// (`import { parseArxml } from '../core/arxml/parser'`) keep resolving
// through TypeScript's Bundler module resolution.

export * from './parser/index.js';
