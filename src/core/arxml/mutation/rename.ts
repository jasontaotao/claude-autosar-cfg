import { findByPath } from '../../arxml/path.js';
import type { ArxmlContainer, ArxmlDocument, Result } from '../../arxml/types.js';

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

export type RenameContainerResultValue = Result<RenameContainerResult, RenameShortNameError>;
