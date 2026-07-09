// core/validation/validate/coverage.ts
// Sprint 9 #4 — shortName-uniqueness fallback resolver helpers +
// BSW-SEC-005 POST-BUILD variant-coverage validator.
//
// Split from `src/core/validation/validate.ts` as part of v1.41.x
// PATCH T1 (file-size backlog). Owns:
//   - `buildShortNameIndex` + `tryResolveByShortName` +
//     `tryResolveByShortNameWithIndex` (the shortName→entries reverse
//     index used by `checkCrossRefs` for branch-mismatch fallback)
//   - `VariantCoverageWarning` + `VariantCoverageValue` types +
//     `validateVariantCoverage` (the POST-BUILD coverage check).

import type { BswModuleDef } from '../../project/bswmd/index.js';
import type { PathIndexEntry } from '../types.js';

// ============================================================================
// Sprint 9 #4 — shortName uniqueness fallback resolver
// ============================================================================

/**
 * Build a `shortName → entries[]` reverse index from a pathIndex. Exported
 * so callers handling many sites (e.g. `checkCrossRefs`) can amortise the
 * O(n) build cost across all lookups: build once, pass the result to
 * `tryResolveByShortName` for each site. For a single-shot lookup, call
 * `tryResolveByShortName` directly — it builds its own index internally.
 *
 * Pure / side-effect-free: the input `pathIndex` is never mutated. The
 * returned map is a fresh `Map` owned by the caller.
 */
export function buildShortNameIndex(
  pathIndex: ReadonlyMap<string, PathIndexEntry>,
): ReadonlyMap<string, readonly PathIndexEntry[]> {
  const out = new Map<string, PathIndexEntry[]>();
  for (const entry of pathIndex.values()) {
    const arr = out.get(entry.shortName);
    if (arr === undefined) {
      out.set(entry.shortName, [entry]);
    } else {
      arr.push(entry);
    }
  }
  return out;
}

/**
 * Fallback resolver for cross-ref strict-lookup misses. Closes
 * branch-mismatch cases like:
 *
 *   target: `/EcucDefs/Com/ComConfig/ComIPduGroup/CAN_NetworkTx`
 *   actual: `/EcucDefs/Com/CanConfigSet/CAN_NetworkTx`
 *   leaf:   `CAN_NetworkTx` (unique in pathIndex → resolve)
 *
 * The `path` argument should already be `resolveTargetPath`-normalised
 * (namespace + type-segment strip); this helper does no further path
 * rewriting. It compares the leaf shortName against `pathIndex` and
 * returns the unique match if there is exactly one.
 *
 * Semantics:
 *   - 0 match    → `undefined` (caller emits cross-ref error)
 *   - 1 match    → the `PathIndexEntry` (caller treats as resolved)
 *   - ≥2 matches → `undefined` (ambiguous; caller emits cross-ref error)
 *   - empty / trailing-slash path → `undefined` (placeholder filter is the
 *     caller's job, but this guard makes the helper safe in isolation)
 *   - case-sensitive: `CanX` does not match `canx`
 *
 * Pure / side-effect-free / immutable. Does not mutate `pathIndex` or
 * the entries it returns. For high-volume callers (`checkCrossRefs` with
 * 1336 sites), prefer building the shortName index once via
 * `buildShortNameIndex` and passing it to the lower-level overload.
 *
 * @param path the (already-normalised) target path to look up.
 * @param pathIndex the project's full path index.
 * @returns the unique `PathIndexEntry` matching the leaf shortName, or
 *          `undefined` if the leaf is missing or ambiguous.
 */
export function tryResolveByShortName(
  path: string,
  pathIndex: ReadonlyMap<string, PathIndexEntry>,
): PathIndexEntry | undefined {
  const shortNameIndex = buildShortNameIndex(pathIndex);
  return tryResolveByShortNameWithIndex(path, shortNameIndex);
}

/**
 * Lower-level overload of `tryResolveByShortName` that accepts a
 * pre-built shortName index. Most callers should use the public
 * `tryResolveByShortName`; this overload is for hot loops that build
 * the shortName index once and look up many times (see
 * `checkCrossRefs`). Exported for symmetry with `buildShortNameIndex`
 * and the `normalizePath` / `tryStripTypeSegment` / `resolveTargetPath`
 * helper family.
 */
export function tryResolveByShortNameWithIndex(
  path: string,
  shortNameIndex: ReadonlyMap<string, readonly PathIndexEntry[]>,
): PathIndexEntry | undefined {
  // Trailing-slash placeholder: `isUnsetPlaceholder` is the caller's
  // responsibility in the validation pipeline, but we guard here so the
  // helper is safe in isolation (per JSDoc).
  if (path === '' || path.endsWith('/')) return undefined;
  const segments = path.split('/').filter((s) => s.length > 0);
  const leaf = segments[segments.length - 1];
  if (leaf === undefined || leaf.length === 0) return undefined;
  const matches = shortNameIndex.get(leaf);
  if (matches === undefined) return undefined;
  if (matches.length !== 1) return undefined; // 0 (covered above) or ≥2
  return matches[0];
}

// ============================================================================
// BSW-SEC-005 (v1.17.0) — POST-BUILD parameter without variant coverage
// ============================================================================

export interface VariantCoverageWarning {
  readonly kind: 'BSW-SEC-005';
  readonly severity: 'error';
  readonly message: string;
  readonly path: string;
}

export interface VariantCoverageValue {
  readonly paramPath: string;
  readonly variantRef?: string;
}

interface CoverageNode {
  readonly path: string;
  readonly parameters: readonly { readonly path: string }[];
  readonly multiplicityConfigClasses?: readonly { readonly configClass: string }[];
  readonly subContainers: readonly CoverageNode[];
  readonly choices: readonly CoverageNode[];
}

/**
 * BSW-SEC-005 (v1.17.0) — POST-BUILD parameter without variant coverage.
 *
 * Walks every container's parameters, collects those whose
 * multiplicityConfigClasses include `POST-BUILD`, and checks that at
 * least one runtime value carries a variantRef covering the path.
 * Recurses into subContainers + choices (same traversal pattern as
 * `findContainerInTree` in bswmd.ts).
 *
 * Returns one warning per uncovered POST-BUILD param. Empty array
 * means all POST-BUILD params have variant coverage.
 */
export function validateVariantCoverage(
  values: ReadonlyArray<VariantCoverageValue>,
  bswmd: BswModuleDef,
): ReadonlyArray<VariantCoverageWarning> {
  const warnings: VariantCoverageWarning[] = [];
  const visit = (node: CoverageNode): void => {
    const isPostBuild =
      node.multiplicityConfigClasses?.some((m) => m.configClass === 'POST-BUILD') ?? false;
    if (isPostBuild) {
      for (const p of node.parameters) {
        const covered = values.some((v) => v.paramPath === p.path && v.variantRef !== undefined);
        if (!covered) {
          warnings.push({
            kind: 'BSW-SEC-005',
            severity: 'error',
            message: `POST-BUILD parameter ${p.path} requires variant coverage`,
            path: p.path,
          });
        }
      }
    }
    for (const sub of node.subContainers) visit(sub);
    for (const ch of node.choices) visit(ch);
  };
  for (const c of bswmd.containers) visit(c);
  return warnings;
}
