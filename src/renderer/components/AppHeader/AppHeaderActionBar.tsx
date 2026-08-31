// src/renderer/components/AppHeader/AppHeaderActionBar.tsx
// v1.42.x PATCH T2 — extracted from AppHeader.tsx as the AppHeader
// sub-component for Visual Concern 3a: the save actions in the action bar.
//
// P2 (spec §4.2) — save action hierarchy: "Save (active ARXML)" is the
// primary button and turns amber while dirty (pulse, reduced-motion
// aware); "Save Project" and "Save All" move into an overflow dropdown
// to the right of the primary button. Testids btn-project-save /
// btn-save-all are preserved inside the menu; consumers must open
// btn-save-overflow first.
//
// Pure-ish presentational sub-component — all state ownership stays in
// AppHeader.tsx. Subscribes to `dirtyPaths.size` from the store directly
// (Set identity churn avoidance, unchanged from v1.42.x). The only local
// state is the menu-open flag.

import { useEffect, useRef, useState, type JSX } from 'react';

import { t, type Locale } from '../../../shared/i18n/index.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';

export type AppHeaderActionBarProps = {
  /** Project Save handler (writes `.autosarcfg.json` manifest). */
  readonly onProjectSave: () => void | Promise<void>;
  /** Disabled predicate for Project Save: true when no project is
   *  open OR another action is in-flight (parent computes). */
  readonly canSaveProject: boolean;
  /** Count of dirty files INSIDE the project (excludes the currently-
   *  active ARXML — that's `isActiveDirty`). Drives the blocked tooltip. */
  readonly projectDirtyCount: number;
  /** ARXML Save handler (writes the active ARXML file). */
  readonly onSave: () => void | Promise<void>;
  /** Disabled predicate for ARXML Save: true when no active doc. */
  readonly canSave: boolean;
  /** Dirty-state marker for the active ARXML (amber primary + pulse). */
  readonly isActiveDirty: boolean;
  /** Save All handler (loops over dirty paths silently — no per-file
   *  dialog). Lives in the overflow menu since P2. */
  readonly onSaveAll: () => void | Promise<void>;
  /** Disabled predicate for Save All: true when dirty set is empty OR
   *  another action is in-flight. */
  readonly canSaveAll: boolean;
  /** Current locale for i18n label lookup. */
  readonly locale: Locale;
};

export function AppHeaderActionBar({
  onProjectSave,
  canSaveProject,
  projectDirtyCount,
  onSave,
  canSave,
  isActiveDirty,
  onSaveAll,
  canSaveAll,
  locale,
}: AppHeaderActionBarProps): JSX.Element {
  // Subscribe to the count of dirty paths in the store directly (not
  // via props) to keep re-render scope minimal.
  const dirtyPathsCount = useArxmlStore((s) => s.dirtyPaths.size);

  // P2 (spec §4.2) — overflow menu open state. Outside-click + Escape
  // close, mirroring the BrandMenu menuRef pattern.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDocMouseDown = (e: MouseEvent): void => {
      if (menuRef.current !== null && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  return (
    <div className="app-save-group">
      {/* Primary: Save active ARXML. Semantics unchanged from v1.42.x;
          the amber `is-dirty` treatment lands with P2 (spec §4.2). */}
      <button
        type="button"
        onClick={() => {
          void onSave();
        }}
        disabled={!canSave}
        className={`app-btn app-btn-save ${isActiveDirty ? 'is-dirty' : ''}`}
        data-testid="btn-save"
        data-tour-id="app-save"
        title={isActiveDirty ? t(locale, 'app.saveDirty') : t(locale, 'app.save')}
      >
        {isActiveDirty ? t(locale, 'app.saveDirty') : t(locale, 'app.save')}
      </button>
      {/* Overflow: Project Save + Save All. */}
      <div className="app-save-overflow" ref={menuRef}>
        <button
          type="button"
          className={`app-btn app-btn-save-overflow${dirtyPathsCount > 0 ? ' is-dirty' : ''}`}
          data-testid="btn-save-overflow"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t(locale, 'app.saveMore')}
          title={t(locale, 'app.saveMore')}
          onClick={() => {
            setMenuOpen((open) => !open);
          }}
        >
          ▾
        </button>
        {menuOpen && (
          <div className="app-dropdown" role="menu">
            <button
              type="button"
              role="menuitem"
              className="app-dropdown-item"
              data-testid="btn-project-save"
              disabled={!canSaveProject}
              title={
                projectDirtyCount > 0
                  ? t(locale, 'app.project.saveBlockedDirty', { count: projectDirtyCount })
                  : undefined
              }
              onClick={() => {
                setMenuOpen(false);
                void onProjectSave();
              }}
            >
              {t(locale, 'app.project.save')}
            </button>
            <button
              type="button"
              role="menuitem"
              className={`app-dropdown-item${dirtyPathsCount > 0 ? ' is-dirty' : ''}`}
              data-testid="btn-save-all"
              disabled={!canSaveAll}
              title={
                dirtyPathsCount > 0
                  ? t(locale, 'app.saveAllDirtyTitle', { count: dirtyPathsCount })
                  : t(locale, 'app.saveAllTitle')
              }
              onClick={() => {
                setMenuOpen(false);
                void onSaveAll();
              }}
            >
              {dirtyPathsCount > 0
                ? t(locale, 'app.saveAllDirty', { count: dirtyPathsCount })
                : t(locale, 'app.saveAll')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
