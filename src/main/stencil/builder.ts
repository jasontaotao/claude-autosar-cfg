// v1.8.0 K Stencil Wizard — Task 3 (BSWMD-free builder dispatcher).
//
// Pure dispatch from `StencilFamily` to the matching hand-curated
// family builder. No I/O, no mutation. The `as const satisfies
// Record<StencilFamily, () => ArxmlDocument>` pattern guarantees that
// adding a new family to `StencilFamily` is a compile error here
// until the table is updated.
//
// Project uses ESM with NodeNext resolution; relative imports
// therefore carry the `.js` suffix even though the source is `.ts`.

import type { ArxmlDocument } from '../../core/arxml/types.js';

import {
  buildComModule,
  buildCommModule,
  buildEcucModule,
  buildPdurModule,
} from './schemas/index.js';
import type { StencilFamily } from './types.js';

const BUILDERS = {
  com: buildComModule,
  comm: buildCommModule,
  ecuc: buildEcucModule,
  pdur: buildPdurModule,
} as const satisfies Record<StencilFamily, () => ArxmlDocument>;

export function buildStencil(family: StencilFamily): ArxmlDocument {
  return BUILDERS[family]();
}
