// core/arxml/path.ts
// Pure path helpers for navigating ArxmlDocument. Zero react/electron/fs deps.
// Used by renderer store + editor to locate elements by path string.

import type { ArxmlDocument, ArxmlElement, ArxmlPackage } from './types.js';

export type ElementPath = string; // e.g. "/EAS/EcuC/EcuCGeneral/ConfigConsistencyRequired"

/** Find a package by its path field (e.g. "/EAS/Com"). Returns null if not found. */
export function packageByPath(doc: ArxmlDocument, path: string): ArxmlPackage | null {
  return doc.packages.find((p) => p.path === path) ?? null;
}

/** Find an element by slash-separated path. Returns null if any segment misses. */
export function findByPath(
  doc: ArxmlDocument,
  elementPath: string,
): { pkg: ArxmlPackage; element: ArxmlElement } | null {
  const segments = elementPath.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const [pkgName, ...rest] = segments;
  if (pkgName === undefined) return null;
  const pkg = doc.packages.find((p) => p.shortName === pkgName);
  if (!pkg) return null;
  if (rest.length === 0) return null;
  let cursor: ArxmlElement | undefined = pkg.elements.find((e) => shortNameOf(e) === rest[0]);
  for (let i = 1; i < rest.length && cursor; i++) {
    const name = rest[i];
    if (name === undefined) return null;
    if (cursor.kind === 'module' || cursor.kind === 'container') {
      cursor = cursor.children.find((c) => shortNameOf(c) === name);
    } else {
      return null;
    }
  }
  if (!cursor) return null;
  return { pkg, element: cursor };
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
    if (JSON.stringify(a[ka[i] as string]) !== JSON.stringify(b[kb[i] as string])) return false;
  }
  return true;
}

function shortNameOf(e: ArxmlElement): string {
  return e.kind === 'reference' ? (e.shortName ?? e.value) : e.shortName;
}