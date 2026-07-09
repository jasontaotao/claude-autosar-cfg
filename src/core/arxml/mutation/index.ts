// core/arxml/mutation/index.ts
// Barrel re-export for the split mutation engine. v1.41.x PATCH T2
// (file-size backlog) split the 1407 LoC `src/core/arxml/mutation.ts`
// into 5 sub-files under `./mutation/`. This barrel preserves the
// internal `import { addContainer } from './mutation/index.js'` shape
// used by callers like `core/mutation/applyPatchSteps/` and
// `renderer/store/`.
//
// The external shim at `../mutation.ts` re-exports this barrel so
// `import { addContainer } from '../core/arxml/mutation'` (without the
// `/index` suffix) keeps resolving through TypeScript Bundler resolution.

export * from './types.js';
export * from './container-ops.js';
export * from './param-ref-ops.js';
export * from './discovery.js';
export * from './tree-ops.js';
