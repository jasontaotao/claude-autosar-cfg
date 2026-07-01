// v1.20.0 T1 C2.4 — resolveModuleDefForActiveDoc helper.
//
// Pure function: resolve the BSWMD for the active doc's primary
// module. Consumed by `useScriptStore.applyMutation` to thread
// `moduleDef` context to `applyPatchSteps` so `add-child` ops get
// BSWMD-aware multiplicity + child-def lookup.
//
// Returns `undefined` when:
//   - state.doc is null
//   - the doc has no module element
//   - the module's shortName doesn't match any loaded BSWMD schema
//
// Callers pass the result through to `applyPatchSteps`; the engine
// emits `no-bswmd-for-module` for `add-child` when context is absent.

import type { ArxmlDocument } from '../../../core/arxml/types.js';
import type { BswModuleDef, BswmdDocument } from '../../../core/project/bswmd.js';

interface StateForResolver {
  readonly doc: ArxmlDocument | null;
  readonly bswmdSchemas: readonly BswmdDocument[];
}

export function resolveModuleDefForActiveDoc(state: StateForResolver): BswModuleDef | undefined {
  if (state.doc === null) return undefined;
  // `ArxmlElement` is a discriminated union; `module` and `container`
  // arms have a required `shortName`, while `reference` / `unknown`
  // have it optional. The type predicate filters to elements that
  // both match the `module` kind AND guarantee a `string` shortName.
  const moduleEl = state.doc.packages
    .flatMap((p) => p.elements)
    .find(
      (e): e is Extract<typeof e, { kind: 'module' }> =>
        e.kind === 'module' && typeof e.shortName === 'string',
    );
  if (moduleEl === undefined) return undefined;
  // Walk every loaded BswmdDocument, then every module inside it.
  // The store's `bswmdSchemas` is `BswmdDocument[]` (one per
  // BSWMD file), and each document can declare multiple modules.
  for (const doc of state.bswmdSchemas) {
    const match = doc.modules.find((m) => m.shortName === moduleEl.shortName);
    if (match !== undefined) return match;
  }
  return undefined;
}
