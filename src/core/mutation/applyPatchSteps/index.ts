// core/mutation/applyPatchSteps/index.ts
// Barrel re-export for the split patch-step engine. v1.41.x PATCH T2
// (file-size backlog) split the 923 LoC `src/core/mutation/applyPatchSteps.ts`
// into 3 sub-files under `./applyPatchSteps/`. This barrel preserves
// the internal `import { applyPatchSteps } from './applyPatchSteps/index.js'`
// shape used by callers like `main/ipc/` and `cli/handlers/`.
//
// The external shim at `../applyPatchSteps.ts` re-exports this barrel so
// `import { applyPatchSteps } from '../core/mutation/applyPatchSteps'`
// (without the `/index` suffix) keeps resolving through TypeScript
// Bundler resolution.

export * from './types.js';
export * from './engine.js';
export * from './helpers.js';
