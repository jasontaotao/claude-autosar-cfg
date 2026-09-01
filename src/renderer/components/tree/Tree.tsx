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

import { Fragment, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import type { ArxmlDocument, ArxmlElement, ArxmlPackage } from '@core/arxml/types.js';
import {
  findContainerDefByDefinitionRef,
  type BswmdDocument,
  type ContainerDef,
} from '@core/project/bswmd.js';
import { t } from '@shared/i18n/index.js';
import type { Locale } from '@shared/i18n/index.js';

import {
  findChildContainerDef,
  resolveModuleAndParentContainer,
} from '../../store/helpers/bswmdLookup.js';

import { CollectionHeader } from './CollectionHeader.js';
import { KindIndicator } from './KindIndicator.js';
import { OptionalAddPlaceholder } from './OptionalAddPlaceholder.js';
import { TreeNode } from './TreeNode.js';
import { groupSiblingsForCollection } from './collections.js';
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
  /** Ephemeral rename event used to preserve local Tree expansion state. */
  readonly lastContainerRename?: {
    readonly id: number;
    readonly from: string;
    readonly to: string;
  };
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
  const lastRenameId = useRef(0);

  useEffect(() => {
    return store.subscribe(() => {
      const s = store.getState();
      setDoc(s.displayDoc ?? s.doc);
      setSelectedPath(s.selectedPath);
      setLocale(s.locale);
      setBswmdSchemas(s.bswmdSchemas ?? []);

      const rename = s.lastContainerRename;
      if (rename !== undefined && rename.id !== lastRenameId.current) {
        lastRenameId.current = rename.id;
        setExpanded((prev) => remapExpandedPaths(prev, rename.from, rename.to));
      }
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
      // v1.48.0 MINOR T2 -- aria-live="polite" + role="status" for
      // first-time screen reader announcement (WCAG 4.1.3). The empty
      // aside is informational, not an alert; role="status" + polite
      // live region is the correct pairing.
      <aside className="tree empty" data-testid="tree-empty" role="status" aria-live="polite">
        {/* Sprint 11 Phase 1 (Option A) — tree-specific empty hint so the
            wording matches the action button name (Open ARXML) without
            having to alias arxmlPanel.empty. */}
        {t(locale, 'tree.emptyHint')}
      </aside>
    );
  }

  return (
    <div className="tree-shell">
      <aside
        className="tree"
        role="tree"
        aria-label={t(locale, 'tree.elementAria', { kind: 'ARXML', name: 'structure' })}
        data-testid="tree-root"
      >
        {doc.packages.flatMap((pkg: ArxmlPackage): JSX.Element[] => {
          // UI abstraction layer — independent of skeleton.ts.
          // `foldVendorPackages` collapses the vendor-prefix AR-PACKAGE
          // chain (e.g. JWQ_CDD_PACK > JWQ_Packet) to a single
          // top-level package and flags it with `isVendorFoldResult:
          // true` to mark the package as fold-synthesised (vs a
          // source-doc package). Tree checks that single flag to
          // decide whether to hoist the contained ECUC module past
          // the vendor wrapper, so users see the module as the tree
          // root. Source packages (legacy /EcuC + EcuC, combined-mode
          // /Can.arxml/EAS + Can, etc.) leave the flag undefined and
          // render normally.
          if (pkg.isVendorFoldResult === true) {
            return renderChildren(
              pkg.elements,
              '',
              0,
              expanded,
              toggle,
              selectedPath,
              store,
              onContextMenu,
              bswmdSchemas,
              locale,
            );
          }
          return [
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
          ];
        })}
      </aside>
      <TreeLegend locale={locale} />
    </div>
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
          // 2026-06-24 — tier 4 nested hoist. The top-level
          // `flatMap` (line 158) already hoists synthesised pkgs at
          // the document root, but when a vendor-folded pkg sits as
          // a NESTED child (e.g. AUTOSAR_R22 > EcucDefs > Adc with
          // EcucDefs collapsed by `foldVendorPackages` tier 4), the
          // nested recursion went through `renderPackage` which
          // created an extra visible treeitem for the synthesised
          // wrapper. Branch on the flag here and route through
          // `renderChildren` with our own path as parentPath so
          // child paths stay consistent with the post-fold shape
          // (e.g. `/AUTOSAR_R22/Adc`).
          sp.isVendorFoldResult === true
            ? renderChildren(
                sp.elements,
                pkg.path,
                depth + 1,
                expanded,
                toggle,
                selectedPath,
                store,
                onContextMenu,
                bswmdSchemas,
                locale,
              )
            : renderPackage(
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
 *
 * Phase P1 T3 — same-shortName collection branch. When a group of
 * siblings (≥2 with the same base shortName, modulo the BSWMD
 * auto-suffix `_<digits>`) exists, render a synthetic
 * `CollectionHeader` row above the real children and gate the
 * matching TreeNodes behind the collection's expanded state
 * (default-collapsed). The collection's expansion key uses the
 * `collection:` prefix so it never collides with a real node path
 * in the existing `expanded` Set.
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
  // Group siblings by definition identity so custom instance names such as
  // `Cell_A` fold into the same collection as `Cell_1` / `Cell_2`.
  const groups = groupSiblingsForCollection(elements);
  // Resolve the BSWMD ContainerDef for every collection group once so the
  // collect threshold (below) and the header loop share the same
  // upperMultiplicity source. Definition identity wins; suffix lookup is
  // only the legacy fallback.
  const groupDefs = new Map<string, ContainerDef | null>();
  for (const [key, group] of groups) {
    const byDefinition =
      group.definitionRef === undefined
        ? null
        : findContainerDefByDefinitionRef(bswmdSchemas, group.definitionRef);
    groupDefs.set(
      key,
      byDefinition !== null
        ? byDefinition.containerDef
        : resolveCollectionChildDef(bswmdSchemas, parentPath, group.label),
    );
  }
  const collectionGroupKeys = new Set<string>();
  for (const [key, group] of groups) {
    const def = groupDefs.get(key);
    if (def === null || def === undefined) continue;
    if (shouldRenderCollectionHeader(group.elements.length, def.upperMultiplicity)) {
      collectionGroupKeys.add(key);
    }
  }
  const collectionKeyByElement = new Map<ArxmlElement, string>();
  for (const [key, group] of groups) {
    for (const element of group.elements) collectionKeyByElement.set(element, key);
  }

  // children of `parentPath`. They are surfaced as indented
  // children of the matching CollectionHeader so the tree visually
  // groups them under the synthetic `×N` row. Siblings outside any
  // collection render exactly as before (no behavior change for
  // users with non-collected siblings). To collapse a collection the
  // user clicks the header's chevron; the toggle adds the
  // `collection:...` key to `expanded` and the realChildren block
  // (below) hides those siblings.
  const realChildren = elements.flatMap((el) => {
    const childPath = `${parentPath}/${shortNameOf(el)}`;
    const groupKey = collectionKeyByElement.get(el);
    // Chevron semantics: a node is expandable only when it has real
    // content or the loaded BSWMD says that missing optional children
    // can be added. This avoids showing a false "expand me" affordance
    // for an empty 1..1 / 0..1 container that has nothing inside.
    const isLeaf = !elementIsExpandable(el, childPath, bswmdSchemas);
    const tooltip = buildElementTooltip(
      el,
      groupKey === undefined ? null : (groupDefs.get(groupKey) ?? null),
      locale,
    );
    const kindLabel = el.kind === 'unknown' ? undefined : t(locale, treeKindLabelKey(el.kind));
    if (groupKey !== undefined && collectionGroupKeys.has(groupKey)) {
      // Sibling belongs to a collection — render it inside the
      // CollectionHeader (not here). The visibility of this
      // rendered-as-header-child sibling is driven by the
      // collection's own expanded state, handled by CollectionHeader.
      return [];
    }
    return [
      <TreeNode
        key={childPath}
        label={shortNameOf(el)}
        kind={el.kind === 'unknown' ? undefined : el.kind}
        kindLabel={kindLabel}
        tooltip={tooltip}
        path={childPath}
        depth={depth}
        isLeaf={isLeaf}
        isExpanded={expanded.has(childPath)}
        isSelected={selectedPath === childPath}
        onToggle={toggle}
        onSelect={(p) => store.getState().select(p)}
        onContextMenu={onContextMenu}
      >
        {(el.kind === 'module' || el.kind === 'container') &&
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
      </TreeNode>,
    ];
  });

  // Phase P1 T3 — collection headers (one per collectible baseName
  // group; see shouldRenderCollectionHeader for the threshold). The
  // header's `onAdd` invokes the existing `addContainer` mutation
  // — `coreAddContainer` produces the auto-suffix `_N` (see
  // src/core/arxml/mutation/container-ops.ts:98-103), so each click
  // adds a new suffixed sibling that will appear inside the
  // collection on next render.
  const collectionHeaders: JSX.Element[] = [];
  for (const [groupKey, group] of groups) {
    const loopDef = groupDefs.get(groupKey);
    if (loopDef === null || loopDef === undefined) continue;
    if (!shouldRenderCollectionHeader(group.elements.length, loopDef.upperMultiplicity)) continue;
    const baseName = group.label;
    const collectionKey = 'collection:' + parentPath + '/' + groupKey;
    // Default-EXPANDED: the user sees the synthetic `×N` header with
    // its real siblings listed underneath. Clicking the header's
    // chevron adds `collectionKey` to the `expanded` Set — at that
    // point `isCollapsed` flips to `true` and the entire branch
    // (header + children) is hidden behind a single `▶` so the
    // user can collapse a long collection out of the way. The
    // earlier `default-collapsed` design hid the children under
    // the header on first paint, which made the group read as
    // empty; expanded-by-default is the spec the user actually
    // wanted (verified against screenshot #11 in session 225).
    const isCollapsed = expanded.has(collectionKey);
    const isExpanded = !isCollapsed;
    const childDef = loopDef;
    // Real siblings inside the collection: render as TreeNodes at
    // `depth + 1` so they indent one level beneath the header. The
    // visibility of the whole group is driven by `isExpanded` —
    // when collapsed the header passes `null` for `children` and
    // the entire branch is omitted from the DOM. When expanded
    // each sibling is a normal TreeNode with its own expand/select/
    // context-menu behavior; the CollectionHeader just owns the
    // visual grouping + `+ 1` add affordance above them.
    const collectionChildren: JSX.Element[] = isExpanded
      ? group.elements.map((el) => {
          const childPath = `${parentPath}/${shortNameOf(el)}`;
          const isLeaf = !elementIsExpandable(el, childPath, bswmdSchemas);
          const tooltip = buildElementTooltip(
            el,
            collectionKeyByElement.get(el) === undefined
              ? null
              : (groupDefs.get(collectionKeyByElement.get(el)!) ?? null),
            locale,
          );
          const kindLabel =
            el.kind === 'unknown' ? undefined : t(locale, treeKindLabelKey(el.kind));
          return (
            <TreeNode
              key={childPath}
              label={shortNameOf(el)}
              kind={el.kind === 'unknown' ? undefined : el.kind}
              kindLabel={kindLabel}
              tooltip={tooltip}
              path={childPath}
              depth={depth + 1}
              isLeaf={isLeaf}
              isExpanded={expanded.has(childPath)}
              isSelected={selectedPath === childPath}
              onToggle={toggle}
              onSelect={(p) => store.getState().select(p)}
              onContextMenu={onContextMenu}
            >
              {(el.kind === 'module' || el.kind === 'container') &&
                renderChildren(
                  el.children,
                  childPath,
                  depth + 2,
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
        })
      : [];
    // The collection header and its real sibling rows are rendered
    // as a pair of siblings in the parent's render output, NOT as
    // children of the CollectionHeader root. Why: the header's root
    // <div> is a flex *row* (chevron / dot / label / +1 must sit on
    // one line). If we nested the real TreeNodes inside that root
    // they would inherit the row flex layout and be painted inline
    // to the right of the header — which is what screenshot #12
    // showed. Instead we keep the header a self-contained flex row
    // and render the sibling rows as a separate block-level element
    // immediately after it, indented one level deeper.
    collectionHeaders.push(
      <Fragment key={collectionKey}>
        <CollectionHeader
          shortName={baseName}
          count={group.elements.length}
          upperMultiplicity={childDef.upperMultiplicity}
          isExpanded={isExpanded}
          onToggle={() => toggle(collectionKey)}
          onAdd={() => {
            store.getState().addContainer?.(parentPath, baseName);
          }}
          depth={depth}
        />
        {isExpanded ? (
          <div className="tree-collection-children" data-testid={`collection-children-${baseName}`}>
            {collectionChildren}
          </div>
        ) : null}
      </Fragment>,
    );
  }

  // S4 (v1.7.2) — append the optional-add placeholders after the
  // real children. The helper resolves the BSWMD-side parent
  // container (if any) by walking the value-side parent path. When
  // the active doc is not BSWMD-backed or the parent container is
  // not declared in the schema, the helper returns `[]` and we just
  // render the real children as before.
  const missing = findMissingOptionalSiblings(bswmdSchemas, parentPath, elements);

  if (missing.length === 0 && collectionHeaders.length === 0) return realChildren;

  const addLabel =
    missing.length > 0 ? t(locale, 'tree.addOptionalContainer', { name: '' }).trim() : '';
  const hintLabel = missing.length > 0 ? t(locale, 'tree.optionalContainerHint') : '';
  const placeholders = missing.map(({ cd }) => {
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

  return [...collectionHeaders, ...realChildren, ...placeholders];
}

/** Sticky, compact legend for the localized kind icons. */
function treeKindLabelKey(
  kind: 'module' | 'container' | 'reference' | 'collection',
): 'tree.kind.module' | 'tree.kind.container' | 'tree.kind.reference' | 'tree.kind.collection' {
  switch (kind) {
    case 'module':
      return 'tree.kind.module';
    case 'container':
      return 'tree.kind.container';
    case 'reference':
      return 'tree.kind.reference';
    case 'collection':
      return 'tree.kind.collection';
  }
}

function TreeLegend({ locale }: { readonly locale: Locale }): JSX.Element {
  const kinds = ['module', 'container', 'reference', 'collection'] as const;
  return (
    <footer className="tree-legend" aria-label={t(locale, 'tree.legend.label')}>
      {kinds.map((kind) => (
        <span key={kind} className="tree-legend-item">
          <KindIndicator kind={kind} label={t(locale, treeKindLabelKey(kind))} />
          <span>{t(locale, treeKindLabelKey(kind))}</span>
        </span>
      ))}
    </footer>
  );
}

/**
 * Remap Tree-local expansion keys after a container instance rename.
 * Collection rows use a collection:<path> prefix, so only the embedded
 * path is rewritten; ordinary paths are only replaced on an exact or
 * strict descendant match. This avoids accidentally rewriting /Parent2.
 */
function remapExpandedPaths(
  expanded: ReadonlySet<string>,
  oldPath: string,
  newPath: string,
): Set<string> {
  const remapPath = (path: string): string => {
    if (path === oldPath) return newPath;
    if (path.startsWith(oldPath + '/')) return newPath + path.slice(oldPath.length);
    return path;
  };

  return new Set(
    [...expanded].map((key) =>
      key.startsWith('collection:')
        ? 'collection:' + remapPath(key.slice('collection:'.length))
        : remapPath(key),
    ),
  );
}

/**
 * Decide whether a real ARXML node has anything to reveal when expanded.
 * Unknowns and references stay leaves. A module/container is expandable
 * when it has children, or when the loaded BSWMD can still surface missing
 * optional add placeholders below it.
 */
function elementIsExpandable(
  element: ArxmlElement,
  path: string,
  bswmdSchemas: readonly BswmdDocument[],
): boolean {
  if (element.kind === 'module' || element.kind === 'container') {
    if (element.children.length > 0) return true;
    return findMissingOptionalSiblings(bswmdSchemas, path, element.children).length > 0;
  }
  return false;
}

/** Build a compact, localized schema tooltip for a tree row. */
function buildElementTooltip(
  element: ArxmlElement,
  childDef: ContainerDef | null,
  locale: Locale,
): string {
  if (element.kind === 'reference') return t(locale, 'tree.kind.reference');
  if (element.kind === 'unknown') return element.tagName;

  const lines: string[] = [t(locale, treeKindLabelKey(element.kind))];
  const definitionRef = element.kind === 'container' ? element.definitionRef : undefined;
  if (definitionRef !== undefined) {
    lines.push(t(locale, 'tree.tooltip.definition', { value: definitionRef }));
  }
  if (childDef !== null) {
    const upper = childDef.upperMultiplicity === 'infinite' ? '*' : childDef.upperMultiplicity;
    lines.push(
      t(locale, 'tree.tooltip.multiplicity', { value: childDef.lowerMultiplicity + '..' + upper }),
    );
  }
  if (element.kind === 'container') {
    lines.push(t(locale, 'tree.tooltip.children', { count: element.children.length }));
  }
  return lines.join('\n');
}
/**
 * Collect threshold predicate for synthetic CollectionHeader rows.
 *
 * A baseName group renders a CollectionHeader when:
 *   - it has ≥2 same-baseName siblings (the original Phase P1 T3 rule), OR
 *   - it has exactly 1 sibling whose BSWMD upperMultiplicity is
 *     'infinite' (0..* / 1..*).
 *
 * The single-instance unbounded rule fixes the count=1 dead zone where
 * the optional-add placeholder (S4) disappears once the first instance
 * exists, but the collection header's `+ 1` affordance only appeared
 * at count ≥2 — leaving no way to add a second instance from the tree.
 * Finite upper bounds keep the ≥2 threshold: a single 0..1 container is
 * already at max, so a header row would only add noise.
 */
function shouldRenderCollectionHeader(
  count: number,
  upperMultiplicity: number | 'infinite',
): boolean {
  if (count >= 2) return true;
  return upperMultiplicity === 'infinite' && count >= 1;
}

/**
 * Phase P1 T3 — resolve the BSWMD `ContainerDef` for a collection's
 * child shortName under the given value-side parent path. Re-uses
 * the `resolveModuleAndParentContainer` + `findChildContainerDef`
 * pair that `addContainer` uses so the lookup is identical to the
 * mutation's BSWMD-side check. Returns `null` when no BSWMD is
 * loaded, the module is missing, or the child isn't declared on
 * the parent (caller treats `null` as "skip the collection header").
 */
function resolveCollectionChildDef(
  bswmd: readonly BswmdDocument[],
  parentPath: string,
  shortName: string,
): ContainerDef | null {
  const lookup = resolveModuleAndParentContainer(bswmd, parentPath);
  if (lookup === null) return null;
  return findChildContainerDef(lookup.moduleDef, lookup.parentContainerDef, shortName);
}

function shortNameOf(e: ArxmlElement): string {
  if (e.kind === 'reference') return e.shortName ?? e.value;
  // v1.4.0 trust sprint — 17c. Unknown vendor extensions have no
  // SHORT-NAME; surface the captured tagName so the user sees the
  // element in the tree.
  if (e.kind === 'unknown') return e.tagName;
  return e.shortName;
}
