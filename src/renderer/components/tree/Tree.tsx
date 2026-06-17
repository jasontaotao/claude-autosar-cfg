// Tree component: renders an ArxmlDocument as an accessible ARIA tree.
// The store is passed in as a prop (ArxmlStoreApi) so this file does not
// import from `useArxmlStore` directly — that allows parallel work in
// Branch A to land the store without touching this file. The store
// surface used here is: { doc, selectedPath, select(path) }.
//
// Sprint 11 Phase 1 (Option A) i18n: the empty-state hint and aria-label
// are localisable. `locale` is read from the store via a subscribe call
// so the component stays store-agnostic (matches the existing pattern
// used for doc + selectedPath).

import { useEffect, useState } from 'react';

import type { ArxmlDocument, ArxmlElement, ArxmlPackage } from '@core/arxml/types.js';
import { t } from '@shared/i18n';
import type { Locale } from '@shared/i18n';

import { TreeNode } from './TreeNode.js';

export interface ArxmlStoreSlice {
  // Sprint 13 Stage 3.5 — Tree reads `displayDoc` (the synthesised
  // virtual ArxmlDocument in combined mode, or the active `doc` in
  // single mode). `doc` is still on the slice for back-compat with
  // older test fixtures and the optional `api.getState().doc` access
  // pattern, but `displayDoc` is the source of truth for rendering.
  readonly doc: ArxmlDocument | null;
  readonly displayDoc: ArxmlDocument | null;
  readonly selectedPath: string | null;
  readonly select: (path: string) => void;
  readonly locale: Locale;
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
  // Sprint 13 Stage 3.5 — use `displayDoc` so the combined view is
  // visible automatically. Tests / single-mode callers that don't
  // populate `displayDoc` fall back to `doc` so the existing
  // baseline is preserved.
  const initialDisplay = store.getState().displayDoc ?? store.getState().doc;
  const [doc, setDoc] = useState<ArxmlDocument | null>(initialDisplay);
  const [selectedPath, setSelectedPath] = useState<string | null>(store.getState().selectedPath);
  const [locale, setLocale] = useState<Locale>(store.getState().locale);
  useEffect(() => {
    return store.subscribe(() => {
      const s = store.getState();
      setDoc(s.displayDoc ?? s.doc);
      setSelectedPath(s.selectedPath);
      setLocale(s.locale);
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
        {/* Sprint 11 Phase 1 (Option A) — tree-specific empty hint so the
            wording matches the action button name (Open ARXML) without
            having to alias arxmlPanel.empty. */}
        {t(locale, 'tree.emptyHint')}
      </aside>
    );
  }

  return (
    <aside
      className="tree"
      role="tree"
      aria-label={t(locale, 'tree.elementAria', { kind: 'ARXML', name: 'structure' })}
      data-testid="tree-root"
    >
      {doc.packages.map((pkg: ArxmlPackage) =>
        renderPackage(pkg, 0, expanded, toggle, selectedPath, store),
      )}
    </aside>
  );
}

/**
 * Render a single ArxmlPackage as a TreeNode, recursively descending into
 * sub-packages. Mirrors the call shape `renderChildren` uses for
 * `ArxmlElement` children so the two iterators share the same toggle/select
 * state propagation.
 *
 * `isLeaf` is `true` only when the package has no elements AND no
 * sub-packages — i.e. a true empty package. Sprint 9 #12 added recursive
 * `<AR-PACKAGES>` support to the parser; this renderer closes the matching
 * UI gap (EB tresos BSWMD files wrap content in an outer
 * `AUTOSAR > EcucDefs > <module-def>` shape that the previous flat
 * `doc.packages.map` did not traverse).
 */
function renderPackage(
  pkg: ArxmlPackage,
  depth: number,
  expanded: Set<string>,
  toggle: (p: string) => void,
  selectedPath: string | null,
  store: ArxmlStoreApi,
): JSX.Element {
  const hasElements = pkg.elements.length > 0;
  const hasSubPackages = pkg.packages !== undefined && pkg.packages.length > 0;
  const isLeaf = !hasElements && !hasSubPackages;
  return (
    <TreeNode
      key={pkg.path}
      label={pkg.shortName}
      subtitle="package"
      path={pkg.path}
      depth={depth}
      isLeaf={isLeaf}
      isExpanded={expanded.has(pkg.path)}
      isSelected={selectedPath === pkg.path}
      onToggle={toggle}
      onSelect={(p) => store.getState().select(p)}
    >
      {hasSubPackages &&
        pkg.packages!.map((sp) =>
          renderPackage(sp, depth + 1, expanded, toggle, selectedPath, store),
        )}
      {hasElements &&
        renderChildren(pkg.elements, pkg.path, depth + 1, expanded, toggle, selectedPath, store)}
    </TreeNode>
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
        kind={el.kind}
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
