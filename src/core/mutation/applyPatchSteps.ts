// core/mutation/applyPatchSteps.ts
// SHIM — re-exports the split patch-step engine barrel at
// `./applyPatchSteps/index.js`. v1.41.x PATCH T2 (file-size backlog)
// split the original 923 LoC body of this file into 3 sub-files under
// `./applyPatchSteps/`. This shim preserves the public surface so all
// existing consumers
// (`import { applyPatchSteps } from '../core/mutation/applyPatchSteps'`)
// keep resolving through TypeScript's Bundler module resolution.
//
// When the project migrates to `moduleResolution: "node16"` or to
// extensionless imports, this shim can be `git rm`'d and the
// `./applyPatchSteps/index.js` barrel becomes the canonical entry.

export * from './applyPatchSteps/index.js';
