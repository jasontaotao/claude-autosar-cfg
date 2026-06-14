// Tree component: renders an ArxmlDocument as an accessible ARIA tree.
// The store is passed in as a prop (ArxmlStoreApi) so this file does not
// import from `useArxmlStore` directly — that allows parallel work in
// Branch A to land the store without touching this file. The store
// surface used here is: { doc, selectedPath, select(path) }.

import { useEffect, useState } from 'react';

import type { ArxmlDocument, ArxmlElement, ArxmlPackage } from '@core/arxml/types.js';

import { TreeNode } from './TreeNode.js';

export interface ArxmlStoreSlice {
  readonly doc: ArxmlDocument | null;
  readonly selectedPath: string | null;
  readonly select: (path: string) => void;
}

/** Minimal store contract — matches the slice this component reads. */
export interface ArxmlStoreApi {
  getState: () => ArxmlStoreSlice;
  subscribe: (listener: () => void) => () => void;
}

interface TreeProps {
  store: ArxmlStoreApi;
}

/** Public component — top-level container. */
export function Tree({ store }: TreeProps): JSX.Element {
  // We do NOT use the store via a React hook to avoid coupling the
  // file to a specific store implementation (Zustand, custom, etc.).
  // Instead, subscribe via store.subscribe and store local mirror.
  const [doc, setDoc] = useState<ArxmlDocument | null>(store.getState().doc);
  const [selectedPath, setSelectedPath] = useState<string | null>(store.getState().selectedPath);
  useEffect(() => {
    return store.subscribe(() => {
      const s = store.getState();
      setDoc(s.doc);
      setSelectedPath(s.selectedPath);
    });
  }, [store]);

  // Expansion set — start empty so only top-level packages render.
  // This keeps the DOM small for large docs (e.g. Com_Com has 67 IPdu).
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggle = (path: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  if (doc === null) {
    return (
      <aside className="tree empty" data-testid="tree-empty">
        No file loaded. Click &quot;Open ARXML&quot; to start.
      </aside>
    );
  }

  return (
    <aside className="tree" role="tree" aria-label="ARXML structure" data-testid="tree-root">
      {doc.packages.map((pkg: ArxmlPackage) => (
        <TreeNode
          key={pkg.path}
          label={pkg.shortName}
          subtitle="package"
          path={pkg.path}
          depth={0}
          isLeaf={pkg.elements.length === 0}
          isExpanded={expanded.has(pkg.path)}
          isSelected={selectedPath === pkg.path}
          onToggle={toggle}
          onSelect={(p) => store.getState().select(p)}
        >
          {renderChildren(pkg.elements, pkg.path, 1, expanded, toggle, selectedPath, store)}
        </TreeNode>
      ))}
    </aside>
  );
}

/**
 * Recursive renderer for child elements. Mirrors the call shape TreeNode
 * uses, so we get a single source of truth for child iteration.
 */
function renderChildren(
  elements: readonly ArxmlElement[],
  parentPath: string,
  depth: number,
  expanded: Set<string>,
  toggle: (p: string) => void,
  selectedPath: string | null,
  store: ArxmlStoreApi,
): JSX.Element[] {
  return elements.map((el) => {
    const childPath = `${parentPath}/${shortNameOf(el)}`;
    const isLeaf = el.kind === 'reference';
    return (
      <TreeNode
        key={childPath}
        label={shortNameOf(el)}
        subtitle={el.kind}
        path={childPath}
        depth={depth}
        isLeaf={isLeaf}
        isExpanded={expanded.has(childPath)}
        isSelected={selectedPath === childPath}
        onToggle={toggle}
        onSelect={(p) => store.getState().select(p)}
      >
        {!isLeaf &&
          renderChildren(el.children, childPath, depth + 1, expanded, toggle, selectedPath, store)}
      </TreeNode>
    );
  });
}

function shortNameOf(e: ArxmlElement): string {
  return e.kind === 'reference' ? (e.shortName ?? e.value) : e.shortName;
}
