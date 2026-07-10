// src/renderer/components/AppHeader/BrandMenu.tsx
// v1.42.1 MINOR T4b — extracted from AppHeader.tsx (line 77-79 + 155-161
// + 209-229 + 231-244 + 475-489) as the first AppHeader sub-component
// (Visual Concern 1 of 3: Brand + Menu trigger).
//
// Per-flow scope chosen over bulk extraction (lesson
// `sub-component-extraction-with-N-items-requires-per-flow-analysis-not-bulk-extraction`):
// this T handles VC1 (Brand + menu trigger) only; VC2 (MenuPanel +
// 10-11 menu items) and VC3 (Action bar + Status badge) are extracted
// in separate T-level commits (T4c-i + T4c-ii + T4c-iii).
//
// **Controlled `menuOpen` pattern** (per spec note that AppHeader
// shell owns the `{menuOpen && <MenuPanel />}` conditional render in
// T4c-i): BrandMenu does NOT own the `menuOpen` state. AppHeader
// shell owns it (via the new `useState<boolean>(false)` in shell)
// and passes it as a prop. BrandMenu accepts `menuOpen` +
// `onMenuOpenChange: (open: boolean) => void` and renders the
// toggle button + click-outside/Escape/hover effects.
//
// **Internal refs (`menuRef`, `closeTimerRef`) + their 3 useEffect +
// 2 useCallback stay in BrandMenu** because they're coupled to the
// trigger JSX (the `ref` and `onMouseEnter/Leave` handlers). Hoisting
// them to shell would force the shell to manage DOM refs the
// sub-component owns.
//
// i18n: BrandMenu subscribes to `locale` from the store directly
// (same pattern as `ResetOnboardingMenuItem` in this subdir). The
// menu label `app.menu.project` is rendered inside the button.

import { useCallback, useEffect, useRef } from 'react';

import { t } from '../../../shared/i18n/index.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';

export type AppHeaderBrandMenuProps = {
  /** `menuOpen` controlled by AppHeader shell (owns the state for
   *  the conditional `{menuOpen && <MenuPanel />}` render in T4c-i). */
  readonly menuOpen: boolean;
  /** Callback to update `menuOpen` in AppHeader shell. Receives the
   *  next boolean value (current XOR true for toggle). */
  readonly onMenuOpenChange: (open: boolean) => void;
};

export function AppHeaderBrandMenu({
  menuOpen,
  onMenuOpenChange,
}: AppHeaderBrandMenuProps): JSX.Element {
  // VC1 DOM refs (verbatim from AppHeader.tsx line 78-79): the
  // `ref` and `closeTimerRef` are coupled to the trigger JSX so they
  // stay in BrandMenu. The `closeTimerRef` survives across the
  // 150ms debounce so a quick mouseOut → mouseIn doesn't close
  // the menu mid-hover.
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Subscribe to locale for the menu label i18n (same pattern as
  // ResetOnboardingMenuItem.tsx in this subdir).
  const locale = useArxmlStore((s) => s.locale);

  // VC1 effect 1 (verbatim from AppHeader.tsx line 155-161): unmount
  // cleanup for the close-timer debounce. When BrandMenu unmounts
  // (or re-mounts in StrictMode), any pending `setTimeout` must be
  // cleared to avoid a leaked callback on a defunct component.
  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  // VC1 effect 2 (verbatim from AppHeader.tsx line 209-219): click
  // outside the menu trigger closes the dropdown. Skips effect setup
  // when menu is closed (avoids an unnecessary global listener).
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

  // VC1 effect 3 (verbatim from AppHeader.tsx line 221-229): Escape
  // key closes the dropdown. Skips effect setup when menu is closed.
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onMenuOpenChange(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [menuOpen, onMenuOpenChange]);

  // VC1 handler 1 (verbatim from AppHeader.tsx line 231-237): openMenu
  // cancels any pending scheduleClose debounce (avoids the menu
  // closing mid-hover after a quick mouseOut/mouseIn).
  const openMenu = useCallback((): void => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  // VC1 handler 2 (verbatim from AppHeader.tsx line 239-244):
  // scheduleClose debounces the close-on-mouse-leave (150ms) so the
  // menu doesn't close when the user accidentally moves the cursor
  // outside the trigger boundary.
  const scheduleClose = useCallback((): void => {
    closeTimerRef.current = setTimeout(() => {
      onMenuOpenChange(false);
      closeTimerRef.current = null;
    }, 150);
  }, [onMenuOpenChange]);

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
      </button>
    </div>
  );
}
