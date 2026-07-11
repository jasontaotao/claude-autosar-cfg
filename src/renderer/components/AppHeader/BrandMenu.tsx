// src/renderer/components/AppHeader/BrandMenu.tsx
// v1.42.x PATCH T1 — extracted from AppHeader.tsx as the first
// AppHeader sub-component (Visual Concern 1: Brand + Menu trigger +
// Dropdown panel container).
//
// Render-prop pattern (per v1.42.1 T5 ship capture-decisions D2
// decision): BrandMenu owns the trigger JSX + panel wrapper +
// menuRef + closeTimerRef + 3 useEffect + 2 useCallback + `menuOpen`
// state ownership. The 10 menu items live in AppHeader.tsx shell as
// `children` so the prop drilling for handlers (projectNew, openDbc,
// openOdx, etc.) stays in one place.
//
// Why render-prop instead of prop-drilled menu items: the trigger
// DOM node (`<div className="app-menu-trigger">`) and the panel
// DOM node (`<div className="app-dropdown">`) share menuRef +
// closeTimerRef + the hover-to-keep-open handlers. Splitting these
// across two sub-components would force the shell to manage DOM
// refs the sub-component owns. The render-prop callback receives
// `{ closeMenu, locale }` so each item can call `api.closeMenu()`
// before invoking its handler — the panel closes immediately on
// click, then the handler runs (matches pre-extraction behavior).
//
// Controlled `menuOpen` pattern: AppHeader.tsx shell owns `menuOpen`
// state (via existing `useState<boolean>(false)` in shell) and
// passes it as a prop. BrandMenu accepts `menuOpen` +
// `onMenuOpenChange: (open: boolean) => void` and renders the
// trigger + panel + 3 useEffect + 2 useCallback. This matches the
// T4b WIP attempt's design pattern (rolled back before v1.42.1
// T5 ship) and applies the lesson learned about cross-VC state
// coupling (T0 spec §"What was actually measured on `8778d48`").
//
// i18n: BrandMenu subscribes to `locale` from the store directly
// (same pattern as `ResetOnboardingMenuItem` in this subdir) and
// forwards it through the render-prop so menu items rendered in
// shell can call `t(api.locale, '...')` without re-subscribing.

import { useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

import { t, type Locale } from '../../../shared/i18n/index.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';

/** Render-prop API exposed to the `children` callback. The shell
 *  uses this to wire menu items to the panel state without leaking
 *  DOM refs across the sub-component boundary. */
export type BrandMenuRenderApi = {
  /** Closes the dropdown panel. Menu items must call this BEFORE
   *  invoking their handler so the click visual closes immediately
   *  (matches pre-extraction behavior — `setMenuOpen(false)` then
   *  the handler). */
  readonly closeMenu: () => void;
  /** Current locale, forwarded from the store via BrandMenu's
   *  subscription. Menu items in shell call `t(api.locale, '...')`
   *  instead of subscribing to the store themselves (avoids
   *  re-subscription churn per-item). */
  readonly locale: Locale;
};

export type AppHeaderBrandMenuProps = {
  /** `menuOpen` controlled by AppHeader shell — owns the state for
   *  the conditional `{menuOpen && <panel />}` render. */
  readonly menuOpen: boolean;
  /** Callback to update `menuOpen` in AppHeader shell. Receives the
   *  next boolean value (current XOR true for the toggle button,
   *  or `false` for close paths: item click, click-outside,
   *  Escape). */
  readonly onMenuOpenChange: (open: boolean) => void;
  /** Render-prop for the dropdown panel content. Called only when
   *  the panel is open. Receives `{ closeMenu, locale }` so each
   *  item can wire `onClick={() => { api.closeMenu(); handler(); }}`. */
  readonly children: (api: BrandMenuRenderApi) => ReactNode;
};

export function AppHeaderBrandMenu({
  menuOpen,
  onMenuOpenChange,
  children,
}: AppHeaderBrandMenuProps): JSX.Element {
  // VC1 DOM refs (verbatim from AppHeader.tsx pre-extraction):
  // menuRef is the trigger DOM node (used by click-outside to
  // determine if the click was inside or outside). closeTimerRef
  // survives across the 150ms debounce so a quick mouseOut →
  // mouseIn doesn't close the menu mid-hover.
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Subscribe to locale for the trigger label i18n and the render-
  // prop forwarding (same pattern as `ResetOnboardingMenuItem` in
  // this subdir — fine to subscribe per sub-component because the
  // selector returns a primitive string that Zustand diffs cheaply).
  const locale = useArxmlStore((s) => s.locale);

  // VC1 effect 1 (verbatim from AppHeader.tsx): unmount cleanup
  // for the close-timer debounce. When BrandMenu unmounts (or
  // re-mounts in StrictMode), any pending setTimeout must be
  // cleared to avoid a leaked callback on a defunct component.
  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  // VC1 effect 2 (verbatim from AppHeader.tsx): click outside the
  // menu trigger closes the dropdown. Skips effect setup when menu
  // is closed (avoids an unnecessary global listener on every
  // render where menuOpen flips to false).
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent): void => {
      if (menuRef.current !== null && !menuRef.current.contains(e.target as Node)) {
        onMenuOpenChange(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen, onMenuOpenChange]);

  // VC1 effect 3 (verbatim from AppHeader.tsx): Escape key closes
  // the dropdown. Skips effect setup when menu is closed.
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onMenuOpenChange(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [menuOpen, onMenuOpenChange]);

  // VC1 handler 1 (verbatim from AppHeader.tsx): openMenu cancels
  // any pending scheduleClose debounce. Prevents the menu from
  // closing mid-hover after a quick mouseOut/mouseIn cycle.
  const openMenu = useCallback((): void => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  // VC1 handler 2 (verbatim from AppHeader.tsx): scheduleClose
  // debounces the close-on-mouse-leave (150ms) so the menu doesn't
  // close when the user accidentally moves the cursor outside the
  // trigger boundary (common near dropdown edges).
  const scheduleClose = useCallback((): void => {
    closeTimerRef.current = setTimeout(() => {
      onMenuOpenChange(false);
      closeTimerRef.current = null;
    }, 150);
  }, [onMenuOpenChange]);

  // Render-prop API: exposes `closeMenu` for menu items to invoke
  // before their handler, and `locale` so items don't need to
  // re-subscribe to the store. Both values are stable across
  // renders (`closeMenu` is a fresh arrow but matches the
  // onMenuOpenChange prop; `locale` is the current subscribed value).
  const renderApi: BrandMenuRenderApi = {
    closeMenu: () => onMenuOpenChange(false),
    locale,
  };

  return (
    <div
      className="app-menu-trigger"
      ref={menuRef}
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
      data-testid="menu-project-trigger"
    >
      <button
        type="button"
        className={`app-menu-btn ${menuOpen ? 'is-open' : ''}`}
        onClick={() => onMenuOpenChange(!menuOpen)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        data-testid="btn-menu-toggle"
      >
        {t(locale, 'app.menu.project')}
        <svg
          className="app-menu-chevron"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z" />
        </svg>
      </button>
      {menuOpen && (
        <div
          className="app-dropdown"
          role="menu"
          onMouseEnter={openMenu}
          onMouseLeave={scheduleClose}
        >
          {children(renderApi)}
        </div>
      )}
    </div>
  );
}
