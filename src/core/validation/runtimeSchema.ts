// core/validation/runtimeSchema.ts
// Sprint 12 #2 — runtime BSWMD-derived schema layer consumed by the validator.
//
// A `SchemaLayer` is built from one or more parsed `BswmdDocument`s (see
// `src/core/project/bswmd.ts`). It holds flat path-indexed Maps of
// `EcucSchemaEntry` (param-level) and `EcucContainerSchemaEntry` (container-
// level) so the validator can do an O(1) lookup at each query site. It also
// tracks every path the BSWMD *declares* in `sourcePaths` — that set is the
// disambiguator between "in-schema but unconstrained" (silent skip, current
// behavior) and "outside any schema we know about" (the new 'schema-unknown'
// kind, emitted only when the caller provides a layer).
//
// Lookup precedence (in `lookupSchema` / `lookupContainerSchema` in
// `schema/ecucSubset.ts`): layer first, then static `ECUC_SUBSET_SCHEMA`
// fallback. The layer wins because the user's BSWMD is the authoritative
// schema-side spec for the modules it covers; the static subset is just
// baseline coverage for the 5 test fixtures.
//
// Path format: BSWMD container paths are absolute (`/<AR-PACKAGE>/<module>/...`)
// — same convention as the validator's `pathIndex`. Store layer paths raw;
// normalize on the query side via the existing `resolveTargetPath` helper so
// the `/EAS → /EcucDefs` collapse and the `Pdu/ComIPdu/...` type-segment strip
// apply uniformly.
//
// Collision policy: if two BSWMDs declare the same module path,
// **last-write-wins**. The store keeps both `BswmdDocument`s in `bswmdSchemas`
// for provenance but the layer only flattens the latest. Sprint 13+ tracks
// per-source provenance for conflict diagnostics.
//
// Pure TS, zero react/electron/DOM imports.

import type { BswmdDocument, ContainerDef, ParamDef, ReferenceDef } from '../project/bswmd.js';

import type { EcucContainerSchemaEntry, EcucParamType, EcucSchemaEntry } from './types.js';

/**
 * The runtime schema layer built from one or more parsed BSWMDs.
 *
 * All three fields are flat path-indexed lookups:
 *   - `params`: absolute param path → `EcucSchemaEntry`
 *   - `containers`: absolute container path → `EcucContainerSchemaEntry`
 *   - `sourcePaths`: every absolute path the BSWMD declares (params + containers),
 *     regardless of whether a constraint entry exists. Used by the validator to
 *     distinguish "schema-known-but-unconstrained" (silent skip) from "outside
 *     any schema" (emit 'schema-unknown').
 */
export interface SchemaLayer {
  readonly params: ReadonlyMap<string, EcucSchemaEntry>;
  readonly containers: ReadonlyMap<string, EcucContainerSchemaEntry>;
  readonly sourcePaths: ReadonlySet<string>;
}

/**
 * Build a `SchemaLayer` from a list of parsed BSWMD documents.
 *
 * Empty input → empty layer (every lookup falls through to the static subset).
 * Param paths use the format `<container.path>/<param.shortName>`.
 * Container paths are absolute (from `ContainerDef.path`).
 *
 * Last-write-wins on path collisions (see file header).
 */
export function buildSchemaLayer(documents: readonly BswmdDocument[]): SchemaLayer {
  const params = new Map<string, EcucSchemaEntry>();
  const containers = new Map<string, EcucContainerSchemaEntry>();
  const sourcePaths = new Set<string>();

  for (const doc of documents) {
    for (const mod of doc.modules) {
      // Index the module root itself as a container so callers (e.g.
      // `findModuleForPath`) can attribute an absolute param path to its
      // containing module via `layer.containers.has(modulePath)`. The
      // entry mirrors the module's own multiplicity bounds so the
      // validator's existing container-multiplicity check also fires
      // when the ARXML declares too many / too few instances of a
      // BSWMD-declared module.
      containers.set(mod.path, {
        path: mod.path,
        lower: mod.lowerMultiplicity,
        upper: mod.upperMultiplicity === 'infinite' ? 'unbounded' : mod.upperMultiplicity,
      });
      sourcePaths.add(mod.path);
      // Index every container (top-level + sub + choice branches) and their
      // params/references. Recursion lives in `indexContainer` below.
      for (const top of mod.containers) {
        indexContainer(top, params, containers, sourcePaths);
      }
    }
  }

  return { params, containers, sourcePaths };
}

/**
 * Recursively index one container and its descendants. `subContainers` and
 * `choices` are walked independently — choice branches are NOT nested sub-
 * containers in the ECUC sense, so they live in the same `params` map keyed
 * by their absolute path.
 */
function indexContainer(
  container: ContainerDef,
  params: Map<string, EcucSchemaEntry>,
  containers: Map<string, EcucContainerSchemaEntry>,
  sourcePaths: Set<string>,
): void {
  containers.set(container.path, {
    path: container.path,
    lower: container.lowerMultiplicity,
    upper: container.upperMultiplicity === 'infinite' ? 'unbounded' : container.upperMultiplicity,
  });
  sourcePaths.add(container.path);

  for (const p of container.parameters) {
    params.set(p.path, paramDefToSchemaEntry(p));
    sourcePaths.add(p.path);
  }

  for (const r of container.references) {
    params.set(r.path, referenceDefToSchemaEntry(r));
    sourcePaths.add(r.path);
  }

  for (const sub of container.subContainers) {
    indexContainer(sub, params, containers, sourcePaths);
  }

  for (const choice of container.choices) {
    indexContainer(choice, params, containers, sourcePaths);
  }
}

/**
 * Map a BSWMD `ParamDef` to a validator-consumable `EcucSchemaEntry`.
 *
 * Kind mapping:
 *   - 'integer' | 'float' | 'boolean' | 'string' | 'enumeration' pass through.
 *   - 'function-name' → 'string' (AUTOSAR validates against a symbol table,
 *     but the validator only enforces length constraints — same shape as
 *     string; Sprint 13+ editor renders a symbol picker).
 *
 * Constraint mapping:
 *   - `minValue`/`maxValue` → `min`/`max` (for integer/float).
 *   - `minLength`/`maxLength` → `maxLength` (EcucSchemaEntry only has the
 *     upper bound today; the BSWMD `minLength` is a schema extension not yet
 *     consumed by the validator — JSDoc note here so a future consumer knows
 *     to add the field).
 *   - `enumerationLiterals` → `enumLiterals`.
 *
 * `defaultValue` is intentionally not mapped (no current validator consumer).
 */
function paramDefToSchemaEntry(p: ParamDef): EcucSchemaEntry {
  // After excluding 'function-name', every remaining ParamKind maps 1:1 to an
  // EcucParamType literal. Cast is safe and TS-checked via the if-branch.
  const type: EcucParamType = p.kind === 'function-name' ? 'string' : (p.kind as EcucParamType);
  const entry: EcucSchemaEntry = { path: p.path, type };
  if (p.minValue !== null) {
    (entry as { min?: number }).min = p.minValue;
  }
  if (p.maxValue !== null) {
    (entry as { max?: number }).max = p.maxValue;
  }
  if (p.maxLength !== null) {
    (entry as { maxLength?: number }).maxLength = p.maxLength;
  }
  if (p.enumerationLiterals.length > 0) {
    (entry as { enumLiterals?: readonly string[] }).enumLiterals = p.enumerationLiterals;
  }
  return entry;
}

/**
 * Map a BSWMD `ReferenceDef` to an `EcucSchemaEntry` with `type='reference'`.
 * The `destKind` carries the expected DEST attribute so the validator can
 * catch schema-side mismatches (`'reference'` kind).
 */
function referenceDefToSchemaEntry(r: ReferenceDef): EcucSchemaEntry {
  return {
    path: r.path,
    type: 'reference',
    refDest: r.destKind,
  };
}

/**
 * Map an absolute ECUC param/container path to the containing module's
 * absolute module path, using only the layer's container index.
 *
 * Algorithm: take the first 2 non-empty segments after the leading `/`
 * (which yield `/<pkg>/<module>` for the standard AUTOSAR path shape
 * `/EcucDefs/<Module>/...`), then check whether the resulting module
 * path is one of the module roots the layer has indexed (i.e. a key of
 * `layer.containers` whose path is *exactly* the module path — module
 * roots are themselves indexed as containers in `buildSchemaLayer`).
 *
 * Returns:
 *   - `null` — the path doesn't sit under any module the layer knows
 *     about (e.g. it's outside the layer's scope entirely). Callers
 *     emit a `'schema-unknown'` error in this case.
 *   - the absolute module path string — when the path is under a known
 *     module but no specific constraint entry exists. The caller uses
 *     this to format a precise diagnostic naming the module.
 *
 * Pass-through behaviour for malformed input:
 *   - empty string, missing leading `/`, fewer than 3 segments after
 *     split → returns `null` (cannot attribute to a module).
 *   - `paramPath` whose first two segments don't match a known layer
 *     container root → returns `null`.
 *
 * Pure / side-effect-free / immutable.
 *
 * @param layer the runtime schema layer (output of `buildSchemaLayer`).
 * @param paramPath absolute AUTOSAR path; the caller should pass the
 *                  already-`normalizePath`-collapsed form so the
 *                  `/EAS → /EcucDefs` rewrite has happened upstream
 *                  (matches the validator's lookup convention).
 * @returns the absolute module path (`/<pkg>/<module>`) under which
 *          `paramPath` lives, or `null` when the layer has no record
 *          of that module.
 */
export function findModuleForPath(layer: SchemaLayer, paramPath: string): string | null {
  if (paramPath === '' || !paramPath.startsWith('/')) return null;
  const segments = paramPath.split('/').filter((s) => s.length > 0);
  // Module path needs at least 2 segments: pkg + module. Param paths are
  // typically 4+ segments (pkg + module + container + param), but the
  // function is also useful for container paths which are 3 segments.
  if (segments.length < 2) return null;
  const modulePath = `/${segments[0]}/${segments[1]}`;
  if (!layer.containers.has(modulePath)) return null;
  return modulePath;
}
