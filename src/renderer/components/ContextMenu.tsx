// ContextMenu — Sprint 15 / Phase 3.1.
//
// Portal-based right-click menu shown on TreeNode right-click. The host
// component (`ContextMenuRoot`) is mounted once at the app root and
// reads a module-level `state` cell. `openContextMenu(target, x, y)`
// flips the cell, which triggers a re-render of the portal at the given
// viewport coordinates.
//
// The host wires the result to a callback (`onAction`) that the Phase
// 2 store actions consume. The callback shape is the public API the
// rest of the app uses; the `ContextMenu` itself never reaches into
// the store, which keeps this component decoupled from the store
// implementation landing in parallel.
//
// A11y: role="menu" on the ul, role="menuitem" + tabIndex=0 on each li.
// ArrowDown / ArrowUp move focus; Enter / Space activate; Esc closes.
// Outside click (mousedown on document body that misses the menu) closes.
//
// Boundary detection: if x would push the menu past the right viewport
// edge, the menu flips to `innerWidth - width`. y is similarly clamped
// against the bottom edge. The flip is computed once at open time using
// a stable estimate of the menu's rendered width/height (see
// ESTIMATED_MENU_W / ESTIMATED_MENU_H below).

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { BswmdDocument } from '@core/project/bswmd.js';
import { t } from '@shared/i18n/index.js';
import type { Locale } from '@shared/i18n/index.js';

import { useBswmdHasDcm } from '../hooks/useBswmdHasDcm.js';
import { useArxmlStore } from '../store/useArxmlStore.js';

import './ContextMenu.css';

// ---------------------------------------------------------------------------
// Public API — actions emitted by the menu
// ---------------------------------------------------------------------------

/** The "target" of a right-click: the path of the TreeNode the user
 *  clicked, its discriminator kind, and its shortName (used in the
 *  delete label so the user can confirm what they're about to remove).
 *  Sprint 17 P3 T3.3 adds `'bswmd'` for the BSWMD row right-click
 *  (ProjectPanel `<li>` + Tree module-kind). The kind discriminator
 *  is widened here so the P3 wiring (T3.1 + T3.2) compiles against
 *  the same union before T3.3 ships the matching menu item.
 *  Phase P2 T2 adds `'collection'` for CollectionHeader right-click
 *  (Phase P1 multi-instance tree). The collection kind surfaces
 *  duplicate / sort / bulk-delete operations only — no "Add *" or
 *  generic delete (those belong to the underlying Container target). */
export type ContextMenuTarget = {
  readonly path: string;
  readonly kind: 'module' | 'container' | 'reference' | 'bswmd' | 'collection';
  readonly shortName: string;
  /**
   * Sprint A+ — when the right-click target is a module-kind node
   * whose source BSWMD is loaded, this carries the post-fold module
   * path so the menu can offer "Delete ECUC module" alongside
   * "Remove BSWMD". Undefined for non-module targets.
   */
  readonly modulePath?: string;
};

/** Action union — one of the operations the user can fire from the
 *  menu. Phase 2 wires this to `useArxmlStore` actions (or to the
 *  picker dialog state) in the host component (App.tsx), not here.
 *  Sprint 17 P3 T3.3 adds `'remove-module'` — fired when the user
 *  right-clicks a BSWMD row (ProjectPanel <li>) or a module-kind
 *  tree node. App.tsx routes this to
 *  `useProjectActions.removeBswmdWithFullFlow(path)`. */
export type ContextMenuAction =
  | { readonly type: 'add-container'; readonly path: string }
  | { readonly type: 'add-parameter'; readonly path: string }
  | { readonly type: 'add-reference'; readonly path: string }
  | { readonly type: 'delete-container'; readonly path: string; readonly name: string }
  | { readonly type: 'rename-container'; readonly path: string; readonly name: string }
  | { readonly type: 'delete-reference'; readonly path: string }
  | { readonly type: 'remove-module'; readonly path: string }
  | { readonly type: 'delete-module'; readonly path: string; readonly name: string }
  // v1.31.0 PATCH T6 — "Generate Dcm Config" entry. Surfaced in the
  // BSWMD right-click menu when target.path matches the Dcm BSWMD
  // regex. The host (App.tsx) routes this to useDcmConfigLauncher.
  | { readonly type: 'generate-dcm-config'; readonly path: string }
  // Phase P2 T2 — CollectionHeader multi-instance operations. Fired
  // when the user right-clicks a CollectionHeader (collection kind).
  // The host (Tree.tsx) routes these to the mutation slice:
  //   - duplicate-children → duplicateContainer(path, shortName)
  //   - sort-children      → sortSiblings(path)
  //   - bulk-delete-children → bulkDelete(path, shortName) AFTER a
  //     user confirmation dialog (call site owns the confirm UX;
  //     ContextMenu is intentionally confirm-free).
  | { readonly type: 'duplicate-children'; readonly path: string; readonly shortName: string }
  | { readonly type: 'sort-children'; readonly path: string }
  | {
      readonly type: 'bulk-delete-children';
      readonly path: string;
      readonly shortName: string;
    };

// ---------------------------------------------------------------------------
// Module-level state cell — the menu's "open or closed" + position.
// Mirrors the pattern used by ConfirmDialog and PromptDialog, but the
// host doesn't expose a Promise here (the action is fire-and-forget).
// ---------------------------------------------------------------------------

interface ContextMenuState {
  readonly target: ContextMenuTarget;
  readonly x: number;
  readonly y: number;
}

let state: ContextMenuState | null = null;
let externalSetState: ((s: ContextMenuState | null) => void) | null = null;

/** Open the menu at the given viewport coordinates. The host component
 *  must have mounted (so the `externalSetState` handle is wired) before
 *  this is called; otherwise the call is silently dropped — that is
 *  intentional, so a stray right-click before the app root mounts
 *  doesn't leave a stuck menu in module state. */
export function openContextMenu(target: ContextMenuTarget, x: number, y: number): void {
  if (externalSetState === null) return;
  // Compute the flipped position NOW (at open time) so the portal can
  // mount with the correct `left` / `top` in a single render. We do
  // NOT re-compute on window resize — the menu is transient enough
  // that the edge case (user resizes the window with the menu open)
  // is acceptable. Phase 16+ can revisit if the issue resurfaces.
  const pos = clampToViewport(x, y, ESTIMATED_MENU_W, ESTIMATED_MENU_H);
  externalSetState({ target, x: pos.x, y: pos.y });
}

/** Programmatically close the menu (e.g. host action after onAction). */
export function closeContextMenu(): void {
  if (externalSetState === null) return;
  externalSetState(null);
}

// ---------------------------------------------------------------------------
// Layout constants — used by the boundary detection. The values are
// chosen to match the CSS (.context-menu { min-width: 200px } + 4 items
// ≈ 200px tall). Re-measuring via ref is overkill for this UX: the
// menu is short-lived and 200x200 covers every realistic viewport edge
// case. If the menu grows in a future sprint, bump these constants.
// ---------------------------------------------------------------------------

const ESTIMATED_MENU_W = 220;
const ESTIMATED_MENU_H = 200;
const VIEWPORT_EDGE_BUFFER = 4;

function clampToViewport(
  x: number,
  y: number,
  width: number,
  height: number,
): { readonly x: number; readonly y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const flippedX = x + width > vw ? Math.max(VIEWPORT_EDGE_BUFFER, vw - width) : x;
  const flippedY = y + height > vh ? Math.max(VIEWPORT_EDGE_BUFFER, vh - height) : y;
  return { x: flippedX, y: flippedY };
}

// ---------------------------------------------------------------------------
// BSWMD coverage — the "add" items are disabled (with a tooltip) when
// no loaded BSWMD schema defines a module whose shortName appears
// anywhere along the value-side path. A "covered" module is one that
// has at least one ContainerDef / ParamDef / ReferenceDef to choose
// from — we use the simple `modules[].shortName` match as the gate.
//
// Sprint A X3 — P1 bugfix: the original implementation only checked
// the FIRST path segment. Real value-side paths are shaped
// `/<AR-PACKAGE>/<MODULE>/...`, so when the AR-PACKAGE shortName
// differs from the module shortName (e.g. user data uses
// `JWQ_CDD_PACK` as the package and `JWQ3399` as the module), the
// first segment never matches the module and every "Add *" item
// stayed disabled. In combined mode the path additionally carries
// a source-file basename prefix (`<basename>/...`) or a `[doc:N]`
// index prefix, so even paths that DO start with the module shortName
// end up with the basename or doc-index as the first segment.
//
// Fix: strip the combined-mode prefix (when in scope) and then walk
// the segments from the back, matching any segment equal to a known
// module shortName. Walking from the back matches the store's
// `findModuleDefForPath` algorithm (see useArxmlStore.ts:2904) and
// keeps the legacy `/<module>/...` shape working because the only
// segment there is the module shortName.
// ---------------------------------------------------------------------------

/** Last path segment after the final `/` or `\`. Mirrors
 *  `useArxmlStore#lastSegment`; inlined here to keep the
 *  `shared/path` dependency out of the renderer-only module. */
function lastPathSegment(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/** Strip the combined-mode prefix from `combinedPath` so the inner
 *  value-side path is what gets scanned for module shortName matches.
 *  Mirrors `useArxmlStore#stripCombinedPrefix`: the head segment is
 *  either the source file's basename, a `[doc:N]` index, or — when
 *  the combined view uses the flat (no-wrapper) shape — the actual
 *  first inner segment. Returns `null` only when the input has fewer
 *  than 2 segments (nothing to strip and nothing inner to use). */
function stripCombinedPrefix(combinedPath: string, sourceFilePath: string): string | null {
  const segments = combinedPath.split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const [head, ...rest] = segments;
  if (head === undefined) return null;
  // Accept either the literal basename or the [doc:N] index form.
  if (head === lastPathSegment(sourceFilePath) || /^\[doc:\d+\]$/.test(head)) {
    return `/${rest.join('/')}`;
  }
  // Flat mode: no wrapper in the combined view — the path is already
  // an inner path. Return verbatim.
  return combinedPath;
}

export interface BswmdCoverageOptions {
  /** View mode from the store. When `'combined'`, the path may carry a
   *  source-file prefix that must be stripped before the segment
   *  walk. Defaults to `'single'` for callers that don't pass options. */
  readonly viewMode?: 'single' | 'combined';
  /** Absolute on-disk path of the source document the target path
   *  belongs to. Required for combined-mode prefix stripping. When
   *  omitted in combined mode, the path is treated as an inner path. */
  readonly sourceFilePath?: string;
}

function isModuleCoveredByBswmd(
  path: string,
  schemas: readonly BswmdDocument[],
  options?: BswmdCoverageOptions,
): boolean {
  if (schemas.length === 0) return false;
  // 1. Strip combined-mode prefix when applicable. The stripper
  //    returns the inner path (or the verbatim input when there is no
  //    prefix to strip) so the segment walk below always sees the
  //    value-side path inside the source document.
  let stripped = path;
  if (options?.viewMode === 'combined' && options.sourceFilePath !== undefined) {
    const inner = stripCombinedPrefix(path, options.sourceFilePath);
    if (inner !== null) stripped = inner;
  }
  // 2. Walk the segments from the back and return true on the first
  //    module shortName match. Walking from the back mirrors
  //    `useArxmlStore#findModuleDefForPath` so both layers agree on
  //    which module "owns" a given path. It also lets the legacy
  //    `/<module>/...` shape keep working (single segment → matches
  //    on the first iteration) while accommodating the
  //    `/<AR-PACKAGE>/<MODULE>/...` shape (second segment matches).
  const segments = stripped.split('/').filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const candidate = segments[i];
    if (candidate === undefined) continue;
    for (const schema of schemas) {
      for (const mod of schema.modules) {
        if (mod.shortName === candidate) return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Menu item shape
// ---------------------------------------------------------------------------

interface MenuItemSpec {
  readonly id: string;
  readonly label: string;
  readonly disabled: boolean;
  readonly disabledTitle?: string;
  readonly cssClass: string;
  readonly build: (target: ContextMenuTarget) => ContextMenuAction;
  // Sprint 17 PATCH — optional aria-label for the rendered <li>.
  // When set, the render path forwards it to the menuitem's
  // `aria-label` attribute. Falls back to undefined (no attribute)
  // when omitted — existing menu items are unaffected.
  readonly ariaLabel?: string;
}

function buildContainerItems(
  target: ContextMenuTarget,
  covered: boolean,
  locale: Locale,
  disabledTitle: string,
): readonly MenuItemSpec[] {
  return [
    {
      id: 'add-container',
      label: t(locale, 'mutation.action.addContainer'),
      disabled: !covered,
      disabledTitle: covered ? undefined : disabledTitle,
      cssClass: 'context-menu-item context-menu-item-add',
      build: (t) => ({ type: 'add-container', path: t.path }),
    },
    {
      id: 'add-parameter',
      label: t(locale, 'mutation.action.addParameter'),
      disabled: !covered,
      disabledTitle: covered ? undefined : disabledTitle,
      cssClass: 'context-menu-item context-menu-item-add',
      build: (t) => ({ type: 'add-parameter', path: t.path }),
    },
    {
      id: 'add-reference',
      label: t(locale, 'mutation.action.addReference'),
      disabled: !covered,
      disabledTitle: covered ? undefined : disabledTitle,
      cssClass: 'context-menu-item context-menu-item-add',
      build: (t) => ({ type: 'add-reference', path: t.path }),
    },
    {
      id: 'rename-container',
      label: t(locale, 'mutation.action.renameContainer'),
      disabled: false,
      cssClass: 'context-menu-item',
      build: (t) => ({ type: 'rename-container', path: t.path, name: t.shortName }),
    },
    // Sprint A+ — the "Delete ECUC module" entry lives in
    // `buildBswmdItems` only (it's the source-backed module-root
    // re-route). Container/parameter/reference menus are unchanged
    // per spec ("container/reference menus unchanged"). See
    // `buildBswmdItems` for the entry.
    {
      id: 'delete-container',
      label: t(locale, 'mutation.action.delete', { name: target.shortName }),
      disabled: false,
      cssClass: 'context-menu-item context-menu-item-delete',
      build: (t) => ({ type: 'delete-container', path: t.path, name: t.shortName }),
    },
  ];
}

function buildReferenceItems(target: ContextMenuTarget, locale: Locale): readonly MenuItemSpec[] {
  return [
    {
      id: 'delete-reference',
      // The action label "mutation.action.delete" interpolates {name};
      // for a reference, {name} is the target's shortName (the same
      // string shown in the tree). Falls back to a literal "Delete
      // reference" when the shortName happens to be empty (synthetic
      // reference — rare in practice).
      label: target.shortName
        ? t(locale, 'mutation.action.delete', { name: target.shortName })
        : 'Delete reference',
      disabled: false,
      cssClass: 'context-menu-item context-menu-item-delete',
      build: (t) => ({ type: 'delete-reference', path: t.path }),
    },
  ];
}

/**
 * Phase P2 T2 — Collection menu items. Surfaces 3 multi-instance
 * operations on a CollectionHeader right-click:
 *   - 复制上一实例 / Duplicate last instance — duplicate-children
 *   - 排序 / Sort — sort-children
 *   - 删除全部 / Bulk delete — bulk-delete-children (destructive)
 *
 * Labels are LITERAL placeholder strings for T2. The i18n keys
 * `tree.duplicateChildren` / `tree.sortChildren` / `tree.bulkDelete`
 * land in T4 — the same deviation pattern as P1 T2/D1 (literal
 * labels, swapped for `t(locale, 'tree.*')` once keys exist).
 *
 * The bulk-delete entry is marked `destructive: true` so future
 * styling (red text, confirm-on-hover) can pick it up via the
 * `MenuItemSpec` extension surface. Today the visual cue is the
 * `context-menu-item-delete` cssClass, mirroring delete-container
 * and delete-reference.
 *
 * Confirmation UX for bulk-delete lives at the call site
 * (Tree.tsx), NOT here — the ContextMenu stays a thin
 * action-emitter and the confirmation dialog is owned by the
 * consumer so the same dialog can be reused by other triggers
 * (e.g. the toolbar button in T3).
 */
function buildCollectionItems(
  _target: ContextMenuTarget,
  _locale: Locale,
): readonly MenuItemSpec[] {
  // `_locale` is intentionally unused — kept for parity with
  // buildContainerItems / buildBswmdItems / buildReferenceItems
  // so the buildItems dispatcher signature stays uniform across
  // all four kinds. T4 will swap the literal labels for
  // t(locale, 'tree.*') at the same call site.
  void _locale;
  // Caller invariant: `buildItems` only routes here when
  // `target.kind === 'collection'`. The un-narrowed
  // `ContextMenuTarget` keeps the parameter signature aligned with
  // the sibling builders (buildContainerItems / buildBswmdItems /
  // buildReferenceItems) — they all accept the full union and read
  // the shared `path` / `shortName` fields directly. If a future
  // caller routes a non-collection target here, the action payload
  // will simply carry the wrong kind marker — the dispatcher's
  // switch in useAppMainHandlers will fall through the no-op
  // branch.
  return [
    {
      id: 'duplicate-children',
      label: '复制上一实例',
      disabled: false,
      cssClass: 'context-menu-item context-menu-item-action',
      build: (t) => ({ type: 'duplicate-children', path: t.path, shortName: t.shortName }),
    },
    {
      id: 'sort-children',
      label: '排序',
      disabled: false,
      cssClass: 'context-menu-item context-menu-item-action',
      build: (t) => ({ type: 'sort-children', path: t.path }),
    },
    {
      id: 'bulk-delete-children',
      label: '删除全部',
      disabled: false,
      cssClass: 'context-menu-item context-menu-item-delete',
      build: (t) => ({ type: 'bulk-delete-children', path: t.path, shortName: t.shortName }),
    },
  ];
}

/**
 * Sprint 17 P3 T3.3 — BSWMD remove menu item. Single action item
 * surfaced when the target kind is `'bswmd'`. The host (App.tsx)
 * routes `'remove-module'` to `useProjectActions.removeBswmdWithFullFlow(path)`,
 * which shows the 4-option dialog (cancel / only / cascade /
 * cascade-and-unlink). Mirrors the delete-reference shape: a single
 * destructive item with the path as the only payload field.
 *
 * Sprint A+ — when the right-click target carries a `modulePath`
 * (set by the TreeNode module-kind re-route for source-backed
 * docs), also emit a sibling "Delete ECUC module" item. The host
 * routes `delete-module` to `useArxmlStore.deleteEcucModule(path)`,
 * which clears the source BSWMD link atomically (no dangling
 * chip). Spec §Design Candidates A3+B: BOTH "Remove BSWMD" and
 * "Delete ECUC module" should be visible for a source-backed
 * module root right-click.
 */
function buildBswmdItems(
  target: ContextMenuTarget,
  locale: Locale,
  hasDcm: boolean,
): readonly MenuItemSpec[] {
  const items: MenuItemSpec[] = [
    {
      id: 'remove-module',
      label: t(locale, 'mutation.action.removeModule'),
      // Sprint 17 PATCH — aria-label disambiguates the destructive
      // item with the BSWMD shortName so screen readers announce
      // which module will be removed (e.g. "Remove BSWMD 'Adc.arxml'"
      // vs. just "Remove module").
      ariaLabel: t(locale, 'mutation.action.removeModuleAria', { name: target.shortName }),
      disabled: false,
      cssClass: 'context-menu-item context-menu-item-delete',
      // `target.path` is the BSWMD file path that the right-click
      // target — the host (App.tsx) routes the action payload to
      // `useProjectActions.removeBswmdWithFullFlow(path)`.
      build: () => ({ type: 'remove-module', path: target.path }),
    },
  ];
  if (target.modulePath !== undefined) {
    items.push({
      id: 'delete-module',
      label: t(locale, 'mutation.action.deleteModule', { name: target.shortName }),
      ariaLabel: t(locale, 'mutation.action.deleteModuleAria', { name: target.shortName }),
      disabled: false,
      cssClass: 'context-menu-item context-menu-item-delete',
      build: (t) => ({ type: 'delete-module', path: t.modulePath ?? t.path, name: t.shortName }),
    });
  }
  // v1.32.0 MINOR T8 — "Generate Dcm Config" entry now gates on the
  // project's parse-based Dcm BSWMD presence (`hasDcm`) instead of
  // the v1.31.x filename regex. The host (App.tsx) routes the emitted
  // `generate-dcm-config` action to the dcm-config launcher (T7).
  // The pre-MINOR behavior matched `target.path` against the regex
  // because every project's Dcm BSWMD was conventionally named
  // `Dcm.arxml` — but real projects can name the BSWMD
  // `Bsw_Custom_Dcm_v3.arxml` (false negative) or
  // `BCM_Dcm_Compat.arxml` (false positive on a non-Dcm BSWMD). The
  // parse-based gate resolves both cases correctly.
  if (hasDcm) {
    items.push({
      id: 'generate-dcm-config',
      label: t(locale, 'dcmConfig.action.generate'),
      ariaLabel: t(locale, 'dcmConfig.action.generateAria', { name: target.shortName }),
      disabled: false,
      cssClass: 'context-menu-item context-menu-item-action',
      build: () => ({ type: 'generate-dcm-config', path: target.path }),
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Root component — mount once at the app root.
// ---------------------------------------------------------------------------

interface ContextMenuRootProps {
  /** Fired when the user picks a menu item. The host wires this to
   *  the store actions / picker state in App.tsx. */
  readonly onAction: (action: ContextMenuAction) => void;
  /** Locale to render labels in. Defaults to 'zh-CN' to match the
   *  store default. App.tsx will pass `useArxmlStore.getState().locale`
   *  (or wire a subscription) so locale flips hot-update the menu. */
  readonly locale?: Locale;
}

export function ContextMenuRoot({
  onAction,
  locale = 'zh-CN',
}: ContextMenuRootProps): JSX.Element | null {
  const [s, setS] = useState<ContextMenuState | null>(state);
  // Mirror the store's locale via subscription so the menu labels
  // hot-update when the user toggles language. We only subscribe
  // to `locale` (small surface) and only when the menu is open —
  // no need to thrash the menu on unrelated store changes.
  const [storeLocale, setStoreLocale] = useState<Locale>(useArxmlStore.getState().locale);
  useEffect(() => {
    return useArxmlStore.subscribe((next) => {
      setStoreLocale(next.locale);
    });
  }, []);

  // Wire the module-level handle. The dependency array is empty —
  // the host's `onAction` and `locale` are captured by the menu's
  // own refs (see below) so we don't need to re-wire on every render.
  useEffect(() => {
    externalSetState = setS;
    return () => {
      externalSetState = null;
    };
  }, []);

  // Keep `onAction` and the effective locale in refs so the global
  // keyboard / outside-click handlers (registered below) always call
  // the latest version without re-binding the listeners.
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  const effectiveLocale = locale === 'en' || locale === 'zh-CN' ? locale : storeLocale;
  const effectiveLocaleRef = useRef<Locale>(effectiveLocale);
  effectiveLocaleRef.current = effectiveLocale;

  // v1.32.0 MINOR T8 — read the parse-based Dcm BSWMD gate via the
  // shared selector hook. Replaces the v1.31.x inline `isDcmBswmdPath`
  // regex; the helper at `dcmConfig/regex.ts` is deleted as part of
  // this MINOR.
  const bswmdHasDcm = useBswmdHasDcm();
  const hasDcm = bswmdHasDcm.hasDcm;
  const hasDcmRef = useRef(hasDcm);
  hasDcmRef.current = hasDcm;

  // Outside click + Esc handling. We listen on `mousedown` (not
  // `click`) so the user can dismiss the menu by pressing the mouse
  // down on a tree item elsewhere — the menu disappears before the
  // click event fires on the underlying target, which matches the
  // OS context-menu UX (right-click → click elsewhere → menu gone).
  useEffect(() => {
    if (s === null) return undefined;
    const handleMouseDown = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target === null) return;
      if (target.closest('[data-testid="context-menu"]') !== null) return;
      setS(null);
    };
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setS(null);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [s]);

  // Auto-focus the first item when the menu opens so keyboard
  // navigation works without an extra click. `useLayoutEffect` runs
  // synchronously after the DOM is updated but before the browser
  // paints, so the focus call lands before any test assertion
  // (jsdom does not advance `requestAnimationFrame` on its own, so
  // a `useEffect` + rAF would leave the focus unset when the test
  // checks it immediately after open).
  const firstItemRef = useRef<HTMLLIElement | null>(null);
  useLayoutEffect(() => {
    if (s !== null) {
      firstItemRef.current?.focus();
    }
  }, [s]);

  // Item click handler — fires the action and closes the menu. We
  // use `useCallback` so the menuitem onClick reference is stable
  // across renders (keeps React happy when the same set of items
  // is re-rendered on a locale flip).
  const handleItemClick = useCallback((spec: MenuItemSpec, target: ContextMenuTarget): void => {
    if (spec.disabled) return;
    const action = spec.build(target);
    setS(null);
    onActionRef.current(action);
  }, []);

  // Keyboard handler on the <ul> — ArrowUp/Down move focus between
  // items, Enter/Space activate the focused item. We compute the
  // enabled items in document order (matching the rendered DOM) and
  // jump focus to the next / previous enabled one, skipping disabled
  // items so the user can't accidentally land on one and wonder why
  // Enter does nothing.
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const handleMenuKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLUListElement>): void => {
      if (s === null) return;
      // Build the list of enabled items once per keystroke.
      const items = buildItems(
        s.target,
        useArxmlStore.getState().bswmdSchemas,
        effectiveLocaleRef.current,
        hasDcmRef.current,
      );
      const enabledIndexes = items
        .map((it, idx) => (it.disabled ? -1 : idx))
        .filter((idx) => idx >= 0);
      if (enabledIndexes.length === 0) return;
      const focused = e.currentTarget.querySelector<HTMLLIElement>(':focus');
      const focusedIdx = focused === null ? -1 : Number(focused.dataset.idx ?? '-1');
      const focusedInEnabled = enabledIndexes.indexOf(focusedIdx);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = enabledIndexes[(focusedInEnabled + 1) % enabledIndexes.length];
        const el = next === undefined ? null : (itemRefs.current[next] ?? null);
        el?.focus();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIdx = focusedInEnabled <= 0 ? enabledIndexes.length - 1 : focusedInEnabled - 1;
        const prev = enabledIndexes[prevIdx];
        const el = prev === undefined ? null : (itemRefs.current[prev] ?? null);
        el?.focus();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        if (focused !== null) {
          e.preventDefault();
          const idx = Number(focused.dataset.idx ?? '-1');
          const spec = items[idx];
          if (spec !== undefined && !spec.disabled) {
            handleItemClick(spec, s.target);
          }
        }
      }
    },
    [s, handleItemClick],
  );

  if (s === null) return null;

  const items = buildItems(
    s.target,
    useArxmlStore.getState().bswmdSchemas,
    effectiveLocale,
    hasDcm,
  );
  // Re-set the module-level cell so subsequent `openContextMenu`
  // calls compare against the new value (we only re-render on
  // reference change, which is fine — openContextMenu replaces the
  // whole state object).
  state = s;

  return createPortal(
    <ul
      className="context-menu"
      role="menu"
      data-testid="context-menu"
      style={{ left: `${s.x}px`, top: `${s.y}px` }}
      onKeyDown={handleMenuKeyDown}
    >
      {items.map((spec, idx) => (
        <li
          key={spec.id}
          ref={(el) => {
            itemRefs.current[idx] = el;
            if (idx === 0) firstItemRef.current = el;
          }}
          role="menuitem"
          tabIndex={spec.disabled ? -1 : 0}
          aria-disabled={spec.disabled}
          // Sprint 17 PATCH — forward the spec's aria-label to the
          // menuitem. Falls back to undefined (no attribute) when
          // omitted, so existing menu items keep their default a11y
          // (announce label text only).
          aria-label={spec.ariaLabel}
          title={spec.disabledTitle}
          data-idx={idx}
          data-testid={`context-menu-item-${spec.id}`}
          className={spec.cssClass}
          onClick={() => handleItemClick(spec, s.target)}
        >
          {spec.label}
        </li>
      ))}
    </ul>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Build the items for the current target. Centralised so the keyboard
// handler and the render path agree on the item order / disabled state.
// ---------------------------------------------------------------------------

function buildItems(
  target: ContextMenuTarget,
  schemas: readonly BswmdDocument[],
  locale: Locale,
  hasDcm: boolean,
): readonly MenuItemSpec[] {
  if (target.kind === 'reference') {
    return buildReferenceItems(target, locale);
  }
  // Phase P2 T2 — `kind: 'collection'` shortcut. Collection menu is
  // a 3-item fixed surface (duplicate / sort / bulk-delete) — no
  // BSWMD-coverage gate (the operations target the parent's
  // children, not the collection's own BSWMD def), no
  // add-container entries (those live on the underlying container
  // target). Dispatched BEFORE the container fall-through so a
  // `collection` kind never falls into buildContainerItems.
  if (target.kind === 'collection') {
    return buildCollectionItems(target, locale);
  }
  // Sprint 17 P3 T3.3 — `kind: 'bswmd'` shortcut. The BSWMD row
  // doesn't get add/delete-container items (those are ECUC mutations
  // scoped to a module tree node), it gets a single "Remove module"
  // item that routes through `useProjectActions.removeBswmdWithFullFlow`.
  if (target.kind === 'bswmd') {
    return buildBswmdItems(target, locale, hasDcm);
  }
  // Sprint A X3 — pull combined-mode + source file path from the
  // store so `isModuleCoveredByBswmd` can strip the combined-mode
  // prefix before scanning for a matching module shortName. The
  // `activeDocumentPath` covers single-mode (one doc open) and
  // combined-mode (the doc that owns the right-clicked tree node).
  // Falls back to legacy first-segment matching when these are null
  // (e.g. early-mount or transition states).
  const storeState = useArxmlStore.getState();
  // Only `'single'` and `'combined'` need the basename-prefix strip
  // (the `'import-merged'` mode is a Sprint 14 wizard state that
  // surfaces no tree for right-click). Treat anything else as single.
  const viewMode: 'single' | 'combined' =
    storeState.viewMode === 'combined' ? 'combined' : 'single';
  const sourceFilePath = storeState.activeDocumentPath ?? storeState.filePath ?? undefined;
  const covered = isModuleCoveredByBswmd(target.path, schemas, {
    viewMode,
    sourceFilePath,
  });
  const disabledTitle = t(locale, 'mutation.error.no-bswmd-for-module');
  return buildContainerItems(target, covered, locale, disabledTitle);
}
