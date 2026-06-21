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
//
// S4 (v1.7.2) — optional container visibility. Tree now subscribes to
// `bswmdSchemas` and, for every expanded container, looks up the
// BSWMD-side `ContainerDef[]` whose `lowerMultiplicity === 0` and whose
// shortName is missing from the value tree. Each missing child becomes
// an `OptionalAddPlaceholder` sibling under the parent, with a `+`
// button that invokes the existing `addContainer` mutation. No new
// mutation surface — `addContainer(parentPath, shortName)` was shipped
// in v1.5.1 PR(4) and is reused as-is.

import { useEffect, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import type { ArxmlDocument, ArxmlElement, ArxmlPackage } from '@core/arxml/types.js';
import type { BswmdDocument } from '@core/project/bswmd.js';
import { t } from '@shared/i18n';
import type { Locale } from '@shared/i18n';

import { OptionalAddPlaceholder } from './OptionalAddPlaceholder.js';
import { TreeNode } from './TreeNode.js';
import { findMissingOptionalSiblings } from './optionalContainers.js';

// Sprint 15 / Phase 3.4 — re-export the TreeNode kind so consumers
// of the Tree component (App.tsx in Sprint 15 wiring) don't need a
// separate TreeNode import just for the onContextMenu callback type.
// `TreeKind` is declared inside TreeNode.tsx as a non-exported type
// alias; mirror it here for the public type surface.
type TreeKind = 'module' | 'container' | 'reference' | 'bswmd';

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
  // S4 (v1.7.2) — Tree reads `bswmdSchemas` to compute the missing
  // optional siblings per expanded container. Backed by
  // `useArxmlStore.bswmdSchemas` (the same field that powers the
  // BswmdPickerDialog and the validator).
  readonly bswmdSchemas: readonly BswmdDocument[];
  /**
   * S4 (v1.7.2) — invoke the existing `addContainer` mutation.
   * Wired by the host (App.tsx) to `useArxmlStore.getState().addContainer`
   * (or to a `vi.fn()` in tests). When `undefined`, the `+` button
   * silently no-ops (a defensive guard so the Tree still mounts
   * cleanly with the legacy single-mode `ArxmlStoreApi` slice).
   */
  readonly addContainer?: (parentPath: string, shortName: string) => void;
}

/** Minimal store contract — matches the slice this component reads. */
export interface ArxmlStoreApi {
  getState: () => ArxmlStoreSlice;
  subscribe: (listener: () => void) => () => void;
}

interface TreeProps {
  store: ArxmlStoreApi;
  // Sprint 15 / Phase 3.4 — right-click handler. The host (App.tsx
  // in Sprint 15 wiring) wires this to the global ContextMenu.open()
  // so the user can right-click any tree node to add/delete.
  // Sprint A X2 — added the 3rd `e: ReactMouseEvent` arg so the
  // host can read clientX / clientY without re-binding. Existing
  // two-arg callers keep working because the parameter is unused
  // when the host doesn't need it.
  readonly onContextMenu?: (path: string, kind: TreeKind, e: ReactMouseEvent) => void;
}

/** Public component — top-level container. */
export function Tree({ store, onContextMenu }: TreeProps): JSX.Element {
  // We do NOT use the store via a React hook to avoid coupling the
  // file to a specific store implementation (Zustand, custom, etc.).
  // Instead, subscribe via store.subscribe and store local mirror.
  // Sprint 13 Stage 3.5 — use `displayDoc` so the combined view is
  // visible automatically. Tests / single-mode callers that don't
  // populate `displayDoc` fall back to `doc` so the existing
  // baseline is preserved.
  const initialState = store.getState();
  const initialDisplay = initialState.displayDoc ?? initialState.doc;
  const [doc, setDoc] = useState<ArxmlDocument | null>(initialDisplay);
  const [selectedPath, setSelectedPath] = useState<string | null>(initialState.selectedPath);
  const [locale, setLocale] = useState<Locale>(initialState.locale);
  // S4 (v1.7.2) — mirror `bswmdSchemas` so a BSWMD add/remove flips
  // the placeholder set. The slice field is optional on legacy
  // mocks; fall back to `[]` so `findMissingOptionalSiblings` does
  // not have to deal with `undefined`.
  const [bswmdSchemas, setBswmdSchemas] = useState<readonly BswmdDocument[]>(
    initialState.bswmdSchemas ?? [],
  );
  useEffect(() => {
    return store.subscribe(() => {
      const s = store.getState();
      setDoc(s.displayDoc ?? s.doc);
      setSelectedPath(s.selectedPath);
      setLocale(s.locale);
      setBswmdSchemas(s.bswmdSchemas ?? []);
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
        renderPackage(
          pkg,
          0,
          expanded,
          toggle,
          selectedPath,
          store,
          onContextMenu,
          bswmdSchemas,
          locale,
        ),
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
  onContextMenu: ((path: string, kind: TreeKind, e: ReactMouseEvent) => void) | undefined,
  bswmdSchemas: readonly BswmdDocument[],
  locale: Locale,
): JSX.Element {
  const hasElements = pkg.elements.length > 0;
  const hasSubPackages = pkg.packages !== undefined && pkg.packages.length > 0;
  const isLeaf = !hasElements && !hasSubPackages;

  // S4 (v1.7.2) — optional placeholders. For a top-level package
  // there is no BSWMD-side parent container (the package IS the
  // root), so we only render real sub-packages and real elements;
  // placeholders for a top-level module/element fall outside the
  // current S4 scope (S4 is "optional sub-containers of an existing
  // container").
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
      onContextMenu={onContextMenu}
    >
      {hasSubPackages &&
        pkg.packages!.map((sp) =>
          renderPackage(
            sp,
            depth + 1,
            expanded,
            toggle,
            selectedPath,
            store,
            onContextMenu,
            bswmdSchemas,
            locale,
          ),
        )}
      {hasElements &&
        renderChildren(
          pkg.elements,
          pkg.path,
          depth + 1,
          expanded,
          toggle,
          selectedPath,
          store,
          onContextMenu,
          bswmdSchemas,
          locale,
        )}
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
  onContextMenu: ((path: string, kind: TreeKind, e: ReactMouseEvent) => void) | undefined,
  bswmdSchemas: readonly BswmdDocument[],
  locale: Locale,
): JSX.Element[] {
  const realChildren = elements.map((el) => {
    const childPath = `${parentPath}/${shortNameOf(el)}`;
    // v1.4.0 trust sprint — 17c. Unknown vendor extensions and
    // references are both leaves with no children to recurse into.
    const isLeaf = el.kind === 'reference' || el.kind === 'unknown';
    return (
      <TreeNode
        key={childPath}
        label={shortNameOf(el)}
        kind={el.kind === 'unknown' ? undefined : el.kind}
        path={childPath}
        depth={depth}
        isLeaf={isLeaf}
        isExpanded={expanded.has(childPath)}
        isSelected={selectedPath === childPath}
        onToggle={toggle}
        onSelect={(p) => store.getState().select(p)}
        onContextMenu={onContextMenu}
      >
        {!isLeaf &&
          renderChildren(
            el.children,
            childPath,
            depth + 1,
            expanded,
            toggle,
            selectedPath,
            store,
            onContextMenu,
            bswmdSchemas,
            locale,
          )}
      </TreeNode>
    );
  });

  // S4 (v1.7.2) — append the optional-add placeholders after the
  // real children. The helper resolves the BSWMD-side parent
  // container (if any) by walking the value-side parent path. When
  // the active doc is not BSWMD-backed or the parent container is
  // not declared in the schema, the helper returns `[]` and we just
  // render the real children as before.
  const missing = findMissingOptionalSiblings(bswmdSchemas, parentPath, elements);

  if (missing.length === 0) return realChildren;

  const addLabel = t(locale, 'tree.addOptionalContainer', { name: '' }).trim();
  const hintLabel = t(locale, 'tree.optionalContainerHint');
  const placeholders = missing.map((cd) => {
    const parentAbsPath = parentPath; // for `addContainer` we need the value-side path
    return (
      <OptionalAddPlaceholder
        key={`optional-${parentAbsPath}/${cd.shortName}`}
        label={cd.shortName}
        description={cd.desc}
        depth={depth}
        onAdd={() => {
          // Defensive guard: the legacy single-mode mock slice may
          // not expose `addContainer`. Skip the dispatch rather than
          // throw so the placeholder remains visible (the user
          // gets the missing-affordance signal but the click is a
          // no-op until the host wires the real mutation).
          store.getState().addContainer?.(parentAbsPath, cd.shortName);
        }}
        addLabel={addLabel}
        hintLabel={hintLabel}
        testKey={`${parentPath.replace(/[^A-Za-z0-9]/g, '_')}_${cd.shortName}`}
      />
    );
  });

  return [...realChildren, ...placeholders];
}

function shortNameOf(e: ArxmlElement): string {
  if (e.kind === 'reference') return e.shortName ?? e.value;
  // v1.4.0 trust sprint — 17c. Unknown vendor extensions have no
  // SHORT-NAME; surface the captured tagName so the user sees the
  // element in the tree.
  if (e.kind === 'unknown') return e.tagName;
  return e.shortName;
}
