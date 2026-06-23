// core/arxml/mutation.ts
// Sprint 15 — pure mutation functions for ECUC add/delete operations.
//
// Three families of operations live here:
//   1. Container / parameter add (writes to doc, returns new doc on success)
//   2. Container / parameter remove (writes to doc, returns new doc on success)
//   3. Reverse-reference scan + allowed-element enumeration (read-only)
//
// Every function returns `Result<T, MutationError>` so callers (renderer
// store) can surface errors via `setError()` without ever throwing. The
// pure helpers in this file share the same `Result` envelope used by
// `parseArxml` and `serializeArxml` (see types.ts).
//
// Zero react/electron/fs deps — same constraint as the rest of `core/`.
//
// Reference equality preservation: when an operation is a no-op (e.g.
// removing a container that does not exist) the function returns the same
// `ArxmlDocument` reference. This lets the store skip `set()` calls when
// the value did not actually change, mirroring the convention in
// `useArxmlStore.applyParamUpdate`.

import { getContainerDefByPath } from '../project/bswmd.js';
import type { BswModuleDef, ContainerDef, ParamDef, ReferenceDef } from '../project/bswmd.js';

import { buildDefaultValue, fillParamsFromBswmd } from './defaultValue.js';
import { findByPath } from './path.js';
import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ArxmlPackage,
  ParamValue,
  Result,
} from './types.js';

/**
 * Error envelope for the mutation functions. The 6 kinds cover the failure
 * modes the picker / delete flow can hit; the store action maps each to
 * a localized `setError()` message.
 */
export type MutationError =
  | { readonly kind: 'path-not-found'; readonly path: string }
  | { readonly kind: 'name-conflict'; readonly shortName: string }
  | {
      readonly kind: 'multiplicity-exceeded';
      readonly path: string;
      readonly upper: number;
      readonly current: number;
    }
  | {
      readonly kind: 'multiplicity-floor';
      readonly path: string;
      readonly lower: number;
      readonly current: number;
    }
  | { readonly kind: 'no-bswmd-for-module'; readonly modulePath: string }
  | {
      readonly kind: 'invalid-param-type';
      readonly key: string;
      readonly expected: ParamDef['kind'];
    };

/**
 * A single entry in the add-element picker. Combines the kind (container /
 * parameter / reference) with the multiplicity context so the renderer can
 * disable rows that would violate the schema without re-querying.
 */
export interface AllowedSubElement {
  readonly kind: 'container' | 'parameter' | 'reference';
  readonly shortName: string;
  readonly displayLabel: string;
  readonly multiplicity: {
    readonly lower: number;
    readonly upper: number | 'infinite';
    readonly current: number;
  };
  readonly disabled: boolean;
  readonly disabledReason?: 'at-max' | 'already-added';
}

/**
 * A reference to a path that points at a specific container / param.
 * Returned by `findReferencesTo` so the cascade-delete flow can
 * enumerate the dangling references a "Only delete" choice leaves behind.
 */
export interface ReferenceHit {
  readonly filePath: string;
  readonly containerPath: string;
  readonly paramKey: string;
}

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
  const newContainer: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: effectiveShortName,
    definitionRef: childContainerDef.path,
    params: fillParamsFromBswmd(childContainerDef),
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

function findInboundReferences(doc: ArxmlDocument, targetPath: string): readonly InboundRef[] {
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

function collectPackageElements(pkg: ArxmlPackage, out: StackFrame[]): void {
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
function removeReferenceParam(doc: ArxmlDocument, ref: InboundRef): ArxmlDocument | null {
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
function removeElementAtPath(doc: ArxmlDocument, path: string): ArxmlDocument | null {
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
function checkMultiplicityFloor(
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
 */
function findElementByPath(doc: ArxmlDocument, segments: readonly string[]): ArxmlElement | null {
  if (segments.length === 0) return null;
  const [pkgName, ...rest] = segments;
  if (pkgName === undefined) return null;
  const rootPkg = doc.packages.find((p) => p.shortName === pkgName);
  if (rootPkg === undefined) return null;
  return findInPackage(rootPkg, rest);
}

function findInPackage(pkg: ArxmlPackage, segments: readonly string[]): ArxmlElement | null {
  let cursor: ArxmlElement | ArxmlPackage = pkg;
  for (const name of segments) {
    if (isPackage(cursor)) {
      const child: ArxmlElement | undefined = cursor.elements.find((e) => shortNameOf(e) === name);
      if (child === undefined) return null;
      cursor = child;
      continue;
    }
    if (cursor.kind === 'module' || cursor.kind === 'container') {
      const next: ArxmlElement | undefined = cursor.children.find((c) => shortNameOf(c) === name);
      if (next === undefined) return null;
      cursor = next;
      continue;
    }
    return null;
  }
  return isPackage(cursor) ? null : cursor;
}

/**
 * Add a new parameter to the container at `containerPath`. The default
 * value is taken from `paramDef.defaultValue` (already typed per
 * `ParamDef['kind']`); the function maps the BSWMD `kind` to the
 * `ParamValue['type']` tag used by the value-side serializer.
 */
export function addParameter(
  doc: ArxmlDocument,
  containerPath: string,
  paramDef: ParamDef,
  moduleDef: BswModuleDef,
): Result<ArxmlDocument, MutationError> {
  const located = locateParent(doc, containerPath);
  if (located === null) {
    return { ok: false, error: { kind: 'path-not-found', path: containerPath } };
  }
  const { parent, pkg } = located;
  if (parent.kind !== 'container' && parent.kind !== 'module') {
    return { ok: false, error: { kind: 'path-not-found', path: containerPath } };
  }
  // Cross-reference `paramDef` against the BSWMD container's declared
  // parameters. The picker guarantees this match in the happy path; the
  // check here is a defence-in-depth so a stale `paramDef` (e.g. cached
  // from before a BSWMD reload) cannot inject an undeclared key.
  //
  // Module-level parents have no `ContainerDef` to cross-reference against
  // (modules rarely carry parameters in the BSWMD), so the BSWMD check is
  // skipped when the sub-path is empty.
  const subPath = containerPathToSubPath(containerPath, moduleDef);
  if (subPath === null) {
    return { ok: false, error: { kind: 'path-not-found', path: containerPath } };
  }
  if (subPath !== '') {
    const parentContainerDef = getContainerDefByPath(moduleDef, subPath);
    if (
      parentContainerDef === null ||
      !parentContainerDef.parameters.some((p) => p.shortName === paramDef.shortName)
    ) {
      return {
        ok: false,
        error: { kind: 'invalid-param-type', key: paramDef.shortName, expected: paramDef.kind },
      };
    }
  }
  if (Object.prototype.hasOwnProperty.call(parent.params, paramDef.shortName)) {
    return { ok: false, error: { kind: 'name-conflict', shortName: paramDef.shortName } };
  }
  const value = buildDefaultValue(paramDef);
  if (value === null) {
    return {
      ok: false,
      error: { kind: 'invalid-param-type', key: paramDef.shortName, expected: paramDef.kind },
    };
  }
  // Sprint 16c #2 — stamp the BSWMD-side path as `definitionRef` so the
  // serializer (commit `b767ea6`) writes the real DEFINITION-REF instead
  // of falling back to `/__synthesized__/<shortName>`. Mirrors the
  // pattern in `skeleton.ts:141` (`{ ...v, definitionRef: p.path }`).
  // Empty `paramDef.path` falls through to the existing synthesized-path
  // fallback (degenerate BSWMD — don't emit an empty DEFINITION-REF).
  const nextValue: ParamValue =
    paramDef.path !== '' ? ({ ...value, definitionRef: paramDef.path } as ParamValue) : value;
  const nextParams: Readonly<Record<string, ParamValue>> = {
    ...parent.params,
    [paramDef.shortName]: nextValue,
  };
  const nextParent: ArxmlModule | ArxmlContainer =
    parent.kind === 'module'
      ? { ...parent, params: nextParams }
      : { ...parent, params: nextParams };
  const next = replaceElement(doc, pkg, parent, nextParent);
  return { ok: true, value: next };
}

/**
 * Strip the module-prefix from a value-side container path so the remainder
 * is a relative sub-path accepted by `getContainerDefByPath`. We locate the
 * module's `shortName` (last occurrence) inside the value-side path rather
 * than the BSWMD's internal `path` because the value-side carries an
 * additional package prefix (e.g. `/EAS/Can/CanConfigSet` while the BSWMD
 * path is `/Can/CanConfigSet`). Returns `null` when the module segment is
 * not present.
 */
function containerPathToSubPath(containerPath: string, moduleDef: BswModuleDef): string | null {
  const segments = containerPath.split('/').filter(Boolean);
  // The module's shortName typically appears once in the path; we use
  // lastIndexOf so a degenerate case (container whose shortName shadows
  // the module's) still finds the right boundary.
  const moduleIdx = segments.lastIndexOf(moduleDef.shortName);
  if (moduleIdx === -1) return null;
  return segments.slice(moduleIdx + 1).join('/');
}

/**
 * Add a new reference-typed parameter to the container at `containerPath`.
 * Mirrors `addParameter` but looks up the `ReferenceDef` in the parent
 * container's `references[]` (not `parameters[]`) and constructs a
 * `ParamValue` with `{ type: 'reference', value: '', dest }`. The
 * reference value is left empty (placeholder) — the user fills it in
 * via `ReferenceEditor` after the pick.
 */
export function addReference(
  doc: ArxmlDocument,
  containerPath: string,
  refDef: ReferenceDef,
  moduleDef: BswModuleDef,
): Result<ArxmlDocument, MutationError> {
  const located = locateParent(doc, containerPath);
  if (located === null) {
    return { ok: false, error: { kind: 'path-not-found', path: containerPath } };
  }
  const { parent, pkg } = located;
  if (parent.kind !== 'container' && parent.kind !== 'module') {
    return { ok: false, error: { kind: 'path-not-found', path: containerPath } };
  }
  // Cross-reference the `refDef` against the BSWMD container's
  // declared references (the picker is the happy-path source; this is
  // defence-in-depth against a stale refDef).
  const subPath = containerPathToSubPath(containerPath, moduleDef);
  if (subPath === null) {
    return { ok: false, error: { kind: 'path-not-found', path: containerPath } };
  }
  if (subPath !== '') {
    const parentContainerDef = getContainerDefByPath(moduleDef, subPath);
    if (
      parentContainerDef === null ||
      !parentContainerDef.references.some((r) => r.shortName === refDef.shortName)
    ) {
      return {
        ok: false,
        error: { kind: 'invalid-param-type', key: refDef.shortName, expected: 'string' },
      };
    }
  }
  if (Object.prototype.hasOwnProperty.call(parent.params, refDef.shortName)) {
    return { ok: false, error: { kind: 'name-conflict', shortName: refDef.shortName } };
  }
  const value: ParamValue = {
    type: 'reference',
    value: '',
    dest: refDef.destKind,
  };
  // Sprint 16c #2 — same `definitionRef` stamping as `addParameter`. The
  // serializer's reference-param path also writes DEFINITION-REF from
  // `value.definitionRef`; falling back to the synthesized placeholder
  // here would defeat the T3 fix for user-added references too.
  const nextValue: ParamValue =
    refDef.path !== '' ? ({ ...value, definitionRef: refDef.path } as ParamValue) : value;
  const nextParams: Readonly<Record<string, ParamValue>> = {
    ...parent.params,
    [refDef.shortName]: nextValue,
  };
  const nextParent: ArxmlModule | ArxmlContainer =
    parent.kind === 'module'
      ? { ...parent, params: nextParams }
      : { ...parent, params: nextParams };
  const next = replaceElement(doc, pkg, parent, nextParent);
  return { ok: true, value: next };
}

/**
 * Remove a single parameter by key. Returns the same `ArxmlDocument`
 * reference when the key is not present (no-op).
 */
export function removeParameter(
  doc: ArxmlDocument,
  containerPath: string,
  paramKey: string,
): Result<ArxmlDocument, MutationError> {
  const located = locateParent(doc, containerPath);
  if (located === null) {
    return { ok: false, error: { kind: 'path-not-found', path: containerPath } };
  }
  const { parent, pkg } = located;
  if (!Object.prototype.hasOwnProperty.call(parent.params, paramKey)) {
    // No-op — the key is already gone. Preserve reference equality.
    return { ok: true, value: doc };
  }
  const nextParams: Readonly<Record<string, ParamValue>> = omitKey(parent.params, paramKey);
  const nextParent: ArxmlModule | ArxmlContainer =
    parent.kind === 'module'
      ? { ...parent, params: nextParams }
      : { ...parent, params: nextParams };
  const next = replaceElement(doc, pkg, parent, nextParent);
  return { ok: true, value: next };
}

/**
 * Build a new record with the given key omitted. Spread-destructure keeps
 * the type narrowed and produces a new object only when the key is
 * actually present.
 */
function omitKey<V>(record: Readonly<Record<string, V>>, key: string): Readonly<Record<string, V>> {
  if (!Object.prototype.hasOwnProperty.call(record, key)) return record;
  const out: Record<string, V> = {};
  for (const [k, v] of Object.entries(record)) {
    if (k === key) continue;
    out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API — read-only helpers
// ---------------------------------------------------------------------------

/**
 * Enumerate the addable sub-elements (parameters, references, sub-containers)
 * for the BSWMD-defined container `containerDef`, annotated with the
 * current instance count under `currentContainer` so the picker can
 * grey out rows that would violate the upper bound.
 *
 * `moduleDef` is accepted for symmetry with future cross-container checks
 * (e.g. choice-branch alternatives) but is not consulted today.
 */
export function listAllowedSubElements(
  _moduleDef: BswModuleDef,
  containerDef: ContainerDef,
  currentContainer: ArxmlContainer | ArxmlModule,
): readonly AllowedSubElement[] {
  const out: AllowedSubElement[] = [];

  for (const p of containerDef.parameters) {
    const current = currentContainer.params[p.shortName] !== undefined ? 1 : 0;
    // AUTOSAR parameters are inherently 1..1 — a second add would hit
    // `name-conflict` in `addParameter` (the core path is correct per
    // spec). Mark the picker row disabled with a typed reason so the
    // UI can surface the constraint up-front instead of letting the
    // user click through and hit a silent error. Bug 2 follow-up.
    const alreadyAdded = current >= 1;
    out.push({
      kind: 'parameter',
      shortName: p.shortName,
      displayLabel: p.shortName,
      multiplicity: { lower: 1, upper: 1, current },
      disabled: alreadyAdded,
      ...(alreadyAdded ? { disabledReason: 'already-added' as const } : {}),
    });
  }

  for (const r of containerDef.references) {
    const current = currentContainer.params[r.shortName] !== undefined ? 1 : 0;
    // AUTOSAR references are also 1..1 within a parent container.
    // Same UX fix as parameters above — surface the constraint in the
    // picker rather than via a silent name-conflict on submit.
    const alreadyAdded = current >= 1;
    out.push({
      kind: 'reference',
      shortName: r.shortName,
      displayLabel: r.shortName,
      multiplicity: { lower: 1, upper: 1, current },
      disabled: alreadyAdded,
      ...(alreadyAdded ? { disabledReason: 'already-added' as const } : {}),
    });
  }

  // subContainers and choice branches share the same "addable" surface
  // from the user's perspective. Use the merged list here so the picker
  // gets a unified enumeration; the choice badge is rendered by the
  // picker's row when `c.choices.length > 0`.
  for (const sub of containerDef.subContainers) {
    out.push(buildContainerAllowed(sub, currentContainer));
  }
  for (const choice of containerDef.choices) {
    out.push(buildContainerAllowed(choice, currentContainer));
  }
  return out;
}

function buildContainerAllowed(
  sub: ContainerDef,
  currentContainer: ArxmlContainer | ArxmlModule,
): AllowedSubElement {
  const current = countChildrenWithShortName(currentContainer, sub.shortName);
  const atMax = sub.upperMultiplicity !== 'infinite' && current >= sub.upperMultiplicity;
  // `exactOptionalPropertyTypes` forbids assigning `undefined` to an
  // optional field; conditionally spread the property so the shape is
  // precise.
  return {
    kind: 'container',
    shortName: sub.shortName,
    displayLabel: sub.shortName,
    multiplicity: { lower: sub.lowerMultiplicity, upper: sub.upperMultiplicity, current },
    disabled: atMax,
    ...(atMax ? { disabledReason: 'at-max' as const } : {}),
  };
}

/**
 * Scan every loaded document for reference-typed parameters whose `value`
 * ends with `targetPath`. The path is matched by suffix because ECUC
 * `<VALUE-REF>` content is an absolute path string and we don't want to
 * require an exact match when the target is the trailing portion.
 *
 * Returned hits are ready for the cascade-delete dialog to render.
 */
export function findReferencesTo(
  documents: readonly { readonly doc: ArxmlDocument; readonly filePath: string }[],
  targetPath: string,
): readonly ReferenceHit[] {
  const out: ReferenceHit[] = [];
  for (const { doc, filePath } of documents) {
    for (const hit of scanDocForRefs(doc, filePath, targetPath)) {
      out.push(hit);
    }
  }
  return out;
}

function scanDocForRefs(
  doc: ArxmlDocument,
  filePath: string,
  targetPath: string,
): readonly ReferenceHit[] {
  const out: ReferenceHit[] = [];
  for (const pkg of doc.packages) {
    scanPackage(pkg, filePath, targetPath, out);
  }
  return out;
}

function scanPackage(
  pkg: ArxmlPackage,
  filePath: string,
  targetPath: string,
  out: ReferenceHit[],
): void {
  for (const el of pkg.elements) {
    const elPath = `/${pkg.shortName}/${shortNameOf(el)}`;
    scanElement(el, elPath, filePath, targetPath, out);
  }
  if (pkg.packages !== undefined) {
    for (const nested of pkg.packages) {
      scanPackage(nested, filePath, targetPath, out);
    }
  }
}

function scanElement(
  el: ArxmlElement,
  elPath: string,
  filePath: string,
  targetPath: string,
  out: ReferenceHit[],
): void {
  if (el.kind === 'reference') return;
  // v1.4.0 trust sprint — 17c. Unknown vendor extensions are leaves
  // and carry no params / children to scan for cross-refs. They
  // contain opaque data captured verbatim and cannot host any
  // project-internal VALUE-REFs (those would have been classified as
  // ArxmlReference / ArxmlContainer in `classifyElement`).
  if (el.kind === 'unknown') return;
  for (const [key, value] of Object.entries(el.params)) {
    if (value.type === 'reference' && endsWithPath(value.value, targetPath)) {
      out.push({ filePath, containerPath: elPath, paramKey: key });
    }
  }
  for (const child of el.children) {
    const childPath = `${elPath}/${shortNameOf(child)}`;
    scanElement(child, childPath, filePath, targetPath, out);
  }
}

function endsWithPath(value: string, targetPath: string): boolean {
  if (value === targetPath) return true;
  if (!value.endsWith(targetPath)) return false;
  // Verify a path-segment boundary at the join. Without this, a value of
  // "/EAS/SomeOtherCanIfBufferCfg" would match a target of
  // "/EAS/CanIfBufferCfg" via suffix alone (the trailing 13 characters
  // match), causing the cascade-delete dialog to surface the wrong
  // dangling references. The boundary char must be `/` for a true
  // sub-path match.
  const beforeIdx = value.length - targetPath.length - 1;
  if (beforeIdx < 0) return true; // length-equal but not === case is unreachable
  return value.charCodeAt(beforeIdx) === 47; // 47 === '/'
}

// ---------------------------------------------------------------------------
// Internal helpers — tree walk + immutable update
// ---------------------------------------------------------------------------

interface LocatedParent {
  readonly parent: ArxmlModule | ArxmlContainer;
  readonly pkg: ArxmlPackage;
}

/**
 * Walk `doc.packages` to find the element at `parentPath`. Returns the
 * parent module / container and the package it lives in.
 *
 * Bug 2c (v1.4.1) — delegates to `findByPath` so the canonical 4-segment
 * shape (`/<pkg>/<module>/<container>/<sub>…`) AND the compressed 3-segment
 * shape (`/<pkg>/<container>/<sub>…`, used when `pkg.shortName ===
 * module.shortName`) both resolve. The caller cannot normalise upstream.
 *
 * Refuses unknown / reference leaves — those are not valid mutation
 * parents even when path-walking succeeds.
 */
function locateParent(doc: ArxmlDocument, parentPath: string): LocatedParent | null {
  const found = findByPath(doc, parentPath);
  if (found === null) return null;
  const { pkg, element } = found;
  if (element.kind === 'reference' || element.kind === 'unknown') return null;
  return { parent: element, pkg };
}

function findRootPackageByShortName(
  pkgs: readonly ArxmlPackage[],
  shortName: string,
): ArxmlPackage | null {
  for (const p of pkgs) {
    if (p.shortName === shortName) return p;
  }
  return null;
}

function isPackage(value: ArxmlElement | ArxmlPackage): value is ArxmlPackage {
  return !('kind' in value);
}

function shortNameOf(e: ArxmlElement): string {
  if (e.kind === 'reference') return e.shortName ?? e.value;
  // v1.4.0 trust sprint — 17c. Unknown elements have no SHORT-NAME;
  // fall back to the captured tagName so sibling iteration still
  // produces a unique path segment.
  if (e.kind === 'unknown') return e.tagName;
  return e.shortName;
}

function hasChildWithShortName(parent: ArxmlModule | ArxmlContainer, shortName: string): boolean {
  return parent.children.some((c) => shortNameOf(c) === shortName);
}

function countChildrenWithShortName(
  parent: ArxmlModule | ArxmlContainer,
  shortName: string,
): number {
  let n = 0;
  for (const c of parent.children) {
    if (shortNameOf(c) === shortName) n += 1;
  }
  return n;
}

/**
 * Insert a new child into the parent's `children` array, returning a new
 * `ArxmlDocument` with the change reflected. Reference equality is
 * preserved when the parent is not actually inside the doc (defensive —
 * shouldn't happen if `locateParent` returned a hit).
 */
function insertChild(
  doc: ArxmlDocument,
  pkg: ArxmlPackage,
  parent: ArxmlModule | ArxmlContainer,
  child: ArxmlContainer,
  _moduleDef: BswModuleDef,
  _parentPath: string,
): ArxmlDocument {
  return replaceElement(doc, pkg, parent, appendChild(parent, child));
}

function appendChild(
  parent: ArxmlModule | ArxmlContainer,
  child: ArxmlContainer,
): ArxmlModule | ArxmlContainer {
  if (parent.kind === 'module') {
    return { ...parent, children: [...parent.children, child] };
  }
  return { ...parent, children: [...parent.children, child] };
}

/**
 * Walk the doc tree and replace the *first* element whose identity
 * matches `target` (compared by `kind + shortName`) with `replacement`.
 * Returns the same `ArxmlDocument` reference when no match is found.
 */
function replaceElement(
  doc: ArxmlDocument,
  pkg: ArxmlPackage,
  target: ArxmlModule | ArxmlContainer,
  replacement: ArxmlModule | ArxmlContainer,
): ArxmlDocument {
  // The `pkg` parameter is the package the caller believes holds the
  // target. For most calls (post-fold display paths on single-layer
  // docs) it's correct. For vendor-prefix legacy docs where the
  // path walker fell through to the ECUC search fallback, the
  // returned `pkg` is the inner package that directly contains the
  // ECUC module (e.g. JWQ_Packet), not the top-level package. Without
  // the descent below, `replaceInElements` would only run against
  // the top-level package (where the inner pkg's identity is not
  // found), `changed` would stay false, and the function would
  // silently return the original doc — every mutation would no-op
  // with no error.
  //
  // Try the fast path first (caller's package matches a top-level
  // package); if not, walk the recursive tree and replace wherever
  // the target lives.
  const fastResult = replaceInTopLevelPackage(doc, pkg, target, replacement);
  if (fastResult.changed) return fastResult.doc;
  return replaceAnywhere(doc, target, replacement);
}

function replaceInTopLevelPackage(
  doc: ArxmlDocument,
  pkg: ArxmlPackage,
  target: ArxmlModule | ArxmlContainer,
  replacement: ArxmlModule | ArxmlContainer,
): { readonly changed: boolean; readonly doc: ArxmlDocument } {
  let changed = false;
  const nextPackages = doc.packages.map((p) => {
    if (p !== pkg) return p;
    const nextElements = replaceInElements(p.elements, target, replacement);
    if (nextElements === p.elements) return p;
    changed = true;
    return { ...p, elements: nextElements };
  });
  if (!changed) return { changed: false, doc };
  return { changed: true, doc: { ...doc, packages: nextPackages } };
}

function replaceAnywhere(
  doc: ArxmlDocument,
  target: ArxmlModule | ArxmlContainer,
  replacement: ArxmlModule | ArxmlContainer,
): ArxmlDocument {
  let changed = false;
  const nextPackages = mapPackagesDeep(doc.packages, (p) => {
    const nextElements = replaceInElements(p.elements, target, replacement);
    if (nextElements === p.elements) return p;
    changed = true;
    return { ...p, elements: nextElements };
  });
  if (!changed) return doc;
  return { ...doc, packages: nextPackages };
}

function mapPackagesDeep(
  pkgs: readonly ArxmlPackage[],
  fn: (p: ArxmlPackage) => ArxmlPackage,
): readonly ArxmlPackage[] {
  let changed = false;
  const out: ArxmlPackage[] = pkgs.map((p) => {
    const mapped = fn(p);
    if (mapped !== p) {
      changed = true;
      return mapped;
    }
    if (p.packages === undefined || p.packages.length === 0) return p;
    const nextNested = mapPackagesDeep(p.packages, fn);
    if (nextNested === p.packages) return p;
    changed = true;
    return { ...p, packages: nextNested };
  });
  return changed ? out : pkgs;
}

function replaceInElements(
  elements: readonly ArxmlElement[],
  target: ArxmlModule | ArxmlContainer,
  replacement: ArxmlModule | ArxmlContainer,
): readonly ArxmlElement[] {
  let changed = false;
  const next = elements.map((el): ArxmlElement => {
    if (sameIdentity(el, target)) {
      changed = true;
      return replacement;
    }
    if (el.kind === 'module' || el.kind === 'container') {
      const replacedChildren = replaceInElements(el.children, target, replacement);
      if (replacedChildren === el.children) return el;
      changed = true;
      if (el.kind === 'module') return { ...el, children: replacedChildren };
      return { ...el, children: replacedChildren };
    }
    return el;
  });
  if (!changed) return elements;
  return next;
}

function sameIdentity(a: ArxmlElement, b: ArxmlModule | ArxmlContainer): boolean {
  // After the kind-inequality short-circuit, `a` is narrowed to the same
  // kind as `b` — which is always non-reference — so the remaining
  // shortName comparison is safe.
  if (a.kind !== b.kind) return false;
  return a.shortName === b.shortName;
}

/**
 * Remove the element at `parentPath` (which must be a sub-path under
 * `pkgName`) by walking down `rest` segments and dropping the leaf.
 * Returns `null` if no match is found.
 */
function removeElement(
  doc: ArxmlDocument,
  pkgName: string,
  rest: readonly string[],
): ArxmlDocument | null {
  const rootPkg = findRootPackageByShortName(doc.packages, pkgName);
  if (rootPkg === null) return null;
  let changed = false;
  const nextPackages = doc.packages.map((p) => {
    if (p !== rootPkg) return p;
    const nextElements = removeInElements(p.elements, rest);
    if (nextElements === p.elements) return p;
    changed = true;
    return { ...p, elements: nextElements };
  });
  if (!changed) return null;
  return { ...doc, packages: nextPackages };
}

function removeInElements(
  elements: readonly ArxmlElement[],
  rest: readonly string[],
): readonly ArxmlElement[] {
  if (rest.length === 0) return elements;
  const [head, ...tail] = rest;
  if (head === undefined) return elements;
  let changed = false;
  const next: ArxmlElement[] = [];
  for (const el of elements) {
    if (el.kind === 'reference' || el.kind === 'unknown') {
      // v1.4.0 trust sprint — 17c. Unknown vendor extensions are leaves
      // and have no SHORT-NAME match — push through untouched.
      next.push(el);
      continue;
    }
    if (el.shortName === head) {
      if (tail.length === 0) {
        // Drop this element.
        changed = true;
        continue;
      }
      // Descend and try to remove deeper.
      const replacedChildren = removeInElements(el.children, tail);
      if (replacedChildren === el.children) {
        next.push(el);
      } else {
        changed = true;
        if (el.kind === 'module') {
          next.push({ ...el, children: replacedChildren });
        } else {
          next.push({ ...el, children: replacedChildren });
        }
      }
      continue;
    }
    next.push(el);
  }
  if (!changed) return elements;
  return next;
}

// ---------------------------------------------------------------------------
// ParamValue default construction
// ---------------------------------------------------------------------------

// `buildDefaultValue` was extracted post-v1.0.0 to `./defaultValue.ts`
// so `skeleton.ts` can reuse the same ParamKind→ParamValue coercion
// without duplicating the mapping logic.
