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

import type { BswModuleDef } from '../../core/project/bswmd.js';

interface StateForResolver {
  readonly doc: {
    readonly packages: ReadonlyArray<{
      readonly elements: ReadonlyArray<{ readonly kind: string; readonly shortName: string }>;
    }>;
  } | null;
  readonly bswmdSchemas: readonly BswModuleDef[];
}

export function resolveModuleDefForActiveDoc(state: StateForResolver): BswModuleDef | undefined {
  if (state.doc === null) return undefined;
  const moduleEl = state.doc.packages.flatMap((p) => p.elements).find((e) => e.kind === 'module');
  if (moduleEl === undefined) return undefined;
  return state.bswmdSchemas.find((s) => s.shortName === moduleEl.shortName);
}
