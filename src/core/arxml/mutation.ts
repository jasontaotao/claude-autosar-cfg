// core/arxml/mutation.ts
// SHIM — re-exports the split mutation barrel at `./mutation/index.js`.
// v1.41.x PATCH T2 (file-size backlog) split the original 1407 LoC body
// of this file into 5 sub-files under `./mutation/`. This shim preserves
// the public surface so all existing consumers
// (`import { addContainer } from '../core/arxml/mutation'`) keep
// resolving through TypeScript's Bundler module resolution.
//
// When the project migrates to `moduleResolution: "node16"` or to
// extensionless imports, this shim can be `git rm`'d and the
// `./mutation/index.js` barrel becomes the canonical entry.

export * from './mutation/index.js';
