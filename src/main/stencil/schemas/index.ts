// v1.8.0 K Stencil Wizard — Task 2 (schemas barrel).
//
// Single re-export surface for the four hand-curated family skeletons.
// Task 3 (`builder.ts`) imports from here so adding a new family later
// only touches this file + the new schema module — the dispatcher
// `Record<StencilFamily, ...>` then flags the missing entry at
// compile time.
//
// Project uses ESM with NodeNext resolution; relative imports
// therefore carry the `.js` suffix even though the source is `.ts`.

export { buildComModule } from './com.js';
export { buildCommModule } from './comm.js';
export { buildEcucModule } from './ecuc.js';
export { buildPdurModule } from './pdur.js';