// core/validation/validate/checks.ts
// Single-document schema checks + cross-reference graph checks.
//
// Split from `src/core/validation/validate.ts` as part of v1.41.x
// PATCH T1 (file-size backlog). Owns:
//   - `checkParam` + `checkContainerMultiplicity` + `typeMatches`
//     (single-document schema-level checks, used by walk.ts)
//   - `checkCrossRefs` + `checkRefDests` + `checkRefCycles`
//     (project-level reference graph checks, used by project.ts)
//   - `isUnsetPlaceholder` + `canonicalCycleKey` +
//     `emitRefCycleError` (helper cluster for the cycle detector)
//   - `DEST_KIND_MAP` (the dest-kind → pathIndexEntry.kind mapping
//     for `checkRefDests`).

import type { ParamValue } from '../../arxml/types.js';
import { resolveTargetPath } from '../pathNormalize.js';
import { findModuleForPath } from '../runtimeSchema.js';
import type { SchemaLayer } from '../runtimeSchema.js';
import { lookupContainerSchema } from '../schema/ecucSubset.js';
import type { EcucSchemaEntry, PathIndexEntry, RefSite, ValidationError } from '../types.js';

import { tryResolveByShortNameWithIndex, buildShortNameIndex } from './coverage.js';

export function checkParam(
  paramPath: string,
  paramKey: string,
  value: ParamValue,
  entry: EcucSchemaEntry,
  errors: ValidationError[],
): void {
  if (!typeMatches(value, entry.type)) {
    errors.push({
      kind: 'schema',
      path: paramPath,
      paramKey,
      message: `Type mismatch: expected ${entry.type}, got ${value.type}`,
      expected: entry.type,
      actual: value.type,
    });
    return;
  }
  switch (entry.type) {
    case 'integer':
    case 'float': {
      if (typeof value.value !== 'number') break;
      const num = value.value;
      if (entry.min !== undefined && num < entry.min) {
        errors.push({
          kind: 'range',
          path: paramPath,
          paramKey,
          message: `Value ${num} below min ${entry.min}`,
          expected: `>= ${entry.min}`,
          actual: String(num),
        });
      }
      if (entry.max !== undefined && num > entry.max) {
        errors.push({
          kind: 'range',
          path: paramPath,
          paramKey,
          message: `Value ${num} above max ${entry.max}`,
          expected: `<= ${entry.max}`,
          actual: String(num),
        });
      }
      break;
    }
    case 'string': {
      if (
        entry.maxLength !== undefined &&
        typeof value.value === 'string' &&
        value.value.length > entry.maxLength
      ) {
        errors.push({
          kind: 'range',
          path: paramPath,
          paramKey,
          message: `String length ${value.value.length} exceeds maxLength ${entry.maxLength}`,
          expected: `<= ${entry.maxLength} chars`,
          actual: `${value.value.length} chars`,
        });
      }
      break;
    }
    case 'enumeration': {
      if (entry.enumLiterals !== undefined && !entry.enumLiterals.includes(value.value as string)) {
        errors.push({
          kind: 'enum',
          path: paramPath,
          paramKey,
          message: `Value "${value.value}" not in enum literals`,
          expected: entry.enumLiterals.join(' | '),
          actual: String(value.value),
        });
      }
      break;
    }
    case 'boolean':
    case 'reference':
      // typeMatches already verified the runtime type; nothing more to check.
      break;
  }
}

/**
 * Container-level multiplicity check.
 *
 * Compares the sibling count of a container against the
 * `[lower, upper]` bounds declared in `ECUC_CONTAINER_SCHEMA`.
 * Emits a `'multiplicity'` validation error when the count is
 * out of range.
 *
 * Containers not catalogued in `ECUC_CONTAINER_SCHEMA` are skipped
 * (no error). This matches the `lookupSchema()` behaviour for params
 * and keeps the schema additive: a missing entry == "no constraint".
 *
 * `upper: 'unbounded'` skips the upper-bound check.
 *
 * Schema key convention (per ECUC_CONTAINER_SCHEMA): the schema path
 * ends in the *child container type name*, e.g.
 *   /EcucDefs/EcuC/EcucPduCollection/Pdu
 * meaning "at parent /EcucDefs/EcuC/EcucPduCollection, count children
 * named Pdu". The caller (walkElements) supplies the sibling count for
 * this exact shortName so the check stays O(1) per child.
 */
export function checkContainerMultiplicity(
  containerPath: string,
  instanceCount: number,
  errors: ValidationError[],
  layer?: SchemaLayer,
  definitionRef?: string,
): void {
  // Sprint 17d — same normalisation as `walkContainer`. Layer keys are
  // folded at index time so the lookup needs the same shape. The
  // `moduleRoots` 3rd arg (Sprint 17d follow-up) bridges vendor-CDD
  // namespace mismatches the same way `EnumEditor`'s enum resolution
  // does: a layer keyed under `/JWQ_CDD_PACK/JWQ_Packet/...` matches
  // value-side `/JWQ3399/...` queries via the cross-module-root
  // fallback in `lookupContainerSchemaAcrossModuleRoots`.
  const normalisedPath = resolveTargetPath(containerPath);
  const definitionLookupPath =
    definitionRef === undefined || definitionRef === '' ? null : resolveTargetPath(definitionRef);
  const schema =
    lookupContainerSchema(normalisedPath, layer, layer?.moduleRoots ?? []) ??
    (definitionLookupPath === null
      ? null
      : lookupContainerSchema(definitionLookupPath, layer, layer?.moduleRoots ?? []));
  if (schema === null) {
    // Layer-aware schema-unknown: same disambiguator as the param-level
    // check above — if the layer knows the *parent* module but didn't
    // declare this specific container type, surface it.
    if (layer !== undefined) {
      emitSchemaUnknownIfInKnownModule(layer, containerPath, errors);
    }
    return;
  }

  if (instanceCount < schema.lower) {
    errors.push({
      kind: 'multiplicity',
      path: containerPath,
      message: `Container instance count ${instanceCount} below lower multiplicity ${schema.lower}`,
      expected: `>= ${schema.lower}`,
      actual: String(instanceCount),
    });
  }
  if (schema.upper !== 'unbounded' && instanceCount > schema.upper) {
    errors.push({
      kind: 'multiplicity',
      path: containerPath,
      message: `Container instance count ${instanceCount} above upper multiplicity ${schema.upper}`,
      expected: `<= ${schema.upper}`,
      actual: String(instanceCount),
    });
  }
}

function emitSchemaUnknownIfInKnownModule(
  layer: SchemaLayer,
  paramPath: string,
  errors: ValidationError[],
): void {
  // Collapse `/EAS → /EcucDefs` so BSWMD paths that survive a vendor's
  // definition-side namespace collapse onto the same key the layer uses.
  const normalised = resolveTargetPath(paramPath);
  if (layer.sourcePaths.has(normalised)) return;
  const modulePath = findModuleForPath(layer, normalised);
  if (modulePath === null) return;
  errors.push({
    kind: 'schema-unknown',
    path: paramPath,
    message: `BSWMD-declared module '${modulePath}' has no schema for '${paramPath}'`,
  });
}

function typeMatches(value: ParamValue, expected: EcucSchemaEntry['type']): boolean {
  switch (expected) {
    case 'integer':
      return value.type === 'integer';
    case 'float':
      return value.type === 'float';
    case 'boolean':
      return value.type === 'boolean';
    case 'string':
      return value.type === 'string';
    case 'enumeration':
      return value.type === 'enum';
    case 'reference':
      return value.type === 'reference';
  }
}

// ============================================================================
// Sprint 9 #2 — Target-side reference DEST-kind check
// ============================================================================

/**
 * Map from `<VALUE-REF DEST="...">` (and `<REFERENCE-REF DEST="...">`)
 * attribute values to the set of `PathIndexEntry.kind` values the
 * resolved target is allowed to have. Mismatches become `'ref-dest'`
 * validation errors.
 *
 * Conservative coverage — the ECUC DEST values not catalogued here
 * (e.g. `ECUC-INTEGER-PARAM-DEF`, `ECUC-FUNCTION-NAME-DEF`) are
 * skipped silently rather than over-flagged, because:
 *   1. Their natural target is a *param value* not a path-indexed
 *      container / module / reference; param values are not path
 *      indexed today, so we have no ground truth to compare against.
 *   2. False positives would erode user trust in the validation panel.
 *
 * Maintenance: when an AUTOSAR vendor dest value proves stable
 * (e.g. `ECUC-CHOICE-REFERENCE-DEF` after Sprint 9 #14 CanIf), add
 * the mapping here with one line + a unit test pinning the new rule.
 */
const DEST_KIND_MAP: ReadonlyMap<string, ReadonlySet<PathIndexEntry['kind']>> = new Map([
  ['ECUC-CONTAINER-VALUE', new Set<PathIndexEntry['kind']>(['container', 'module'])],
  ['ECUC-REFERENCE-DEF', new Set<PathIndexEntry['kind']>(['reference'])],
  ['ECUC-FOREIGN-REFERENCE-DEF', new Set<PathIndexEntry['kind']>(['reference'])],
]);

/**
 * Verify every reference site's declared DEST matches the actual kind
 * of the resolved target. Complements the existing `'reference'` kind
 * check (which is *schema-side*: source dest vs schema entry's
 * refDest) — this is *target-side*: source dest vs resolved target kind.
 *
 * Pure / testable. Emits at most one `'ref-dest'` error per site.
 * Skips:
 *   - sites with `targetDest === undefined` (no rule to check)
 *   - sites with `targetDest` not in `DEST_KIND_MAP` (no rule defined)
 *   - placeholder targets (empty / trailing `/`) — owned by 'required'
 *   - unresolved targets — owned by 'cross-ref' (no pathIndex entry)
 *
 * The site-level path normalisation matches `checkCrossRefs` exactly
 * (`normalizePath` → `tryStripTypeSegment`) so the two checks look at
 * the *same* resolved key.
 */
export function checkRefDests(
  refSites: readonly RefSite[],
  pathIndex: Map<string, PathIndexEntry>,
): readonly ValidationError[] {
  const errors: ValidationError[] = [];
  for (const site of refSites) {
    if (site.targetDest === undefined) continue;
    if (isUnsetPlaceholder(site.targetPath)) continue;
    const expectedKinds = DEST_KIND_MAP.get(site.targetDest);
    if (expectedKinds === undefined) continue;
    const resolved = resolveTargetPath(site.targetPath);
    const entry = pathIndex.get(resolved);
    if (entry === undefined) continue;
    if (!expectedKinds.has(entry.kind)) {
      const expectedList = [...expectedKinds].join('|');
      const message = `Reference DEST "${site.targetDest}" expects ${expectedList}, but target is a ${entry.kind}`;
      const base = {
        kind: 'ref-dest' as const,
        path: site.sourcePath,
        message,
        expected: site.targetDest,
        actual: entry.kind,
      };
      const error: ValidationError =
        site.paramKey !== undefined ? { ...base, paramKey: site.paramKey } : base;
      errors.push(error);
    }
  }
  return errors;
}

function isUnsetPlaceholder(path: string): boolean {
  // Two forms of "developer hasn't filled in target yet":
  //   1. completely empty
  //   2. ends in "/" (e.g. ".../PduRTxBuffer/")
  return path === '' || path.endsWith('/');
}

// ============================================================================
// Sprint 9 #3 — Cyclic reference detection
// ============================================================================

/**
 * Detect cyclic reference chains (A→B→...→A) in the project-wide
 * cross-ref graph. Complements the existing `checkCrossRefs` (existence)
 * and `checkRefDests` (dest-kind) checks — this one owns the
 * *structural integrity* axis: a ref that exists, has the right dest-kind,
 * but loops back on itself is still a data-integrity bug.
 *
 * Pure / testable. Emits at most one `'ref-cycle'` error per *distinct*
 * cycle (canonical-key dedup), not per back-edge. Self-loops (A→A) are
 * reported as 1-edge cycles; pure placeholder targets and dangling
 * targets/sources are skipped (other kinds own those axes).
 *
 * Algorithm: standard DFS with `visited` (fully processed) and `onStack`
 * (currently on the active DFS path). When an edge points to a node on
 * the active stack, the slice from that node to the back-edge target
 * is the cycle. The cycle's node sequence is rotated to the
 * lex-smallest node for a stable canonical key, deduplicating *duplicate
 * cycle sequences* (e.g. the same 3-node cycle discovered via different
 * starting points in a complete-graph SCC). This is rotation-based
 * dedup, not full SCC collapse — a 2-node SCC emits 1 cycle (canonical
 * form `A→B→A`); a complete 3-node SCC emits up to 3 distinct cycles
 * (one per pair of back-edges), each dedup'd to a single report.
 *
 * @param refSites every reference consumption site (output of
 *                 `extractReferences`). Each contributes a directed edge
 *                 `sourcePath → targetPath` to the graph.
 * @param pathIndex project-wide path index (output of `buildPathIndex`).
 *                 Used to filter out edges whose source or target does
 *                 not actually exist (those belong to `'cross-ref'`, not
 *                 here).
 * @returns a snapshot list of `'ref-cycle'` errors; empty list = no
 *          cycles detected. The list is in the order cycles are first
 *          discovered (DFS lex-smallest entry point first).
 */
export function checkRefCycles(
  refSites: readonly RefSite[],
  pathIndex: Map<string, PathIndexEntry>,
): readonly ValidationError[] {
  // 1. Build adjacency: source-key → list of (target, site).
  //    Skip rules (conservative — let other kinds own the other axes):
  //      a. placeholder target (empty / trailing /)        → 'required'
  //      b. target not in pathIndex                        → 'cross-ref'
  //      c. source not in pathIndex (defensive, shouldn't happen)
  const adjacency = new Map<string, Array<{ target: string; site: RefSite }>>();
  for (const site of refSites) {
    if (isUnsetPlaceholder(site.targetPath)) continue;
    const sourceKey = resolveTargetPath(site.sourcePath);
    if (!pathIndex.has(sourceKey)) continue;
    const targetKey = resolveTargetPath(site.targetPath);
    if (!pathIndex.has(targetKey)) continue;
    const existing = adjacency.get(sourceKey);
    const edge = { target: targetKey, site };
    if (existing === undefined) adjacency.set(sourceKey, [edge]);
    else existing.push(edge);
  }

  // 2. DFS state.
  const visited = new Set<string>();
  // `onStack` maps each node to the `stack.length` (i.e. the number of
  // EDGES on the active DFS path) AT THE TIME that node was entered.
  // This is a node→position-in-edges-array index, not a depth-in-edges
  // count. A later `stack.slice(cycleStart)` recovers the edges that
  // together form the cycle candidate.
  const onStack = new Map<string, number>();
  const stack: Array<{ source: string; target: string; site: RefSite }> = [];
  const cycleKeys = new Set<string>();
  const errors: ValidationError[] = [];

  function dfs(node: string): void {
    visited.add(node);
    onStack.set(node, stack.length);
    const edges = adjacency.get(node) ?? [];
    for (const { target, site } of edges) {
      if (onStack.has(target)) {
        // Back-edge → cycle. Extract the chain (from onStack entry of
        // `target` through the current edge), canonicalize, dedup, emit.
        const cycleStart = onStack.get(target) ?? 0;
        const closing = { source: node, target, site };
        const chain: Array<{ source: string; target: string; site: RefSite }> = [
          ...stack.slice(cycleStart),
          closing,
        ];
        const key = canonicalCycleKey(chain);
        if (!cycleKeys.has(key)) {
          cycleKeys.add(key);
          errors.push(emitRefCycleError(chain));
        }
        // Do NOT recurse into `target` — would re-discover the same cycle.
        continue;
      }
      if (!visited.has(target)) {
        stack.push({ source: node, target, site });
        dfs(target);
        stack.pop();
      }
    }
    onStack.delete(node);
  }

  // Deterministic traversal: lex-sorted starting nodes.
  const startNodes = [...adjacency.keys()].sort();
  for (const node of startNodes) {
    if (!visited.has(node)) dfs(node);
  }

  return errors;
}

/**
 * Verify every reference site's targetPath resolves to an entry in pathIndex.
 * Empty / trailing-slash paths are treated as unset placeholders and skipped —
 * those are already surfaced by the 'required' kind in single-doc validate().
 *
 * Pure / testable. Returns one ValidationError per unresolved ref.
 */
export function checkCrossRefs(
  refSites: readonly RefSite[],
  pathIndex: Map<string, PathIndexEntry>,
): readonly ValidationError[] {
  const errors: ValidationError[] = [];
  // Sprint 9 #4: build the shortName reverse-index once for the whole
  // call. The lookup is O(1) per site; building is O(n) in pathIndex
  // size. Sharing the index across all sites is what makes the fallback
  // effectively free at the 1336-site scale.
  const shortNameIndex = buildShortNameIndex(pathIndex);
  for (const site of refSites) {
    if (isUnsetPlaceholder(site.targetPath)) continue;
    // Sprint 8 T1: collapse the fixture's `/EAS/...` definition-side
    // namespace onto the `/EcucDefs/...` value-side namespace used by
    // buildPathIndex, so the path lookup actually matches.
    //
    // Sprint 9 #1: also strip any schema-side type segment (e.g. `/Pdu/`,
    // `/ComIPdu/`) that the fixture VALUE-REF carries between the
    // parent container and the instance shortName; pathIndex keys use
    // the instance shortName directly so the type segment must go.
    // The `site.targetPath` field is intentionally left as the original
    // string so the error payload's `actual` shows the fixture-original
    // path and stays useful for cross-referencing the source ARXML.
    const resolved = resolveTargetPath(site.targetPath);
    if (pathIndex.has(resolved)) continue;
    // Sprint 9 #4 fallback: if the strict lookup miss is due to a
    // branch mismatch (e.g. fixture VALUE-REF says
    // `/EcucDefs/Com/ComConfig/ComIPduGroup/CAN_NetworkTx` but the
    // element actually lives at `/EcucDefs/Com/CanConfigSet/CAN_NetworkTx`
    // — a sibling branch), try resolving by the target's leaf shortName
    // uniqueness. If exactly one entry in pathIndex has the leaf
    // shortName, treat the site as resolved. If 0 or ≥2, fall through
    // to the cross-ref error path.
    if (tryResolveByShortNameWithIndex(site.targetPath, shortNameIndex) !== undefined) continue;
    const error: ValidationError =
      site.paramKey !== undefined
        ? {
            kind: 'cross-ref',
            path: site.sourcePath,
            paramKey: site.paramKey,
            message: `Reference target not found: ${site.targetPath}`,
            expected: 'resolvable absolute path',
            actual: site.targetPath,
          }
        : {
            kind: 'cross-ref',
            path: site.sourcePath,
            message: `Reference target not found: ${site.targetPath}`,
            expected: 'resolvable absolute path',
            actual: site.targetPath,
          };
    errors.push(error);
  }
  return errors;
}

/**
 * Produce a stable, rotation-invariant key for a cycle chain so multiple
 * back-edges within the same SCC all hash to the same dedup entry. Pure.
 *
 * Strategy: list the cycle's node sequence (each edge contributes
 * `source`; the closing edge's `target` is appended), then rotate so the
 * lex-smallest node leads. A 1-edge cycle (self-loop A→A) has a single
 * node and the key is just that node.
 */
function canonicalCycleKey(chain: ReadonlyArray<{ source: string; target: string }>): string {
  if (chain.length === 0) return '';
  // Defensive: chain must end at its start (cycle), but we don't assert.
  const nodes: string[] = [];
  for (const edge of chain) nodes.push(edge.source);
  const last = chain[chain.length - 1];
  if (last !== undefined) nodes.push(last.target);

  // Rotate to lex-smallest node.
  let minIdx = 0;
  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i]! < nodes[minIdx]!) minIdx = i;
  }
  const rotated = [...nodes.slice(minIdx), ...nodes.slice(0, minIdx)];
  return rotated.join('→');
}

/**
 * Build a user-facing error for a detected cycle. The message names the
 * full path chain (rotated to lex-smallest) so the user can grep the
 * error and follow the cycle in their data. `expected` and `actual` are
 * intentionally left `undefined` — this is a structural integrity
 * violation, not a value-vs-expected mismatch, and the `ValidationError`
 * contract allows those fields to be absent.
 */
function emitRefCycleError(
  chain: ReadonlyArray<{ source: string; target: string; site: RefSite }>,
): ValidationError {
  const nodes: string[] = [];
  for (const edge of chain) nodes.push(edge.source);
  const last = chain[chain.length - 1];
  if (last !== undefined) nodes.push(last.target);

  // Rotate message chain to lex-smallest for stable presentation.
  let minIdx = 0;
  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i]! < nodes[minIdx]!) minIdx = i;
  }
  const rotated = [...nodes.slice(minIdx), ...nodes.slice(0, minIdx)];
  const noun = chain.length === 1 ? 'edge' : 'edges';
  const message = `Reference cycle (${chain.length} ${noun}): ${rotated.join(' → ')}`;

  const closing = chain[chain.length - 1]!;
  const base = {
    kind: 'ref-cycle' as const,
    path: closing.site.sourcePath,
    message,
  };
  return closing.site.paramKey !== undefined ? { ...base, paramKey: closing.site.paramKey } : base;
}
