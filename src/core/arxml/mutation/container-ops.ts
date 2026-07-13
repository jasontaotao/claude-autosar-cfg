// core/arxml/mutation/container-ops.ts
// Container / module add/remove operations. Split from
// `src/core/arxml/mutation.ts` as part of v1.41.x PATCH T2 (file-size
// backlog).
//
// Public API: addContainer, removeContainer, coreBulkRemove,
// removeModuleFromDoc, removeWithCascade. Internal helpers:
// findInboundReferences, collectPackageElements, removeReferenceParam,
// removeElementAtPath, checkMultiplicityFloor, findElementByPath,
// removeElement.

import { fillParamsFromBswmd } from '../../arxml/defaultValue.js';
import { findByPath } from '../../arxml/path.js';
import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlPackage,
  ParamValue,
  Result,
} from '../../arxml/types.js';
import type { BswModuleDef, ContainerDef } from '../../project/bswmd.js';
import { getContainerDefByPath } from '../../project/bswmd.js';

import { endsWithPath } from './discovery.js';
import {
  makeReferenceParamValue,
  removeParameter,
  containerPathToSubPath,
} from './param-ref-ops.js';
import {
  countChildrenWithShortName,
  hasChildWithShortName,
  insertChild,
  locateParent,
  removeElement,
  shortNameOf,
} from './tree-ops.js';
import type { MutationError } from './types.js';

// ---------------------------------------------------------------------------
// Public API — add operations
// ---------------------------------------------------------------------------

/**
 * Append a new sub-container to the element at `parentPath`. The new
 * container's schema (multiplicity bounds, type info) is supplied via
 * `childContainerDef` so we can enforce the upper-bound check without
 * re-querying the BSWMD.
 *
 * The function is single-doc scoped: cascade (removing references that
 * point at this container) is the store's responsibility via
 * `findReferencesTo` + `removeParameter`. This keeps the core layer
 * composable and testable.
 */
export function addContainer(
  doc: ArxmlDocument,
  parentPath: string,
  shortName: string,
  moduleDef: BswModuleDef,
  childContainerDef: ContainerDef,
): Result<ArxmlDocument, MutationError> {
  // 1. Locate the parent in the doc tree.
  const located = locateParent(doc, parentPath);
  if (located === null) {
    return { ok: false, error: { kind: 'path-not-found', path: parentPath } };
  }
  const { parent, pkg } = located;

  // 2. Enforce the upper multiplicity for the new container's *kind*
  //    FIRST, so that adding a 2nd copy of a maxed-out definition yields
  //    `multiplicity-exceeded` (more specific) instead of `name-conflict`.
  //    Count existing siblings with the same shortName and compare against
  //    the def.
  const current = countChildrenWithShortName(parent, shortName);
  if (
    childContainerDef.upperMultiplicity !== 'infinite' &&
    current >= childContainerDef.upperMultiplicity
  ) {
    return {
      ok: false,
      error: {
        kind: 'multiplicity-exceeded',
        path: parentPath,
        upper: childContainerDef.upperMultiplicity,
        current,
      },
    };
  }

  // 3. v1.8.4 Bug 2 — container shortNames are NOT required to be unique
  //    when the parent def permits multi-instance; Step 2's
  //    multiplicity-exceeded check already enforces the ceiling. When
  //    a sibling with the same shortName already exists, auto-suffix
  //    the new container with `_${n}` (Vector CANdb++ default naming)
  //    so the path stays unique without requiring the user to pick a
  //    unique name in the picker. Parameter uniqueness is preserved by
  //    `addParameter` (separate code path).
  let effectiveShortName = shortName;
  let attempt = 0;
  while (hasChildWithShortName(parent, effectiveShortName)) {
    attempt += 1;
    effectiveShortName = `${shortName}_${attempt}`;
  }

  // 4. Build the new container element and insert it.
  //
  // v1.9.0 Sprint X — stamp BSWMD-side path + description and fill
  // defaults from the childContainerDef so the serializer emits a
  // spec-compliant ECUC-CONTAINER-VALUE (with <DEFINITION-REF> +
  // <PARAMETER-VALUES>) for every added instance, including the
  // `_1`/`_2`/`_N` multi-instance suffixes from Step 3.
  //
  // v1.27.2 PATCH — also seed empty reference params. Pre-patch, the
  // container was created with no reference params in `params[]`, so a
  // follow-up `set-param` on a reference like `didRef` / `routineRef`
  // would fail with `param-not-found` (the param key was absent in the
  // new container's params map). The mapper path (xlsx → add-child +
  // set-param on the freshly-added container) requires reference params
  // to be present at add time. The skeleton factory (`generateEcucSkeleton`)
  // does NOT route through `addContainer` — it builds its own
  // ArxmlContainer literals with `params: fillParamsFromBswmd(c)` — so
  // the existing `skeleton.test.ts` invariant `skips reference params
  // (use addReference separately)` is preserved.
  const baseParams = fillParamsFromBswmd(childContainerDef);
  const seededParams: Record<string, ParamValue> = { ...baseParams };
  for (const ref of childContainerDef.references) {
    if (seededParams[ref.shortName] === undefined) {
      // v1.27.2 PATCH (code-review HIGH fix) — include `dest: ref.destKind`
      // so the seeded reference has the same shape as one created via
      // `addReference` (`mutation.ts:668-672`). Without `dest`, a user
      // who later calls `addReference` on the same shortName would hit
      // `name-conflict` (line 665-667) because the seeded entry occupies
      // the key but lacks the `dest` attribute the canonical reference
      // shape carries. Mirrors `addReference` exactly.
      seededParams[ref.shortName] = makeReferenceParamValue({
        value: '',
        dest: ref.destKind,
        definitionRef: ref.path,
      });
    }
  }
  const newContainer: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: effectiveShortName,
    definitionRef: childContainerDef.path,
    params: seededParams,
    description: childContainerDef.desc,
    // Multi-instance instances do NOT pre-create sub-containers —
    // the user adds them individually. Matches the skeleton's
    // `buildSubContainerShell` decision to skip lower=0 entries.
    children: [],
  };
  const next = insertChild(doc, pkg, parent, newContainer, moduleDef, parentPath);
  return { ok: true, value: next };
}

// ---------------------------------------------------------------------------
// Public API — remove operations
// ---------------------------------------------------------------------------

/**
 * Remove the container at `containerPath`. Returns the same `ArxmlDocument`
 * reference when the path does not resolve (no-op). The `cascade` flag is
 * accepted for API symmetry with the store action but the core layer
 * cannot reach across documents — cascade over multiple loaded docs is
 * orchestrated by the store.
 *
 * When `moduleDef` is provided, the function enforces the
 * `multiplicity-floor` rule: if removing the container would drop the
 * parent below its BSWMD-declared `lowerMultiplicity`, the call returns
 * a `multiplicity-floor` error and the doc is not mutated. Pass `null`
 * to skip the floor check (e.g. for tests, or when the BSWMD is not
 * loaded).
 */
export function removeContainer(
  doc: ArxmlDocument,
  containerPath: string,
  _cascade: boolean,
  moduleDef: BswModuleDef | null = null,
): Result<ArxmlDocument, MutationError> {
  const segments = containerPath.split('/').filter(Boolean);
  if (segments.length < 3) {
    return { ok: false, error: { kind: 'path-not-found', path: containerPath } };
  }
  const [pkgName, ...rest] = segments;
  if (pkgName === undefined) {
    return { ok: false, error: { kind: 'path-not-found', path: containerPath } };
  }
  // Multiplicity-floor check: when BSWMD is available, the target's
  // container definition constrains the minimum number of instances the
  // parent can carry. Refuse to remove if the parent would drop below
  // the floor (Sprint 15 spec § 4.3 — hard block, no "are you sure"
  // dialog). We check BEFORE mutating so a failed call preserves the
  // same doc reference.
  if (moduleDef !== null) {
    const floor = checkMultiplicityFloor(doc, containerPath, moduleDef);
    if (floor !== null) {
      return { ok: false, error: floor };
    }
  }
  const removed = removeElement(doc, pkgName, rest);
  if (removed === null) {
    return { ok: false, error: { kind: 'path-not-found', path: containerPath } };
  }
  return { ok: true, value: removed };
}

/**
 * Result envelope for {@link coreBulkRemove}.
 *
 * `doc` is the post-removal `ArxmlDocument` — the pre-validation
 * guarantees either every supplied shortName was removed (success,
 * with `doc` differing from the input by reference equality) or the
 * floor violation was rejected up front (`doc` matches the input by
 * reference and `removed` is empty).
 *
 * `removed` lists the full `parentPath/<shortName>` paths actually
 * dropped. Downstream callers can use this for audit logging or
 * dirty-path bookkeeping without re-walking the tree.
 */
export interface BulkRemoveResult {
  readonly doc: ArxmlDocument;
  readonly removed: readonly string[];
}

/**
 * Batch-validated bulk removal of multiple sibling containers sharing a
 * common base path under a parent. Adds all-or-nothing atomicity on
 * top of {@link removeContainer}: either every supplied shortName is
 * dropped, or the returned doc matches the input by reference and the
 * `multiplicity-floor` error is surfaced without any mutation.
 *
 * P2 reviewer finding — earlier `bulkDelete` ran
 * `removeContainer` once per sibling. As soon as removal reached the
 * BSWMD lower-multiplicity floor (e.g. `lower=1` on required
 * siblings), the trailing calls failed silently and the reducer kept
 * the unmodified state — leaving the user with a half-deleted parent
 * and no visible diagnostic. This function fixes that by pre-computing
 * the would-be parent-child count for the entire batch BEFORE calling
 * any `removeContainer`, returning the hard floor error up front when
 * the batch would violate the BSWMD invariant.
 *
 * Implementation strategy:
 *   1. Locate the parent element once.
 *   2. Count current siblings for each affected base shortName.
 *   3. Compute the post-removal count (`current - toRemoveCount`). If
 *      any goes below the matching `BswContainerDef.lowerMultiplicity`
 *      (resolved via either `moduleDef.containers` for module parents
 *      or `getContainerDefByPath` for container parents), return the
 *      `multiplicity-floor` error WITHOUT calling any `removeContainer`.
 *   4. Otherwise fold sequential `removeContainer` calls into the next
 *      doc. The pre-check guarantees no per-call floor violation can
 *      surface mid-sequence; any unexpected failure (e.g. vanished
 *      path between the count pass and the remove pass) propagates as
 *      an error and the next doc reference equals the input up to
 *      that point, preserving the atomicity contract from the user's
 *      perspective.
 *
 * `moduleDef === undefined | null` skips the floor check entirely
 * (caller assertion: see `addContainer`'s BSWMD-required contract).
 * When the BSWMD is absent, the function still removes every supplied
 * path; the all-or-nothing guarantee only applies to the per-call
 * error envelope, not to a BSWMD floor.
 */
export function coreBulkRemove(
  doc: ArxmlDocument,
  parentPath: string,
  childShortNames: readonly string[],
  moduleDef: BswModuleDef | null | undefined,
): Result<BulkRemoveResult, MutationError> {
  // Empty batch: a no-op rather than an error. The slice action treats
  // this the same as "nothing matched" — but we surface `removed: []`
  // explicitly so callers can distinguish the empty-batch case from a
  // multi-zero-match situation at the slice layer.
  if (childShortNames.length === 0) {
    return { ok: true, value: { doc, removed: [] } };
  }
  // Step 1 — locate the parent. `findByPath` walks the entire pkg/module/
  // container tree so the parent may itself be a module or a nested
  // container. Non-module/container parents are silently treated as
  // "no siblings" — `checkMultiplicityFloor` returns null in the same
  // situation so we mirror that here rather than rejecting upfront.
  const parentSegments = parentPath.split('/').filter(Boolean);
  const parentEl = findElementByPath(doc, parentSegments);
  if (parentEl === null || (parentEl.kind !== 'module' && parentEl.kind !== 'container')) {
    return { ok: false, error: { kind: 'path-not-found', path: parentPath } };
  }
  // Multi-instance containers share a single BSWMD `ContainerDef` and
  // distinguish their auto-suffixed siblings (`Cell`, `Cell_1`, ...)
  // only at the tree layer. The floor check applies to the *base*
  // shortName count — `Cell`, `Cell_1`, `Cell_2` are 3 instances of
  // the same logical container. We replicate `components/tree/collections.ts#stripSuffix`
  // inline so the core layer stays free of renderer-tree imports.
  const stripNumericSuffix = (name: string): string => name.replace(/_[0-9]+$/, '');
  // Group supplied shortNames by their base shortName. A batch that
  // targets multiple unrelated bases (`Cell`, `Other`) is allowed;
  // each base is checked independently against its own BSWMD def.
  const perBaseBatch = new Map<string, string[]>();
  for (const shortName of childShortNames) {
    const base = stripNumericSuffix(shortName);
    const bucket = perBaseBatch.get(base);
    if (bucket === undefined) {
      perBaseBatch.set(base, [shortName]);
    } else {
      bucket.push(shortName);
    }
  }
  // Step 2 — pre-validation against the BSWMD floor. Skip when no
  // moduleDef is supplied (mirrors `removeContainer`'s `moduleDef ===
  // null` semantics — the BSWMD-absent path is for tests + edge cases
  // where the floor cannot be evaluated).
  if (moduleDef !== undefined && moduleDef !== null) {
    for (const [base, batchForBase] of perBaseBatch) {
      // Count current siblings whose stripSuffix matches the base.
      // `Cell`, `Cell_1`, `Cell_2` all resolve to base `Cell` so the
      // tally carries over from `addContainer`'s lower-bound guarantee.
      let currentBaseCount = 0;
      for (const child of parentEl.children) {
        if (child.kind !== 'container' && child.kind !== 'module') continue;
        if (stripNumericSuffix(child.shortName) === base) currentBaseCount += 1;
      }
      // Resolve the BSWMD def for the affected base. Parent-kind
      // dispatch mirrors `checkMultiplicityFloor` (module parents
      // look in `moduleDef.containers`; container parents go through
      // `getContainerDefByPath` → walk `subContainers` + `choices`).
      let def: ContainerDef | undefined;
      if (parentEl.kind === 'module') {
        def = moduleDef.containers.find((c) => c.shortName === base);
      } else {
        const parentSubPath = containerPathToSubPath(parentSegments.join('/'), moduleDef);
        if (parentSubPath !== null) {
          const parentDef = getContainerDefByPath(moduleDef, parentSubPath);
          if (parentDef !== null) {
            def =
              parentDef.subContainers.find((c) => c.shortName === base) ??
              parentDef.choices.find((c) => c.shortName === base);
          }
        }
      }
      if (def === undefined) continue;
      // The post-removal base count drops by the size of this batch's
      // base-subset. If the result is below the BSWMD floor, surface
      // a hard error WITHOUT calling any `removeContainer` — the
      // all-or-nothing contract is the whole point of this function.
      const afterBaseCount = currentBaseCount - batchForBase.length;
      if (afterBaseCount < def.lowerMultiplicity) {
        return {
          ok: false,
          error: {
            kind: 'multiplicity-floor',
            // Surface the parent's path (not one of the children) so
            // the UI toast highlights the relationship that would be
            // violated.
            path: parentPath,
            lower: def.lowerMultiplicity,
            current: currentBaseCount,
          },
        };
      }
    }
  }
  // Step 3 — sequential remove. The pre-validation guarantees no
  // floor violation can fire; unexpected per-call errors (e.g. an
  // already-removed target) abort the rest of the batch by returning
  // the error without committing the partial doc — the slice treats
  // the entire operation as a no-op in that case, matching the
  // atomicity contract.
  const removedPaths: string[] = [];
  let working = doc;
  for (const shortName of childShortNames) {
    const fullPath = `${parentPath}/${shortName}`;
    const result = removeContainer(working, fullPath, false, moduleDef ?? null);
    if (!result.ok) {
      // Mid-batch failure should be unreachable under BSWMD-loaded
      // conditions (the pre-check above rules out the only known
      // failure mode). If something else trips the call (path vanished
      // between count and remove, parent unexpectedly empty), we
      // bubble the error and drop the partial `working` doc — callers
      // commit the atomic no-op and surface the message via
      // `setErrorWithKind`. Returning the original `doc` reference
      // here would lose the error envelope; using the partial doc
      // would commit inconsistent state — the error-only return is
      // the only correct choice.
      return { ok: false, error: result.error };
    }
    working = result.value;
    removedPaths.push(fullPath);
  }
  return { ok: true, value: { doc: working, removed: removedPaths } };
}

/**
 * Sprint A+ — remove the module-kind element at `modulePath` from `doc`.
 * Pure helper used by `deleteEcucModule` to clear the entire
 * `<ECUC-MODULE-CONFIGURATION-VALUES>` element without cascading to
 * inbound references (refs target containers, not modules — the BSWMD
 * invariant guarantees nothing points at a module root).
 *
 * No-op semantics: returns the same `ArxmlDocument` reference when
 *   - the path does not resolve
 *   - the resolved element is not a module (container / reference / unknown)
 *   - the resolved element is already absent (defensive)
 *
 * Implementation note: the ECUC module is a direct child of its root
 * package (`pkg.elements`), not a child of an element. The legacy
 * `removeElement` helper walks `parent.children` and is therefore
 * unsuitable for top-level package elements; we drop the module here
 * with a direct immutable package rebuild. Reference equality is
 * preserved when the target does not match (defensive guard).
 */
export function removeModuleFromDoc(doc: ArxmlDocument, modulePath: string): ArxmlDocument {
  const target = findByPath(doc, modulePath);
  if (target === null) return doc;
  if (target.element.kind !== 'module') return doc;
  const nextElements = target.pkg.elements.filter((e) => e !== target.element);
  if (nextElements.length === target.pkg.elements.length) return doc;
  // Rebuild only the matched package. The map() preserves reference
  // equality on the unchanged packages so the doc is fully immutable.
  let pkgReplaced = false;
  const nextPackages = doc.packages.map((p) => {
    if (p !== target.pkg) return p;
    pkgReplaced = true;
    return { ...p, elements: nextElements };
  });
  if (!pkgReplaced) return doc;
  return { ...doc, packages: nextPackages };
}

/**
 * Remove the element at `path` AND any inbound references that target it
 * (auto-dangle strategy). Single-doc scope: cross-doc cascade is the
 * store's responsibility via `findReferencesTo`.
 *
 * Cascade strategy:
 *   - Confirm `path` resolves in the doc; otherwise return
 *     `path-not-found` (the target must exist before we sweep refs).
 *   - Iteratively walk every package/module/container collecting
 *     `<REFERENCE>`-typed params whose `value` suffix-matches the
 *     target. The walk uses a `visited` set to defend against
 *     reference cycles (e.g. A → B → A would otherwise recurse forever).
 *   - Remove the target first, then each inbound reference. Each
 *     remove is a no-op (reference-equality preserved) if the path is
 *     no longer present — a defensive guard for nested refs that the
 *     cycle walk might re-record.
 *   - On the no-op second call the target is gone, so we return
 *     `path-not-found` (mirrors `removeContainer`'s error envelope).
 *
 * The cycle-defence policy is "remove target, accept dangling refs":
 * if A and B reference each other and A is removed, B's ref to A
 * becomes dangling. The cascade removes A and the references INTO A
 * (one of which lives in B) but does not loop to remove B itself.
 * Callers that need stricter semantics should use
 * `findReferencesTo` to surface the dangling list in a confirm dialog.
 */
export function removeWithCascade(
  doc: ArxmlDocument,
  path: string,
): Result<ArxmlDocument, MutationError> {
  // Step 1: confirm target exists. `findByPath` walks both the canonical
  // 4-segment path shape and the compressed 3-segment shape (see
  // `path.ts` Bug 2c notes) so users with `pkg.shortName ===
  // module.shortName` layouts still get a hit.
  const target = findByPath(doc, path);
  if (target === null) {
    return { ok: false, error: { kind: 'path-not-found', path } };
  }

  // Step 2: collect every reference-typed param whose value targets
  // the path being removed. The walker is iterative (stack-based BFS)
  // with a `visited` set so cyclic reference graphs terminate.
  const inboundRefs = findInboundReferences(doc, path);

  // Step 3: apply the removes in order. Remove the target first, then
  // each inbound ref. Each ref remove is a no-op if the ref is no
  // longer present (e.g. nested under an element that was already
  // swept).
  let next = doc;
  const targetRemoved = removeElementAtPath(next, path);
  if (targetRemoved === null) {
    // Path was resolvable in step 1 but not in step 3 — defensive.
    // Return the original doc as a no-op to keep the contract
    // monotonic.
    return { ok: true, value: next };
  }
  next = targetRemoved;
  for (const refParam of inboundRefs) {
    const updated = removeReferenceParam(next, refParam);
    if (updated !== null) next = updated;
  }
  return { ok: true, value: next };
}

/**
 * Iteratively collect every (containerPath, paramKey) pair whose
 * `<REFERENCE>`-typed param value targets `targetPath`. The walker
 * tracks each element's full path by chaining `parentPath + '/' +
 * shortName` (ArxmlElement does not carry a `path` field — that is
 * only on ArxmlPackage — so we have to build the path on the fly
 * during the walk).
 *
 * The walk uses a `visited` set keyed by full path so cyclic
 * reference graphs (A → B → A) terminate. Pure read-only.
 */
interface InboundRef {
  readonly containerPath: string;
  readonly paramKey: string;
}

interface StackFrame {
  readonly el: ArxmlElement;
  readonly currentPath: string;
}

export function findInboundReferences(
  doc: ArxmlDocument,
  targetPath: string,
): readonly InboundRef[] {
  const out: InboundRef[] = [];
  const visited = new Set<string>();
  // Start from every root element of every package (root packages may
  // also be nested — walk the recursive `pkg.packages` shape too).
  const stack: StackFrame[] = [];
  for (const pkg of doc.packages) {
    collectPackageElements(pkg, stack);
  }
  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) break;
    if (visited.has(frame.currentPath)) continue;
    visited.add(frame.currentPath);
    const { el, currentPath } = frame;
    // Module + container hold params; reference/unknown are leaves.
    if (el.kind === 'module' || el.kind === 'container') {
      for (const [key, value] of Object.entries(el.params)) {
        if (value.type === 'reference' && endsWithPath(value.value, targetPath)) {
          out.push({ containerPath: currentPath, paramKey: key });
        }
      }
      for (const child of el.children) {
        stack.push({ el: child, currentPath: `${currentPath}/${shortNameOf(child)}` });
      }
    }
  }
  return out;
}

export function collectPackageElements(pkg: ArxmlPackage, out: StackFrame[]): void {
  for (const el of pkg.elements) {
    out.push({ el, currentPath: `/${pkg.shortName}/${shortNameOf(el)}` });
  }
  if (pkg.packages !== undefined) {
    for (const nested of pkg.packages) collectPackageElements(nested, out);
  }
}

/**
 * Remove a single `<REFERENCE>`-typed param from a container. Returns
 * the new doc when the param was actually dropped; `null` when the
 * container or key is already gone (no-op). Mirrors the
 * reference-equality convention from `removeParameter`.
 */
export function removeReferenceParam(doc: ArxmlDocument, ref: InboundRef): ArxmlDocument | null {
  // Reuse `removeParameter` for the actual param-omit logic — it
  // already returns a `path-not-found` Result when the parent is
  // missing, and preserves ref equality on the no-op key case.
  const r = removeParameter(doc, ref.containerPath, ref.paramKey);
  return r.ok ? r.value : null;
}

/**
 * Path-walker variant of `removeElement` that operates on a full
 * slash-separated path (not pkgName + tail). Reuses the
 * `removeElement` helper by splitting the path on `/`.
 */
export function removeElementAtPath(doc: ArxmlDocument, path: string): ArxmlDocument | null {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  const [pkgName, ...rest] = segments;
  if (pkgName === undefined) return null;
  return removeElement(doc, pkgName, rest);
}

/**
 * Return a `multiplicity-floor` error when removing `containerPath` would
 * drop the parent below the target container's BSWMD `lowerMultiplicity`.
 * Returns `null` when the floor is satisfied (or the target has no BSWMD
 * definition and the check cannot be made). Pure read-only — does not
 * mutate the doc.
 */
export function checkMultiplicityFloor(
  doc: ArxmlDocument,
  containerPath: string,
  moduleDef: BswModuleDef,
): MutationError | null {
  const segments = containerPath.split('/').filter(Boolean);
  const targetShortName = segments[segments.length - 1];
  const parentSegments = segments.slice(0, -1);
  if (targetShortName === undefined || parentSegments.length === 0) return null;
  // Walk the doc to find the parent element and count same-typed
  // siblings (other children of the parent with the same shortName).
  const parent = findElementByPath(doc, parentSegments);
  if (parent === null || (parent.kind !== 'module' && parent.kind !== 'container')) {
    return null;
  }
  const current = countChildrenWithShortName(parent, targetShortName);
  if (current <= 1) {
    // After removal, the parent would carry zero instances. Look up the
    // BSWMD def for this child to check its `lowerMultiplicity`. The
    // def lives in either `moduleDef.containers` (parent is a module)
    // or `parentDef.subContainers ∪ choices` (parent is a container).
    let def: ContainerDef | undefined;
    if (parent.kind === 'module') {
      def = moduleDef.containers.find((c) => c.shortName === targetShortName);
    } else {
      const parentSubPath = containerPathToSubPath(parentSegments.join('/'), moduleDef);
      if (parentSubPath === null) return null;
      const parentDef = getContainerDefByPath(moduleDef, parentSubPath);
      if (parentDef === null) return null;
      def =
        parentDef.subContainers.find((c) => c.shortName === targetShortName) ??
        parentDef.choices.find((c) => c.shortName === targetShortName);
    }
    if (def === undefined) return null;
    if (def.lowerMultiplicity > 0) {
      return {
        kind: 'multiplicity-floor',
        path: containerPath,
        lower: def.lowerMultiplicity,
        current,
      };
    }
  }
  return null;
}

/**
 * Walk `doc.packages` recursively to find the element at `segments`
 * (relative to root package). Returns the element (module / container /
 * reference) or `null` if any segment misses.
 *
 * v1.9.0 Sprint X — delegate to `path.ts#findByPath`, which already
 * handles nested AR-PACKAGE chains and the same-name AR-PACKAGE
 * wrapper fallback. The legacy flat `doc.packages.find(...)` lookup
 * missed every vendor-prefix source doc whose ECUC module lives
 * under 2+ <AR-PACKAGE> wrappers (e.g. `JWQ_CDD_PACK > JWQ_Packet >
 * JWQ3399`) — that broke `checkMultiplicityFloor` on nested docs.
 */
export function findElementByPath(
  doc: ArxmlDocument,
  segments: readonly string[],
): ArxmlElement | null {
  if (segments.length === 0) return null;
  return findByPath(doc, `/${segments.join('/')}`)?.element ?? null;
}
