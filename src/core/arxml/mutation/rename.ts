import { findByPath } from '../../arxml/path.js';
import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlPackage,
  ArxmlReference,
  Result,
  ParamValue,
} from '../../arxml/types.js';

import { replaceElement } from './tree-ops.js';

export type RenameShortNameError =
  | { readonly kind: 'path-not-found'; readonly path: string }
  | { readonly kind: 'not-container'; readonly path: string }
  | { readonly kind: 'empty-short-name' }
  | { readonly kind: 'invalid-short-name'; readonly shortName: string }
  | { readonly kind: 'sibling-name-conflict'; readonly shortName: string };

/** Conservative AUTOSAR-style identifier used by ECUC SHORT-NAMEs. */
const SHORT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Validate an ECUC container instance rename without mutating the document.
 *
 * This validates only the instance identity. BSWMD compatibility is not a
 * rename concern because the container's `DEFINITION-REF` remains unchanged.
 */
export function validateContainerRename(
  doc: ArxmlDocument,
  containerPath: string,
  newShortName: string,
): RenameShortNameError | null {
  const located = findByPath(doc, containerPath);
  if (located === null) return { kind: 'path-not-found', path: containerPath };
  if (located.element.kind !== 'container') {
    return { kind: 'not-container', path: containerPath };
  }
  if (newShortName.length === 0) return { kind: 'empty-short-name' };
  if (!SHORT_NAME_PATTERN.test(newShortName)) {
    return { kind: 'invalid-short-name', shortName: newShortName };
  }

  const segments = containerPath.split('/').filter(Boolean);
  const parentPath = `/${segments.slice(0, -1).join('/')}`;
  const parent = findByPath(doc, parentPath)?.element;
  if (parent?.kind !== 'container' && parent?.kind !== 'module') return null;

  const conflict = parent.children.some(
    (child): child is ArxmlContainer =>
      child.kind === 'container' && child !== located.element && child.shortName === newShortName,
  );
  return conflict ? { kind: 'sibling-name-conflict', shortName: newShortName } : null;
}

export interface RenameContainerResult {
  readonly doc: ArxmlDocument;
  readonly oldPath: string;
  readonly newPath: string;
  readonly rewrittenReferenceCount: number;
}

/**
 * Rename an ECUC container value instance in one transaction.
 *
 * `DEFINITION-REF` intentionally remains unchanged: it identifies the BSWMD
 * definition, while `SHORT-NAME` identifies this value instance. Inbound
 * reference parameter values that target the old instance path are rewritten
 * to the new path in the same returned document.
 */
export function renameContainer(
  doc: ArxmlDocument,
  containerPath: string,
  newShortName: string,
): Result<RenameContainerResult, RenameShortNameError> {
  const validationError = validateContainerRename(doc, containerPath, newShortName);
  if (validationError !== null) return { ok: false, error: validationError };

  const located = findByPath(doc, containerPath);
  if (located === null || located.element.kind !== 'container') {
    return { ok: false, error: { kind: 'path-not-found', path: containerPath } };
  }
  const target = located.element;
  if (target.shortName === newShortName) {
    return {
      ok: true,
      value: { doc, oldPath: containerPath, newPath: containerPath, rewrittenReferenceCount: 0 },
    };
  }

  const renamedDoc = replaceElement(doc, located.pkg, target, {
    ...target,
    shortName: newShortName,
  });
  const segments = containerPath.split('/').filter(Boolean);
  segments[segments.length - 1] = newShortName;
  const newPath = `/${segments.join('/')}`;
  const rewrittenReferenceCount = countReferenceRewrites(renamedDoc, containerPath, newPath);
  const nextDoc =
    rewrittenReferenceCount === 0
      ? renamedDoc
      : rewriteReferenceValues(renamedDoc, containerPath, newPath);

  return {
    ok: true,
    value: {
      doc: nextDoc,
      oldPath: containerPath,
      newPath,
      rewrittenReferenceCount,
    },
  };
}

function countReferenceRewrites(doc: ArxmlDocument, oldPath: string, newPath: string): number {
  let count = 0;
  const visitElement = (element: ArxmlElement): void => {
    if (element.kind === 'container' || element.kind === 'module') {
      for (const value of Object.values(element.params)) {
        if (value.type === 'reference' && shouldRewriteReference(value.value, oldPath)) count += 1;
      }
      for (const child of element.children) visitElement(child);
      return;
    }
    if (element.kind === 'reference' && shouldRewriteReference(element.value, oldPath)) count += 1;
  };
  const visitPackage = (pkg: ArxmlPackage): void => {
    for (const element of pkg.elements) visitElement(element);
    for (const nested of pkg.packages ?? []) visitPackage(nested);
  };
  for (const pkg of doc.packages) visitPackage(pkg);
  void newPath;
  return count;
}

function rewriteReferenceValues(
  doc: ArxmlDocument,
  oldPath: string,
  newPath: string,
): ArxmlDocument {
  const mapElement = (element: ArxmlElement): ArxmlElement => {
    if (element.kind === 'container' || element.kind === 'module') {
      let paramsChanged = false;
      const params = Object.fromEntries(
        Object.entries(element.params).map(([key, value]) => {
          if (value.type !== 'reference' || !shouldRewriteReference(value.value, oldPath)) {
            return [key, value];
          }
          paramsChanged = true;
          return [key, rewriteReferenceParam(value, oldPath, newPath)];
        }),
      );
      const children = element.children.map(mapElement);
      const childrenChanged = children.some((child, index) => child !== element.children[index]);
      if (!paramsChanged && !childrenChanged) return element;
      return { ...element, params, children };
    }
    if (element.kind === 'reference' && shouldRewriteReference(element.value, oldPath)) {
      const reference: ArxmlReference = {
        ...element,
        value: replaceReferencePath(element.value, oldPath, newPath),
      };
      return reference;
    }
    return element;
  };
  const mapPackage = (pkg: ArxmlPackage): ArxmlPackage => {
    const elements = pkg.elements.map(mapElement);
    const packages = pkg.packages?.map(mapPackage);
    const elementsChanged = elements.some((element, index) => element !== pkg.elements[index]);
    const packagesChanged = packages !== undefined && packages !== pkg.packages;
    if (!elementsChanged && !packagesChanged) return pkg;
    return { ...pkg, elements, ...(packages !== undefined ? { packages } : {}) };
  };
  const packages = doc.packages.map(mapPackage);
  if (packages.every((pkg, index) => pkg === doc.packages[index])) return doc;
  return { ...doc, packages };
}

function rewriteReferenceParam(
  value: Extract<ParamValue, { type: 'reference' }>,
  oldPath: string,
  newPath: string,
): Extract<ParamValue, { type: 'reference' }> {
  return { ...value, value: replaceReferencePath(value.value, oldPath, newPath) };
}

function shouldRewriteReference(value: string, oldPath: string): boolean {
  return value === oldPath || value.startsWith(oldPath + '/') || endsWithSegment(value, oldPath);
}

function endsWithSegment(value: string, targetPath: string): boolean {
  if (!value.endsWith(targetPath)) return false;
  return value.charCodeAt(value.length - targetPath.length - 1) === 47;
}

function replaceReferencePath(value: string, oldPath: string, newPath: string): string {
  if (value === oldPath) return newPath;
  if (value.startsWith(oldPath + '/')) return newPath + value.slice(oldPath.length);
  if (!endsWithSegment(value, oldPath)) return value;
  return value.slice(0, value.length - oldPath.length) + newPath;
}
