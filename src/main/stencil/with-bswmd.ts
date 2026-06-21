// v1.8.0 K Stencil Wizard — Task 9 (with-BSWMD mode wrapper).
//
// Thin layer over the v1.5.1 A+C `applyPatchSteps` engine. When the
// user picks `mode: 'with-bswmd'`, the wizard takes the
// renderer's loaded BSWMDs (`useArxmlStore.bswmdSchemas` plumbed
// through the IPC request as `ArxmlDocument[]`) and merges them
// into the freshly-built skeleton via the same engine the headless
// `mutate` CLI uses.
//
// Why route through `applyPatchSteps` instead of reimplementing:
//   - The engine is the single source of truth for doc mutation
//     semantics (immutable `add-child`/`remove-with-cascade`, the
//     legacy `set-param` for the value-side tree, BSWMD-aware
//     multiplicity). Reimplementing would drift from CLI parity.
//   - Future Task 9+ BSWMD→patch-step conversion can plug in here
//     without touching the handler or the engine.
//
// Patch-step derivation (Task 9 minimum-viable scope):
//   The first cut derives an empty patch-step list when no user
//   BSWMDs declare <CONTAINERS> to merge — the engine's empty-step
//   path is idempotent (returns the same doc ref). The merge
//   semantics for richer BSWMD shapes (e.g. cascading the user's
//   container hierarchy into the skeleton) is deferred to Task 9+,
//   behind the same `applyPatchSteps` seam so the public function
//   signature stays stable.
//
// The IPC handler is responsible for serialize + SWS gate; this
// module only builds + merges.

import type { ArxmlDocument } from '../../core/arxml/types.js';
import { applyPatchSteps } from '../../core/mutation/applyPatchSteps.js';

import { buildStencil } from './builder.js';
import type { StencilFamily } from './types.js';

/**
 * Build the BSWMD-free skeleton for `family` and merge the
 * `userBswmds` via `applyPatchSteps`.
 *
 * @param family    Stencil family key (com / comm / pdur / ecuc).
 * @param userBswmds Renderer-loaded BSWMD schemas. Empty array is
 *                  valid (idempotent merge). Non-empty arrays are
 *                  tolerated but the minimum-viable derivation
 *                  produces zero steps today — richer conversion
 *                  lands in Task 9+ behind this same signature.
 * @returns         Merged `ArxmlDocument` ready for serialize.
 */
export function buildWithBswmd(
  family: StencilFamily,
  userBswmds: ReadonlyArray<ArxmlDocument>,
): ArxmlDocument {
  // 1. Get the BSWMD-free skeleton (Tasks 3+4). Pure dispatch from
  //    the family key to the hand-curated family builder.
  const skeleton = buildStencil(family);

  // 2. Derive patch steps from the user BSWMDs. Task 9 MVP: empty
  //    list. The full BSWMD→patch-step converter (e.g. cascading
  //    the user's `<CONTAINERS>` into the skeleton's matching
  //    container, or injecting per-container default values from
  //    `<PARAMETER-VALUES>`) is deferred to Task 9+. The seam is
  //    here: callers can swap `derivePatchStepsFromBswmds` for a
  //    richer implementation without touching the engine or the
  //    handler.
  const patchSteps = derivePatchStepsFromBswmds(userBswmds);

  // 3. Delegate to the v1.5.1 A+C engine. Empty step list is
  //    idempotent — the engine returns the same doc ref with
  //    applied=0 (per core/mutation/__tests__/applyPatchSteps.test.ts).
  //    No `moduleDef` context here: this first cut adds no new
  //    sub-containers, so the engine's `add-child`/`remove-with-
  //    cascade` paths don't fire. Future Task 9+ work that adds
  //    containers will pass the parsed BSWMD `moduleDef` via the
  //    third `ctx` argument.
  const merged = applyPatchSteps(skeleton, patchSteps);
  return merged.doc;
}

/**
 * Convert the user-loaded BSWMDs into a patch-step list that the
 * `applyPatchSteps` engine can apply to the skeleton.
 *
 * Task 9 MVP returns an empty list — the engine handles the empty
 * case idempotently. The function exists as a seam so Task 9+ can
 * swap in a real BSWMD-to-patch converter (parse `<CONTAINERS>`,
 * `<PARAMETER-VALUES>`, `<REFERENCE-VALUES>`, etc.) without changing
 * the public `buildWithBswmd` signature or the handler routing.
 *
 * @param userBswmds Renderer-supplied BSWMDs.
 * @returns          Patch-step list (possibly empty).
 */
function derivePatchStepsFromBswmds(
  userBswmds: ReadonlyArray<ArxmlDocument>,
): ReadonlyArray<never> {
  // Suppress the unused-parameter warning until Task 9+ plugs in
  // real conversion logic. The cast through `unknown` keeps the
  // public return type narrow (`never[]`) so the engine sees a
  // strictly-empty array.
  void userBswmds;
  return [];
}