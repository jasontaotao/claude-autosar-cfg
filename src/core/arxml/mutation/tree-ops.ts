// core/arxml/mutation/tree-ops.ts
// Internal tree-walk + immutable update primitives. Split from
// `src/core/arxml/mutation.ts` as part of v1.41.x PATCH T2 (file-size
// backlog).
//
// Public API: none. Internal helpers: locateParent, shortNameOf,
// hasChildWithShortName, countChildrenWithShortName, insertChild,
// appendChild, replaceElement, replaceInTopLevelPackage, replaceAnywhere,
// mapPackagesDeep, replaceInElements, sameIdentity, zeroValueForKind.

import type { BswModuleDef, ParamKind } from '../../project/bswmd.js';
import { findByPath } from '../../arxml/path.js';
import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ArxmlPackage,
  ParamValue,
} from '../../arxml/types.js';

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
export function locateParent(doc: ArxmlDocument, parentPath: string): LocatedParent | null {
  const found = findByPath(doc, parentPath);
  if (found === null) return null;
  const { pkg, element } = found;
  if (element.kind === 'reference' || element.kind === 'unknown') return null;
  return { parent: element, pkg };
}

export function shortNameOf(e: ArxmlElement): string {
  if (e.kind === 'reference') return e.shortName ?? e.value;
  // v1.4.0 trust sprint — 17c. Unknown elements have no SHORT-NAME;
  // fall back to the captured tagName so sibling iteration still
  // produces a unique path segment.
  if (e.kind === 'unknown') return e.tagName;
  return e.shortName;
}

export function hasChildWithShortName(parent: ArxmlModule | ArxmlContainer, shortName: string): boolean {
  return parent.children.some((c) => shortNameOf(c) === shortName);
}

export function countChildrenWithShortName(
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
export function insertChild(
  doc: ArxmlDocument,
  pkg: ArxmlPackage,
  parent: ArxmlModule | ArxmlContainer,
  child: ArxmlContainer,
  _moduleDef: BswModuleDef,
  _parentPath: string,
): ArxmlDocument {
  return replaceElement(doc, pkg, parent, appendChild(parent, child));
}

export function appendChild(
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
export function replaceElement(
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

export function replaceInTopLevelPackage(
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

export function replaceAnywhere(
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

export function mapPackagesDeep(
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

export function replaceInElements(
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

export function sameIdentity(a: ArxmlElement, b: ArxmlModule | ArxmlContainer): boolean {
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
 *
 * v1.9.0 Sprint X — nested-package parity. The legacy flat walker only
 * checked `rootPkg.elements`; vendor-prefix source docs nest the ECUC
 * module under a chain of <AR-PACKAGE> wrappers (e.g. `JWQ_CDD_PACK >
 * JWQ_Packet > JWQ3399` — the user-reported shape from
 * `C:\Users\13777\Desktop\ClaudeAutosarWorkSpace\ecuc\JWQ3399_EcucValues.arxml`).
 * In that shape `rootPkg.elements` is empty and the target lives in
 * `rootPkg.packages[i].elements`, so the flat walk returns null and
 * `removeContainer` silently surfaces `path-not-found` for every
 * container (including the 0..* placeholders that the user reports
 * cannot be deleted after being added).
 *
 * Delegate to `path.ts#findByPath` (already handles nested packages
 * + the same-name AR-PACKAGE wrapper fallback) and `replaceElement`
 * (already handles nested via the top-level + anywhere fallback) so
 * the remove path inherits the same nested-package support the lookup
 * paths have had since the v1.9.0 Sprint X 3-layer fix landed.
 */
export function removeElement(
  doc: ArxmlDocument,
  pkgName: string,
  rest: readonly string[],
): ArxmlDocument | null {
  const fullPath = `/${[pkgName, ...rest].join('/')}`;
  const targetHit = findByPath(doc, fullPath);
  if (targetHit === null) return null;
  const { element: target, pkg: anchorPkg } = targetHit;
  if (target.kind === 'reference' || target.kind === 'unknown') return null;
  // Locate the parent by dropping the trailing segment. The parent
  // element is the one whose children we re-build without the target.
  const parentSegments = [pkgName, ...rest].slice(0, -1);
  if (parentSegments.length === 0) return null;
  const parentPath = `/${parentSegments.join('/')}`;
  const parentHit = findByPath(doc, parentPath);
  if (parentHit === null) return null;
  const { element: parent } = parentHit;
  if (parent.kind !== 'module' && parent.kind !== 'container') return null;
  // Reference-equality removal so multi-instance siblings are
  // preserved — only the specific target is dropped, not all
  // siblings sharing the same kind+shortName.
  const newChildren = parent.children.filter((c) => c !== target);
  if (newChildren.length === parent.children.length) return null;
  const newParent: ArxmlModule | ArxmlContainer =
    parent.kind === 'module'
      ? { ...parent, children: newChildren }
      : { ...parent, children: newChildren };
  const next = replaceElement(doc, anchorPkg, parent, newParent);
  // `replaceElement` returns the original doc reference when no
  // element matched; treat that as a failed removal so callers see
  // `path-not-found` rather than a silent no-op.
  return next === doc ? null : next;
}

// ---------------------------------------------------------------------------
// ParamValue default construction
// ---------------------------------------------------------------------------

// `buildDefaultValue` was extracted post-v1.0.0 to `./defaultValue.ts`
// so `skeleton.ts` can reuse the same ParamKind→ParamValue coercion
// without duplicating the mapping logic.

/**
 * Sprint 18 hotfix — typed zero-value for params whose BSWMD omits
 * `<DEFAULT-VALUE>`. Used as the `addParameter` fallback when
 * `buildDefaultValue` returns `null`. The placeholder is overwritten
 * on the first user edit; the renderer treats an empty enum / string
 * as "not yet picked" (EnumEditor falls back to a free-form text
 * input, IntegerEditor accepts the initial `0`, etc.).
 *
 * Note: the placeholder for `enumeration` is the empty string
 * (NOT one of `paramDef.enumerationLiterals`) so we never silently
 * materialise a value the BSWMD hasn't declared. The validator will
 * flag the empty-string enum value against the BSWMD's literal set,
 * which is the correct user-facing signal.
 */
export function zeroValueForKind(kind: ParamKind): ParamValue | null {
  // C9 (v1.17.0): no derivedFrom impact in this switch — derived
  // branch is a validator-only concern (BSW-SEC-005). This switch
  // operates on ParamKind (scalar type discriminator), not on the
  // BswModuleDef.derivedFrom field. Generator / emit / mutation /
  // slice hooks will branch on derivedFrom in v1.18.0 Batch 3 (C8
  // variant engineering).
  switch (kind) {
    case 'integer':
      return { type: 'integer', value: 0 };
    case 'float':
      return { type: 'float', value: 0 };
    case 'boolean':
      return { type: 'boolean', value: false };
    case 'enumeration':
      return { type: 'enum', value: '' };
    case 'string':
    case 'function-name':
      return { type: 'string', value: '' };
  }
}
