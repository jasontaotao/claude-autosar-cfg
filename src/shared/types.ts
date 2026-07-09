// shared/types.ts
// SHIM — re-exports the split types barrel at `./types/index.js`.
// v1.41.x PATCH T4 (file-size backlog) split the original 1240 LoC
// body of this file into 12 domain-grouped sub-files under `./types/`.
// This shim preserves the public surface so all existing consumers
// (`import { X } from '../shared/types'`) keep resolving through
// TypeScript's Bundler module resolution.
//
// When the project migrates to `moduleResolution: "node16"` or to
// extensionless imports, this shim can be `git rm`'d and the
// `./types/index.js` barrel becomes the canonical entry.

export * from './types/index.js';
