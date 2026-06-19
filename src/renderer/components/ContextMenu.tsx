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
import { t } from '@shared/i18n.js';
import type { Locale } from '@shared/i18n.js';

import { useArxmlStore } from '../store/useArxmlStore.js';

import './ContextMenu.css';

// ---------------------------------------------------------------------------
// Public API — actions emitted by the menu
// ---------------------------------------------------------------------------

/** The "target" of a right-click: the path of the TreeNode the user
 *  clicked, its discriminator kind, and its shortName (used in the
 *  delete label so the user can confirm what they're about to remove). */
export type ContextMenuTarget = {
  readonly path: string;
  readonly kind: 'module' | 'container' | 'reference';
  readonly shortName: string;
};

/** Action union — one of the 5 operations the user can fire from the
 *  menu. Phase 2 wires this to `useArxmlStore` actions (or to the
 *  picker dialog state) in the host component (App.tsx), not here. */
export type ContextMenuAction =
  | { readonly type: 'add-container'; readonly path: string }
  | { readonly type: 'add-parameter'; readonly path: string }
  | { readonly type: 'add-reference'; readonly path: string }
  | { readonly type: 'delete-container'; readonly path: string; readonly name: string }
  | { readonly type: 'delete-reference'; readonly path: string };

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
// no loaded BSWMD schema defines a module whose shortName matches the
// first path segment of the target. A "covered" module is one that
// has at least one ContainerDef / ParamDef / ReferenceDef to choose
// from — we use the simple `modules[].shortName` match as the gate.
// ---------------------------------------------------------------------------

function isModuleCoveredByBswmd(path: string, schemas: readonly BswmdDocument[]): boolean {
  if (schemas.length === 0) return false;
  // path = "/<module>/..." — the module shortName is the first
  // non-empty segment after the leading slash.
  const firstSegment = path.split('/').filter(Boolean)[0];
  if (firstSegment === undefined) return false;
  for (const schema of schemas) {
    for (const mod of schema.modules) {
      if (mod.shortName === firstSegment) return true;
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

  const items = buildItems(s.target, useArxmlStore.getState().bswmdSchemas, effectiveLocale);
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
): readonly MenuItemSpec[] {
  if (target.kind === 'reference') {
    return buildReferenceItems(target, locale);
  }
  const covered = isModuleCoveredByBswmd(target.path, schemas);
  const disabledTitle = t(locale, 'mutation.error.no-bswmd-for-module');
  return buildContainerItems(target, covered, locale, disabledTitle);
}
