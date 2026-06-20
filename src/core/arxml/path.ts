// core/arxml/path.ts
// Pure path helpers for navigating ArxmlDocument. Zero react/electron/fs deps.
// Used by renderer store + editor to locate elements by path string.

import type { ArxmlDocument, ArxmlElement, ArxmlPackage } from './types.js';

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
  if (rootPkg === null) return null;
  // Walk remaining segments. Each segment may be a nested package or a child element.
  let cursor: ArxmlElement | ArxmlPackage | undefined = rootPkg;
  for (const name of rest) {
    if (cursor === undefined) return null;
    if (isPackage(cursor)) {
      const nested = findPackageByShortName(cursor.packages, name);
      if (nested !== null) {
        cursor = nested;
        continue;
      }
      const child: ArxmlElement | undefined = cursor.elements.find((e) => shortNameOf(e) === name);
      if (child === undefined) return null;
      cursor = child;
    } else if (cursor.kind === 'module' || cursor.kind === 'container') {
      const next: ArxmlElement | undefined = cursor.children.find((c) => shortNameOf(c) === name);
      if (next === undefined) return null;
      cursor = next;
    } else {
      // Reference is a leaf — cannot descend further.
      return null;
    }
  }
  if (cursor === undefined || isPackage(cursor)) return null;
  return { pkg: rootPkg, element: cursor };
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
