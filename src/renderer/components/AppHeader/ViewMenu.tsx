// src/renderer/components/AppHeader/ViewMenu.tsx
// P3 Dock 工作台 — 「视图」下拉菜单（spec §5.6）
// 复用 BrandMenu 的 render-prop 模式：trigger + dropdown panel +
// click-outside + Escape 关闭。按 registry 枚举全部面板；
// 已关闭面板恢复到 defaultGroup 位置；「重置布局」清除 localStorage。
import { useCallback, useEffect, useRef, useState } from 'react';

import { t } from '../../../shared/i18n/index.js';
import { PANEL_REGISTRY } from '../../panels/registry.js';
import type { PanelId } from '../../panels/registry.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';

export interface ViewMenuProps {
  /** Toggle (activate or restore) a panel by id. */
  readonly onTogglePanel: (panelId: PanelId) => void;
  /** Clear localStorage layout and rebuild the default layout. */
  readonly onResetLayout: () => void;
}

export function ViewMenu({ onTogglePanel, onResetLayout }: ViewMenuProps): JSX.Element {
  const locale = useArxmlStore((s) => s.locale);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent): void => {
      if (menuRef.current !== null && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [menuOpen]);

  const openMenu = useCallback((): void => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback((): void => {
    closeTimerRef.current = setTimeout(() => {
      setMenuOpen(false);
      closeTimerRef.current = null;
    }, 150);
  }, []);

  const closeMenu = useCallback((): void => setMenuOpen(false), []);

  return (
    <div
      className="app-menu-trigger"
      ref={menuRef}
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
      data-testid="menu-view-trigger"
    >
      <button
        type="button"
        className={`app-menu-btn ${menuOpen ? 'is-open' : ''}`}
        onClick={() => setMenuOpen(!menuOpen)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        data-testid="btn-view-menu"
      >
        {t(locale, 'app.menu.view')}
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
          {PANEL_REGISTRY.filter((def) => def.defaultGroup !== 'viewer').map((def) => (
            <button
              key={def.id}
              type="button"
              className="app-dropdown-item"
              role="menuitem"
              data-testid={`menu-item-${def.id}`}
              onClick={() => {
                closeMenu();
                onTogglePanel(def.id);
              }}
            >
              {t(locale, def.titleKey as Parameters<typeof t>[1])}
            </button>
          ))}
          <div className="app-dropdown-divider" role="separator" />
          <button
            type="button"
            className="app-dropdown-item"
            role="menuitem"
            data-testid="btn-reset-layout"
            onClick={() => {
              closeMenu();
              onResetLayout();
            }}
          >
            {t(locale, 'app.menu.resetLayout')}
          </button>
        </div>
      )}
    </div>
  );
}
