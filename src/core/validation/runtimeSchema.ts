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
// `schema/ecucSubset.ts`): layer first. Container multiplicity still
// falls through to the static `ECUC_CONTAINER_SCHEMA` table when the
// layer misses a path — param-level lookups have no static fallback,
// so callers that need baseline 5/5 coverage must wire a layer
// explicitly (see `core/validation/__tests__/_testSchemaLayer.ts`).
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

import { resolveTargetPath } from './pathNormalize.js';
import type { EcucContainerSchemaEntry, EcucParamType, EcucSchemaEntry } from './types.js';

/**
 * The runtime schema layer built from one or more parsed BSWMDs.
 *
 * All fields are flat path-indexed lookups:
 *   - `params`: absolute param path → `EcucSchemaEntry`
 *   - `containers`: absolute container path → `EcucContainerSchemaEntry`
 *   - `sourcePaths`: every absolute path the BSWMD declares (params + containers),
 *     regardless of whether a constraint entry exists. Used by the validator to
 *     distinguish "schema-known-but-unconstrained" (silent skip) from "outside
 *     any schema" (emit 'schema-unknown').
 *   - `moduleRoots`: every absolute module root path the BSWMD declares
 *     (e.g. `/JWQ_CDD_PACK/JWQ_Packet/JWQ3399`). Used by
 *     `lookupSchemaAcrossModuleRoots` /
 *     `lookupContainerSchemaAcrossModuleRoots` as the candidate pool
 *     for vendor-CDD namespace-mismatch fallback. Auto-populated by
 *     `buildSchemaLayer`; manual layer builders (test helpers) can
 *     pass an empty array when not exercising the cross-module-root
 *     lookup path.
 */
export interface SchemaLayer {
  readonly params: ReadonlyMap<string, EcucSchemaEntry>;
  readonly containers: ReadonlyMap<string, EcucContainerSchemaEntry>;
  readonly sourcePaths: ReadonlySet<string>;
  readonly moduleRoots: readonly string[];
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
  const moduleRoots: string[] = [];

  for (const doc of documents) {
    for (const mod of doc.modules) {
      // Sprint 17d follow-up — track every module root for the
      // cross-module-root lookup helpers (vendor-CDD namespace
      // fallback). The list preserves BSWMD insertion order so the
      // "first match wins" contract on module shortName collisions is
      // deterministic.
      moduleRoots.push(mod.path);
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

  return { params, containers, sourcePaths, moduleRoots };
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
  // Sprint 17d — apply `resolveTargetPath` at index time so layer keys
  // share the same value-side namespace and type-segment-stripped
  // form as the query paths that already ran the same helper. Without
  // this, a BSWMD published under `/AUTOSAR_R22/EcucDefs/...` and a
  // container multiplicity `Pdu` segment would not match a query that
  // was normalised to `/EcucDefs/...` and stripped of `Pdu`.
  const containerKey = resolveTargetPath(container.path);
  containers.set(containerKey, {
    path: containerKey,
    lower: container.lowerMultiplicity,
    upper: container.upperMultiplicity === 'infinite' ? 'unbounded' : container.upperMultiplicity,
  });
  sourcePaths.add(containerKey);

  for (const p of container.parameters) {
    const pKey = resolveTargetPath(p.path);
    params.set(pKey, paramDefToSchemaEntry(p));
    sourcePaths.add(pKey);
  }

  for (const r of container.references) {
    const rKey = resolveTargetPath(r.path);
    params.set(rKey, referenceDefToSchemaEntry(r));
    sourcePaths.add(rKey);
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

/**
 * Sprint 17d follow-up — vendor CDD namespace-mismatch lookup.
 *
 * The classic AUTOSAR vendor CDD layout has the value-side ECUC values
 * under `<pkg>/<module>` (e.g. `/JWQ3399/JWQ3399/...`) while the BSWMD
 * schema-side is published under a nested `<AR-PACKAGE>` chain that
 * prepends a vendor package (e.g. `/JWQ_CDD_PACK/JWQ_Packet/JWQ3399/...`).
 * Module shortName is identical on both sides — only the package
 * prefix differs.
 *
 * `lookupSchema(paramPath, layer)` matches only when the query path
 * already uses the schema-side package prefix (the JWQ_ECucValues file
 * does NOT — its `DEFINITION-REF` cross-references the schema-side
 * path, but the rendered `containerPath` follows the value-side shape).
 *
 * This helper tries the direct lookup first, then for each candidate
 * `moduleRoot` (taken from the loaded BSWMD modules) whose shortName
 * matches `segments[1]` of the query, it rebuilds the candidate path
 * as `<moduleRoot>/<suffix-from-segment[2]>` and tries again.
 *
 * **Value-tree structural divergence (Sprint 18 hotfix).** A second
 * common vendor-CDD shape places the value-tree's container inside an
 * extra intermediate sub-container not declared by the BSWMD (e.g.
 * value-side nests `JWQ3399General` under `JWQ3399ConfigSet` while the
 * BSWMD declares both as siblings directly under the module). The
 * namespace-fallback above misses this because both sides share the
 * same `/<pkg>/<module>` prefix. The third fallback (`leadingPrefix +
 * suffixTrim`) handles it by requiring the query path to start with a
 * moduleRoot's exact prefix, then trimming leading segments from the
 * suffix one at a time until a layer key matches.
 *
 * **Segment-count coverage.** The helper accepts any path with at
 * least 2 non-empty segments — the 4-segment canonical form
 * `/<pkg>/<module>/<container...>/<param>` is the common case
 * (handled by the `slice2.length > 0` branch), the 2-segment
 * `/<pkg>/<module>` shape maps to the module root itself (suffix is
 * empty, no trailing `/`), and intermediate depths work via the same
 * `slice2.join('/')` logic. The 3-segment compressed shape
 * (`/<pkg>/<container>/<param>` where `pkg === module shortName`,
 * handled separately by `useArxmlStore.resolveModuleAndParentContainer`
 * after `bdb81f6`) is NOT covered by this helper — the caller is
 * responsible for routing that case to the appropriate resolver
 * before falling back to layer lookup.
 *
 * **Module shortName uniqueness assumption.** If multiple BSWMD modules
 * share the same shortName but have different package prefixes
 * (unusual in practice — ECUC value files only refer to a single
 * module's path space), the first matching `moduleRoot` wins. The
 * iteration order is whatever the caller passes in `moduleRoots`.
 *
 * Pure / side-effect-free.
 *
 * @param paramPath   normalised absolute path; the caller's job to run
 *                    `resolveTargetPath` first (namespace / type-segment
 *                    strip). Must already be value-side namespace form.
 * @param layer       the runtime schema layer.
 * @param moduleRoots optional list of candidate module roots from the
 *                    loaded BSWMDs. When omitted, behaviour matches
 *                    `lookupSchema(paramPath, layer)`.
 * @returns the matching `EcucSchemaEntry` or `null`.
 */
export function lookupSchemaAcrossModuleRoots(
  paramPath: string,
  layer: SchemaLayer,
  moduleRoots: readonly string[] = [],
): EcucSchemaEntry | null {
  const direct = layer.params.get(paramPath);
  if (direct !== undefined) return direct;
  if (paramPath === '' || !paramPath.startsWith('/')) return null;
  const segments = paramPath.split('/').filter((s) => s.length > 0);
  if (segments.length < 2) return null;
  // Sprint 18 hotfix — unified module-root lookup. Three shapes to
  // cover:
  //
  //   1. Canonical 4-segment:        /<pkg>/<module>/<container>/<param>
  //      BSWMD-side key is /<full-prefix>/<module>/<container>/<param>.
  //      The module shortName sits at segments[1].
  //
  //   2. Vendor-CDD compressed:      /<module>/<module>/<container>/<param>
  //      BSWMD-side key is /<full-prefix>/<module>/<container>/<param>.
  //      The module shortName sits at segments[0] AND segments[1]
  //      (older value files re-declare the module name as the first
  //      container). Take the FIRST occurrence (segments[0]).
  //
  //   3. Post-fold compressed:       /<module>/<container>/<param>
  //      `foldVendorPackages` (Sprint X T7) collapses the vendor
  //      wrapper chain so the displayed `pkg.path` is just
  //      `/<moduleShortName>`. The renderer's `containerPath` then
  //      starts with the module shortName at segments[0].
  //
  //   4. Value-tree wrapper:         /<pkg>/<module>/<extraWrap>/<container>/<param>
  //      BSWMD-side key drops `<extraWrap>`. The module shortName
  //      sits at segments[1]; the suffix-trim loop drops `<extraWrap>`
  //      off the front.
  //
  // Algorithm: for each candidate `moduleRoot`, locate the module's
  // shortName ANYWHERE in the query segments (first occurrence wins),
  // then build `<moduleRoot>/<suffix-after-module>`. If that misses,
  // trim leading segments from the suffix one at a time and retry.
  for (const root of moduleRoots) {
    if (root === '' || !root.startsWith('/')) continue;
    const rootSegments = root.split('/').filter((s) => s.length > 0);
    const rootModShortName = rootSegments[rootSegments.length - 1];
    if (rootModShortName === undefined) continue;
    let modIdx = -1;
    for (let i = 0; i < segments.length; i += 1) {
      if (segments[i] === rootModShortName) {
        modIdx = i;
        break;
      }
    }
    if (modIdx === -1) continue;
    const suffixSegments = segments.slice(modIdx + 1);
    if (suffixSegments.length === 0) continue;
    // Suffix-trim loop. trim=0 is the literal "everything after the
    // module shortName" candidate. trim=N drops the first N leading
    // segments of the suffix — catches value-tree wrappers and the
    // vendor-CDD double-module shape (where the duplicate module
    // shortName occupies segments[0] AND segments[1] and the suffix
    // starts with the original /container/... payload).
    for (let trim = 0; trim < suffixSegments.length; trim += 1) {
      const candidate = root + '/' + suffixSegments.slice(trim).join('/');
      const found = layer.params.get(candidate);
      if (found !== undefined) return found;
    }
    // Module-root candidate — restricted to the legacy 2-segment
    // `/<pkg>/<module>` shape where the suffix is a SINGLE segment
    // equal to `rootModShortName`. This preserves the previous
    // 2-segment contract for the container helper without
    // over-matching bogus paths (e.g.
    // `/JWQ3399/NotARealModule/NotARealContainer` would otherwise
    // fall through to the module root via this candidate and give
    // a false positive). For the params helper the root is not in
    // `layer.params`, so this candidate always misses for params.
    if (
      suffixSegments.length === 1 &&
      suffixSegments[0] === rootModShortName
    ) {
      const rootEntry = layer.params.get(root);
      if (rootEntry !== undefined) return rootEntry;
    }
  }
  return null;
}

/**
 * Sprint 17d follow-up — container-side mirror of
 * `lookupSchemaAcrossModuleRoots`. Same vendor-CDD namespace-mismatch
 * scenario, applied to the layer's `containers` map (used by
 * `lookupContainerSchema` and the validator's `multiplicity` check).
 *
 * Layer-only by design: this helper does NOT fall through to the
 * static `ECUC_CONTAINER_SCHEMA` table. Callers that need the
 * static-table fallback (the 5-fixture baseline path) should call
 * `lookupContainerSchema(containerPath, layer)` after this helper
 * returns `null`.
 *
 * **Sprint 18 hotfix — value-tree structural divergence.** Mirror of
 * the param-side helper: when the value tree wraps a BSWMD top-level
 * container in an extra intermediate sub-container, the third
 * fallback (`leadingPrefix + suffixTrim`) catches it. See
 * `lookupSchemaAcrossModuleRoots` for the full discussion.
 *
 * **Same limitations as the param version** — 4-segment canonical
 * form only, module shortName uniqueness assumed. See
 * `lookupSchemaAcrossModuleRoots` for the full discussion.
 *
 * Pure / side-effect-free.
 *
 * @param containerPath normalised absolute path (caller runs
 *                      `resolveTargetPath` first). Value-side
 *                      namespace form expected.
 * @param layer         the runtime schema layer.
 * @param moduleRoots   optional list of candidate module roots from
 *                      the loaded BSWMDs. When omitted, behaviour
 *                      matches `layer.containers.get(containerPath)`.
 * @returns the matching `EcucContainerSchemaEntry` or `null`.
 */
export function lookupContainerSchemaAcrossModuleRoots(
  containerPath: string,
  layer: SchemaLayer,
  moduleRoots: readonly string[] = [],
): EcucContainerSchemaEntry | null {
  const direct = layer.containers.get(containerPath);
  if (direct !== undefined) return direct;
  if (containerPath === '' || !containerPath.startsWith('/')) return null;
  const segments = containerPath.split('/').filter((s) => s.length > 0);
  if (segments.length < 2) return null;
  // Sprint 18 hotfix — mirror of `lookupSchemaAcrossModuleRoots`.
  // Locate the module shortName anywhere in the query segments, then
  // build `<moduleRoot>/<suffix>` and suffix-trim. See the param-side
  // helper for the full discussion of the four shapes.
  for (const root of moduleRoots) {
    if (root === '' || !root.startsWith('/')) continue;
    const rootSegments = root.split('/').filter((s) => s.length > 0);
    const rootModShortName = rootSegments[rootSegments.length - 1];
    if (rootModShortName === undefined) continue;
    let modIdx = -1;
    for (let i = 0; i < segments.length; i += 1) {
      if (segments[i] === rootModShortName) {
        modIdx = i;
        break;
      }
    }
    if (modIdx === -1) continue;
    const suffixSegments = segments.slice(modIdx + 1);
    if (suffixSegments.length === 0) continue;
    for (let trim = 0; trim < suffixSegments.length; trim += 1) {
      const candidate = root + '/' + suffixSegments.slice(trim).join('/');
      const found = layer.containers.get(candidate);
      if (found !== undefined) return found;
    }
    // Module-root candidate — same restricted contract as the
    // param-side helper. Only fires when the suffix is a single
    // segment equal to `rootModShortName` (legacy `/<pkg>/<module>`
    // compressed shape). See the param-side helper for the
    // rationale.
    if (
      suffixSegments.length === 1 &&
      suffixSegments[0] === rootModShortName
    ) {
      const rootEntry = layer.containers.get(root);
      if (rootEntry !== undefined) return rootEntry;
    }
  }
  return null;
}
