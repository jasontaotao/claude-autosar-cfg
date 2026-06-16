// Sprint 10 commit #1 — dispatch helper for the renderer.
//
// This module owns the policy decision "should I run the single-doc
// validator (6 kinds: range / enum / reference / required / schema /
// multiplicity) or the project-level pipeline (9 kinds: above +
// cross-ref / ref-dest / ref-cycle)?" Before Sprint 10, the renderer
// store imported `validate` directly and never called `validateProject`,
// which made 3 of 9 ValidationErrorKind members (cross-ref, ref-dest,
// ref-cycle) unreachable from the UI. Moving the dispatch into core
// inverts the layering so the store is a thin caller and core is the
// single source of truth for "what does validation mean".
//
// Pure / sync / no I/O. The renderer wires this to its store and the
// store no longer imports validate() or validateProject() directly.

import type { ArxmlDocument } from '../arxml/types.js';

import type { SchemaLayer } from './runtimeSchema.js';
import type { ValidationError } from './types.js';
import { validate, validateProject } from './validate.js';

/**
 * Validation level:
 *  - 'single' — per-document validation only. No path index, no cross-ref
 *               resolution, no dest-kind check, no cycle detection. Cheapest,
 *               matches the pre-Sprint 10 store contract.
 *  - 'project' — full 6-step pipeline. Surfaces the 4 project-level kinds
 *                in addition to the 5 single-doc kinds. The default.
 */
export type ValidationLevel = 'single' | 'project';

/**
 * Optional dispatch overrides. `level` defaults to `'project'`; the helper
 * is intentionally extensible so future knobs (e.g. "max errors per kind",
 * "include info-level kinds") can land here without changing the
 * renderer-side call site signature.
 *
 * `schemaLayer` (Sprint 12 #2) — when provided, the validator consults
 * the layer's params/containers index before the static
 * `ECUC_SUBSET_SCHEMA` and emits `'schema-unknown'` errors for paths
 * under known modules that aren't catalogued anywhere. Omit to keep the
 * pre-Sprint 12 #2 behaviour (layer-less lookup).
 */
export interface DispatchOptions {
  readonly level?: ValidationLevel;
  readonly schemaLayer?: SchemaLayer;
}

/**
 * Run validation across the renderer-supplied document set, choosing the
 * single-doc or project-level pipeline based on `opts.level`.
 *
 * - `level: 'single'` (or undefined with explicit `'single'`) — runs
 *   `validate(doc)` per document and concatenates. Surfaces only the 5
 *   single-doc kinds. Project-level kinds (cross-ref / ref-dest /
 *   ref-cycle) never appear.
 * - `level: 'project'` (default) — runs `validateProject(documents)`,
 *   the full 6-step pipeline. Surfaces all 9 ValidationErrorKind members
 *   for `documents.length > 0`; returns `[]` for `documents.length === 0`.
 *
 * `opts.schemaLayer` (Sprint 12 #2) is forwarded to whichever pipeline
 * runs so the layer-aware `'schema-unknown'` checks fire consistently
 * from the renderer entry point.
 *
 * @param documents the loaded ARXML document set (typically the renderer's
 *                  multi-doc store; can be empty).
 * @param opts dispatch overrides. Omit for the default `'project'` level
 *              and no layer (legacy behaviour).
 */
export function validateProjectForRenderer(
  documents: readonly ArxmlDocument[],
  opts?: DispatchOptions,
): readonly ValidationError[] {
  const level: ValidationLevel = opts?.level ?? 'project';
  const layer = opts?.schemaLayer;
  if (level === 'single') {
    const errors: ValidationError[] = [];
    for (const doc of documents) {
      errors.push(...validate(doc, layer));
    }
    return errors;
  }
  return validateProject(documents, layer);
}
