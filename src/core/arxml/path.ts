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
  return e.kind === 'reference' ? (e.shortName ?? e.value) : e.shortName;
}
