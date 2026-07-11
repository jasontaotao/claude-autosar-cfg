// src/renderer/components/AppHeader/AppHeaderActionBar.tsx
// v1.42.x PATCH T2 — extracted from AppHeader.tsx (lines 754-805,
// ~52 LoC) as the AppHeader sub-component for Visual Concern 3a:
// the 3 high-frequency Save buttons in the action bar.
//
// Pure presentational sub-component (per v1.42.1 T0 spec note on
// container/presentational split — matches `ResetOnboardingMenuItem`
// pattern in this subdir). All state ownership stays in AppHeader.tsx
// shell — the sub-component subscribes to `dirtyPaths.size` from
// the store directly because the Set's size is the only value that
// affects rendering (the Set itself isn't passed across the
// boundary).
//
// Why not also extract the dirtyPaths Set as a prop: passing a Set
// across React props triggers referential equality churn on every
// store update, even when the size didn't change. Subscribing to
// `size` inside the sub-component keeps the re-render scope minimal
// (only when count actually changes).
//
// "高频按钮常驻工具栏" UX rule (per the v1.16b T7 source comment
// at AppHeader.tsx:781-787): Save All sits immediately right of
// Save ARXML so the user can quickly choose between single-file
// and multi-file save flows.

import { type JSX } from 'react';

import { t, type Locale } from '../../../shared/i18n/index.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';

export type AppHeaderActionBarProps = {
  /** Project Save handler (writes `.autosarcfg.json` manifest).
   *  Called from the leftmost button. */
  readonly onProjectSave: () => void | Promise<void>;
  /** Disabled predicate for Project Save: true when no project is
   *  open OR another action is in-flight (parent computes). */
  readonly canSaveProject: boolean;
  /** Count of dirty files INSIDE the project (excludes the
   *  currently-active ARXML if it's dirty — that's `isActiveDirty`).
   *  Used for the tooltip "blocked by N dirty files" message. */
  readonly projectDirtyCount: number;
  /** ARXML Save handler (writes the active ARXML file).
   *  Called from the middle button. */
  readonly onSave: () => void | Promise<void>;
  /** Disabled predicate for ARXML Save: true when no active doc. */
  readonly canSave: boolean;
  /** Dirty-state marker for the active ARXML (controls the
   *  `is-dirty` class + label switch between "Save" / "Save *"). */
  readonly isActiveDirty: boolean;
  /** Save All handler (loops over dirty paths silently — no per-
   *  file dialog). Called from the rightmost button. */
  readonly onSaveAll: () => void | Promise<void>;
  /** Disabled predicate for Save All: true when dirty set is
   *  empty OR another action is in-flight. */
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
  // Subscribe to the count of dirty paths in the store directly
  // (not via props) to keep re-render scope minimal. The dirty
  // count drives the Save All button's `is-dirty` class + tooltip.
  const dirtyPathsCount = useArxmlStore((s) => s.dirtyPaths.size);

  return (
    <>
      {/* Project Save button (leftmost in the action bar) — writes
          the `.autosarcfg.json` manifest. Tooltip explains when the
          action is blocked by other dirty files (matches the v1.16b
          T7 UX contract for the Save All sibling button). */}
      <button
        type="button"
        onClick={() => {
          void onProjectSave();
        }}
        disabled={!canSaveProject}
        className="app-btn app-btn-save"
        data-testid="btn-project-save"
        data-tour-id="app-save"
        title={
          projectDirtyCount > 0
            ? t(locale, 'app.project.saveBlockedDirty', {
                count: projectDirtyCount,
              })
            : undefined
        }
      >
        {t(locale, 'app.project.save')}
      </button>
      {/* ARXML Save button (middle) — writes the active ARXML
          file. Label switches between "Save" and "Save *" when the
          active doc is dirty (visual cue matches `is-dirty` class). */}
      <button
        type="button"
        onClick={() => {
          void onSave();
        }}
        disabled={!canSave}
        className={`app-btn app-btn-save ${isActiveDirty ? 'is-dirty' : ''}`}
        data-testid="btn-save"
      >
        {isActiveDirty ? t(locale, 'app.saveDirty') : t(locale, 'app.save')}
      </button>
      {/* Sprint 16b T7 — Save All button (rightmost). Loops dirty
          paths silently (no per-file dialog). Label previews the
          count when N > 0 so the user can see how many files will
          be touched; tooltip matches. Disabled when the set is
          empty OR another action is in-flight. The parent passes
          `canSaveAll` (which already accounts for `state.busy`
          during the loop) so the parent controls the disabled
          gate; this sub-component just renders. */}
      <button
        type="button"
        onClick={() => {
          void onSaveAll();
        }}
        disabled={!canSaveAll}
        className={`app-btn app-btn-save-all ${dirtyPathsCount > 0 ? 'is-dirty' : ''}`}
        data-testid="btn-save-all"
        title={
          dirtyPathsCount > 0
            ? t(locale, 'app.saveAllDirtyTitle', { count: dirtyPathsCount })
            : t(locale, 'app.saveAllTitle')
        }
      >
        {dirtyPathsCount > 0
          ? t(locale, 'app.saveAllDirty', { count: dirtyPathsCount })
          : t(locale, 'app.saveAll')}
      </button>
    </>
  );
}
