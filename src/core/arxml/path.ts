// core/arxml/path.ts
// Pure path helpers for navigating ArxmlDocument. Zero react/electron/fs deps.
// Used by renderer store + editor to locate elements by path string.

import type { ArxmlDocument, ArxmlElement, ArxmlModule, ArxmlPackage } from './types.js';

export type ElementPath = string; // e.g. "/EAS/EcuC/EcuCGeneral/ConfigConsistencyRequired"

/**
 * Find a package by its absolute path field (e.g. "/EAS/Com" or
 * "/AUTOSAR_R22/EcucDefs"). Returns null if not found.
 *
 * Sprint 9 #12 (review H-1): walks recursively into nested <AR-PACKAGES> so a
 * R21/R22 BSWMD path like "/AUTOSAR_R22/EcucDefs" resolves when the doc has
 * an `AUTOSAR_R22 > EcucDefs > <module>` hierarchy.
 */
export function packageByPath(doc: ArxmlDocument, path: string): ArxmlPackage | null {
  return findPackageByPath(doc.packages, path);
}

function findPackageByPath(pkgs: readonly ArxmlPackage[], path: string): ArxmlPackage | null {
  for (const p of pkgs) {
    if (p.path === path) return p;
    if (p.packages !== undefined && p.packages.length > 0) {
      const hit = findPackageByPath(p.packages, path);
      if (hit !== null) return hit;
    }
  }
  return null;
}

/**
 * Find an element by slash-separated path. Returns null if any segment misses.
 *
 * Sprint 9 #12 (review H-1): walks the recursive package tree at the root, so
 * a path like `/AUTOSAR_R21/EcucModuleConfigurationValuess/CanIf/CanIfInitCfg`
 * resolves through the nested package structure. Once the leaf package is
 * located the remaining segments are walked against `elements` / `children`.
 *
 * Bug 2c (v1.4.1) — accept BOTH path shapes:
 *
 *   - Canonical 4-segment: `/<pkg>/<module>/<container>/<sub>…` where
 *     `<module>` is the shortName of the `ECUC-MODULE-CONFIGURATION-VALUES`
 *     element inside `pkg.elements`. This is the shape the tree renderer
 *     produces and what the skeleton's `packagePath` field sets up.
 *
 *   - Compressed 3-segment: `/<pkg>/<container>/<sub>…` where the module
 *     segment is omitted. Common when `pkg.shortName === module.shortName`
 *     (the skeleton's default layout — package and module share the
 *     shortName), so the module segment is redundant. Real BSWMD-derived
 *     user projects sometimes ship this shape; the dispatcher cannot
 *     always normalise upstream. The fallback walks every module in the
 *     pkg and accepts the path if `rest[0]` resolves to one of its
 *     top-level containers.
 *
 * The 4-segment walk is tried first because it is the canonical form.
 * The 3-segment fallback only fires when the canonical walk fails on
 * `rest[0]`.
 *
 * At each level a segment may resolve to either a nested `<AR-PACKAGE>` (one
 * of `pkg.packages`) or a child element (module / container / reference) of
 * the current cursor — both shapes are valid in real AUTOSAR trees.
 */
export function findByPath(
  doc: ArxmlDocument,
  elementPath: string,
): { pkg: ArxmlPackage; element: ArxmlElement } | null {
  const segments = elementPath.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const [pkgName, ...rest] = segments;
  if (pkgName === undefined) return null;
  // Locate the root package by shortName (root of the recursive <AR-PACKAGES> tree).
  const rootPkg = findRootPackageByShortName(doc.packages, pkgName);
  if (rootPkg === null) {
    // v1.9.0 (post-c46f4a8) — renderer-fold fallback. Real vendor arxml
    // files nest the ECUC module under a vendor-owned AR-PACKAGE chain
    // (e.g. `JWQ_CDD_PACK > JWQ_Packet > JWQ3399` ECUC). The
    // renderer-side fold (combinedDoc.foldVendorPackages) collapses
    // that chain back to a single top-level package named after the
    // module, so the Tree emits paths like `/JWQ3399/...`. The source
    // doc, however, still has the vendor chain at the top — so the
    // root-package lookup misses entirely. Search the doc tree for an
    // ECUC module whose shortName matches the leading segment; if
    // found, walk the rest of the path from there. The package anchor
    // we return is the root package that holds the matched ECUC
    // element (its `elements` list), which is what callers use for
    // the post-mutation revalidation pass.
    const moduleHit = findModuleInPackages(doc.packages, (el) => el.shortName === pkgName);
    if (moduleHit !== null) {
      const { element, anchorPkg } = moduleHit;
      // `rest[0]` is either the element itself (when `rest` is empty,
      // i.e. the path is exactly `/JWQ3399` — the ECUC element's
      // own shortName) or a child of the element.
      if (rest.length === 0) return { pkg: anchorPkg, element };
      if (element.kind === 'module' || element.kind === 'container') {
        const child: ArxmlElement | undefined = element.children.find(
          (c) => shortNameOf(c) === rest[0],
        );
        if (child === undefined) return null;
        const deeper = walkFrom(child, rest.slice(1));
        if (deeper === null) return null;
        return { pkg: anchorPkg, element: deeper };
      }
      return null;
    }
    return null;
  }
  // Canonical 4-segment walk: rest[0] is a module/element in pkg.
  const canonical = walkFrom(rootPkg, rest);
  if (canonical !== null) return { pkg: rootPkg, element: canonical };
  // Compressed 3-segment fallback: rest[0] is a top-level container of
  // SOME module inside pkg.elements. We try every module and accept the
  // first whose top-level children match.
  for (const mod of rootPkg.elements) {
    if (mod.kind !== 'module') continue;
    const child = mod.children.find((c) => shortNameOf(c) === rest[0]);
    if (child === undefined) continue;
    const target = walkFrom(child, rest.slice(1));
    if (target !== null) return { pkg: rootPkg, element: target };
  }
  return null;
}

/**
 * Walk a sequence of segments against `start`, descending through packages,
 * modules, and containers. Pure helper used by both the canonical walk
 * and the 3-segment fallback in `findByPath`.
 */
function walkFrom(
  start: ArxmlElement | ArxmlPackage,
  segments: readonly string[],
): ArxmlElement | null {
  let cursor: ArxmlElement | ArxmlPackage | undefined = start;
  for (const name of segments) {
    if (cursor === undefined) return null;
    if (isPackage(cursor)) {
      const nested = findPackageByShortName(cursor.packages, name);
      if (nested !== null) {
        cursor = nested;
        continue;
      }
      const child: ArxmlElement | undefined = cursor.elements.find((e) => shortNameOf(e) === name);
      if (child !== undefined) {
        cursor = child;
        continue;
      }
      // v1.9.0 (post-c46f4a8 fix) — same-name AR-PACKAGE wrapper
      // fallback. AUTOSAR canonical / vendored modules often wrap a
      // single ECUC element inside an AR-PACKAGE that shares the
      // module's shortName (e.g. `/JWQ_CDD_PACK/JWQ_Packet/JWQ3399`
      // [AR-PACKAGE] directly holding the `JWQ3399` ECUC element).
      // The skeleton shape changed in c46f4a8 so NEW docs no longer
      // emit this wrapper, but EXISTING user docs (v1.9.0 Sprint X
      // era or pre-c46f4a8 vendor files like the user-reported
      // `JWQ3399_EcucValues.arxml`) still have it. Without this
      // fallback, the walker fails on every path into a wrapped
      // module — `addContainer`, `addParameter`, `addReference`,
      // `removeContainer` all break because `locateParent` returns
      // null and the mutation surfaces `path-not-found`.
      //
      // The descent rule: when `name` doesn't match a sub-package or
      // direct child element, look for a child element whose shortName
      // equals the package's own shortName. The wrapped element is
      // then the new cursor and the next iteration's `name` re-targets
      // a child of the wrapped element. (If `name` already equals
      // cursor.shortName, the caller is targeting the wrapped element
      // itself — step into it directly.)
      // Local alias: the isPackage() guard above narrows `cursor` to
      // ArxmlPackage, but reassignments below widen the union; capture
      // the package's shortName while the narrowing still holds.
      const pkgShortName: string = cursor.shortName;
      const wrapped: ArxmlElement | undefined = cursor.elements.find(
        (e) => shortNameOf(e) === pkgShortName,
      );
      if (wrapped !== undefined) {
        if (name === pkgShortName) {
          cursor = wrapped;
          continue;
        }
        if (wrapped.kind === 'module' || wrapped.kind === 'container') {
          const inner: ArxmlElement | undefined = wrapped.children.find(
            (c) => shortNameOf(c) === name,
          );
          if (inner !== undefined) {
            cursor = inner;
            continue;
          }
        }
      }
      return null;
    } else if (cursor.kind === 'module' || cursor.kind === 'container') {
      const next: ArxmlElement | undefined = cursor.children.find((c) => shortNameOf(c) === name);
      if (next === undefined) return null;
      cursor = next;
    } else {
      // Reference is a leaf — cannot descend further.
      return null;
    }
  }
  if (cursor === undefined) return null;
  if (isPackage(cursor)) {
    // v1.9.0 (post-c46f4a8) — same-name AR-PACKAGE wrapper final-step
    // unwrap. When the path lands on a package whose shortName matches
    // a child element's shortName, return the wrapped element instead
    // of the package. Matches the per-iteration fallback above; needed
    // when the path itself ends on the wrapped layer (no further
    // segment to drive the mid-walk unwrap).
    const pkgShortName = cursor.shortName;
    const wrapped = cursor.elements.find((e) => shortNameOf(e) === pkgShortName);
    if (wrapped !== undefined) return wrapped;
    return null;
  }
  return cursor;
}

function findRootPackageByShortName(
  pkgs: readonly ArxmlPackage[],
  shortName: string,
): ArxmlPackage | null {
  // Fast path: literal top-level match. The vast majority of paths resolve
  // here (canonical layout, BSWMD-derived docs that already flatten
  // AR-PACKAGES).
  for (const p of pkgs) {
    if (p.shortName === shortName) return p;
  }
  // v1.9.0 Sprint X — nested fallback for vendor-prefix source docs.
  // Real vendor arxml files nest the ECUC module package under a
  // vendor-owned chain (e.g. `JWQ_CDD_PACK > JWQ_Packet > JWQ3399`). The
  // renderer-side fold (combinedDoc.foldVendorPackages) collapses that
  // chain back to a single top-level package named after the module, so
  // the Tree emits paths like `/JWQ3399/...`. The source doc, however,
  // still has `JWQ_CDD_PACK` at the top — so the literal shortName lookup
  // misses. Walk the recursive package tree and accept the deepest
  // match. The walk order is depth-first so the FIRST hit wins, which
  // matches the (deterministic) iteration order of the source doc.
  for (const p of pkgs) {
    if (p.packages !== undefined) {
      const nested = findRootPackageByShortName(p.packages, shortName);
      if (nested !== null) return nested;
    }
  }
  return null;
}

function findPackageByShortName(
  pkgs: readonly ArxmlPackage[] | undefined,
  shortName: string,
): ArxmlPackage | null {
  if (pkgs === undefined) return null;
  for (const p of pkgs) {
    if (p.shortName === shortName) return p;
  }
  return null;
}

/**
 * v1.9.0 (post-c46f4a8) — depth-first walk over the recursive
 * `<AR-PACKAGES>` tree that yields each `ECUC-MODULE-CONFIGURATION-VALUES`
 * element alongside the root package that directly contains it (the
 * "anchor" callers use for the post-mutation revalidation pass).
 *
 * Iteration order is depth-first, deterministic per source-doc
 * iteration order. The shared walker backs `findByPath`'s fallback,
 * `findFirstEcucModule`, and `findEcucModuleByShortName` so the
 * three helpers stay in sync as the doc shape evolves.
 *
 * Used by `findByPath` as the fallback when the leading path
 * segment doesn't match a root package by shortName — the typical
 * case for vendor-prefix source docs whose renderer-fold
 * representation puts the module's shortName at the path root.
 */
function findModuleInPackages(
  pkgs: readonly ArxmlPackage[],
  predicate: (el: ArxmlModule) => boolean,
): { element: ArxmlModule; anchorPkg: ArxmlPackage } | null {
  for (const p of pkgs) {
    for (const el of p.elements) {
      if (el.kind === 'module' && predicate(el)) {
        return { element: el, anchorPkg: p };
      }
    }
    if (p.packages !== undefined) {
      const nested = findModuleInPackages(p.packages, predicate);
      if (nested !== null) return nested;
    }
  }
  return null;
}

/**
 * Find the first `ECUC-MODULE-CONFIGURATION-VALUES` element in the doc,
 * walking depth-first across the recursive `<AR-PACKAGES>` tree and
 * descending into each package's `elements` list. Returns `null` when
 * the doc has no ECUC module anywhere.
 *
 * v1.9.0 Sprint X — nested-package parity for the renderer-side
 * `doc.packages[0]?.elements[0]` shortcut. The shortcut silently
 * returns `undefined` on vendor-prefix source docs whose ECUC module
 * lives under one or more `<AR-PACKAGE>` wrappers (e.g.
 * `JWQ_CDD_PACK > JWQ_Packet > JWQ3399`), because `JWQ_CDD_PACK.elements`
 * is empty in that shape — see user-reported
 * `C:\Users\13777\Desktop\ClaudeAutosarWorkSpace\ecuc\JWQ3399_EcucValues.arxml`.
 * Callers that need "the one ECUC module of this doc" should use this
 * helper instead of the flat shortcut so they work on both the
 * canonical flat shape and the vendor-prefix nested shape.
 *
 * **Single-module-doc assumption**: callers assume the doc contains
 * exactly one ECUC module (the common case for skeleton-built or
 * single-module user ECUC values). On a multi-module merged doc,
 * only the first module is returned; callers that need every module
 * should iterate `findModuleInPackages` directly or compose their
 * own depth-first walk.
 */
export function findFirstEcucModule(doc: ArxmlDocument): ArxmlModule | null {
  return findModuleInPackages(doc.packages, () => true)?.element ?? null;
}

/**
 * Find a specific `ECUC-MODULE-CONFIGURATION-VALUES` element by
 * shortName, walking depth-first across the recursive `<AR-PACKAGES>`
 * tree. Returns `null` when no matching module is found.
 *
 * Companion to `findFirstEcucModule` for callers that already know
 * the target module's shortName (e.g. matching a picker's module
 * shortName against an open ECUC doc). Uses the same nested-aware
 * walk so it works on vendor-prefix source docs.
 *
 * **Single-module-doc assumption**: see `findFirstEcucModule` — on a
 * multi-module merged doc the FIRST module with the matching shortName
 * wins (depth-first). If two modules in the same doc share a
 * shortName, only the first is returned; callers needing deterministic
 * selection in that edge case should iterate `findModuleInPackages`.
 */
export function findEcucModuleByShortName(
  doc: ArxmlDocument,
  shortName: string,
): ArxmlModule | null {
  return findModuleInPackages(doc.packages, (el) => el.shortName === shortName)?.element ?? null;
}

// Type guard: distinguish an ArxmlPackage from an ArxmlElement.
// ArxmlPackage has `packages?` and `elements`, ArxmlElement has `kind` and `params`.
function isPackage(value: ArxmlElement | ArxmlPackage): value is ArxmlPackage {
  // ArxmlElement is a discriminated union (kind: 'module' | 'container' | 'reference');
  // ArxmlPackage does not carry a `kind` discriminator, so absence of `kind`
  // is a reliable distinguishing marker.
  return !('kind' in value);
}

/**
 * Combined Tree View (Sprint 13 Stage 3.5) — locate an element across
 * multiple loaded documents.
 *
 * The combined view synthesises a virtual ArxmlDocument whose top-level
 * packages are the per-file basenames; child paths are prefixed with the
 * source file's basename (or `[doc:N]` for same-basename duplicates).
 * `findByPathMultiDoc` strips that prefix and routes the lookup back to
 * the source document, returning the located element alongside the
 * source `filePath` so the caller can dispatch a `updateParam` mutation
 * to the right document.
 *
 * Returns null when:
 *   - the leading segment is neither a known basename nor a `[doc:N]`
 *     index token
 *   - the source document exists but the inner path misses
 *
 * Pure — no I/O, no mutation. Used by the renderer's ParamEditor to
 * resolve a `selectedPath` from the combined view back to the original
 * ArxmlDocument.
 */
export function findByPathMultiDoc(
  docs: readonly ArxmlDocument[],
  filePaths: readonly string[],
  combinedPath: string,
): { doc: ArxmlDocument; filePath: string; pkg: ArxmlPackage; element: ArxmlElement } | null {
  const segments = combinedPath.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const [head, ...rest] = segments;
  if (head === undefined) return null;
  // Resolve the source doc from the head segment. Two forms supported:
  //   - basename:    "/Can.arxml/..." → match filePath whose basename is "Can.arxml"
  //   - index token: "/[doc:0]/..."   → match by filePaths position
  let docIdx: number = -1;
  if (/^\[doc:\d+\]$/.test(head)) {
    const n = Number.parseInt(head.slice(5, -1), 10);
    if (Number.isInteger(n) && n >= 0 && n < filePaths.length) {
      docIdx = n;
    }
  } else {
    docIdx = filePaths.findIndex((p) => lastSegment(p) === head);
  }
  if (docIdx === -1) {
    // Sprint 16 — flat-mode fallback. The combined view detected no
    // collision and skipped the per-file basename wrapper, so
    // selectedPath carries no prefix. Try each doc in sequence with
    // the raw path; first hit wins. Uniqueness is guaranteed by the
    // collision detector in buildCombinedDocument (module shortNames
    // are disjoint across docs).
    for (let i = 0; i < docs.length; i += 1) {
      const doc = docs[i];
      const filePath = filePaths[i];
      if (doc === undefined || filePath === undefined) continue;
      const found = findByPath(doc, combinedPath);
      if (found !== null) {
        return { doc, filePath, pkg: found.pkg, element: found.element };
      }
    }
    return null;
  }
  const doc = docs[docIdx];
  const filePath = filePaths[docIdx];
  if (doc === undefined || filePath === undefined) return null;
  // Reassemble the inner path with a leading slash so findByPath can
  // anchor on the first root-package segment.
  const innerPath = `/${rest.join('/')}`;
  const found = findByPath(doc, innerPath);
  if (found === null) return null;
  return { doc, filePath, pkg: found.pkg, element: found.element };
}

/**
 * Last segment of a file path (after the last `/` or `\`). Mirrors
 * `@shared/path#basename` but kept inline so the `core/` layer stays
 * zero-dep on `shared/`.
 */
function lastSegment(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/** Equality check on params dict. Key-order independent; values via JSON. */
export function paramsEqual(
  a: Readonly<Record<string, unknown>>,
  b: Readonly<Record<string, unknown>>,
): boolean {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return false;
    if (JSON.stringify(a[ka[i] as string]) !== JSON.stringify(b[ka[i] as string])) return false;
  }
  return true;
}

function shortNameOf(e: ArxmlElement): string {
  if (e.kind === 'reference') return e.shortName ?? e.value;
  // v1.4.0 trust sprint — 17c. Unknown vendor extensions have no
  // SHORT-NAME; fall back to the captured tagName so path lookup
  // still gets a unique segment.
  if (e.kind === 'unknown') return e.tagName;
  return e.shortName;
}
