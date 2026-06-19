// ModuleSelectionPanel — Sprint 14 ECUC ARXML Import — T11.
//
// One row per incoming ECUC module. Each row shows:
//   - the source file (the import the module came from)
//   - the module shortName (clickable label)
//   - a collision badge when the same shortName already exists in any
//     of the loaded target documents
//   - a checkbox bound to store.selectModule(mergedPath, selected)
//
// The Commit button at the bottom is enabled iff ≥1 row is selected.
// Click → store.commitImport() (which itself is a no-op when no
// modules are selected, so the disabled-state guard is the friendly
// UX layer on top of the store-side guard).
//
// The Cancel button clears the session via store.cancelImport —
// spec §6.3 mandates that Cancel does NOT pop a confirm dialog
// ("退出不弹 confirm"). The user can re-enter the import flow from
// the [Import…] button if they cancelled by accident.

import { useCallback } from 'react';
import type { JSX } from 'react';

import { t } from '@shared/i18n';

import { useArxmlStore } from '../store/useArxmlStore';

import './ModuleSelectionPanel.css';

interface RowProps {
  readonly mergedPath: string;
  readonly moduleShortName: string;
  readonly sourceFile: string;
  readonly selected: boolean;
  readonly collidesWithTarget: boolean;
  readonly onToggle: (next: boolean) => void;
}

/**
 * One row of the selection table. Kept inline (rather than extracted)
 * because the panel is itself narrow — a single map call. Each row
 * carries three `data-testid` hooks the tests pin against:
 * `module-selection-row` (whole row), `module-selection-checkbox`
 * (the toggle), `module-selection-collision-badge` (the ⚠ badge,
 * only mounted when the row collides).
 */
function SelectionRow({
  mergedPath,
  moduleShortName,
  sourceFile,
  selected,
  collidesWithTarget,
  onToggle,
}: RowProps): JSX.Element {
  const collision = collidesWithTarget ? (
    <span
      className="module-selection-collision-badge"
      data-testid="module-selection-collision-badge"
      title={mergedPath}
    >
      {t(useArxmlStore.getState().locale, 'app.import.collision.badge')}
    </span>
  ) : null;
  return (
    <li className="module-selection-row" data-testid="module-selection-row">
      <label className="module-selection-row-label">
        <input
          type="checkbox"
          className="module-selection-checkbox"
          data-testid="module-selection-checkbox"
          checked={selected}
          onChange={(e) => onToggle(e.currentTarget.checked)}
        />
        <span className="module-selection-row-name">{moduleShortName}</span>
        <span className="module-selection-row-source">{sourceFile}</span>
        {collision}
      </label>
    </li>
  );
}

/**
 * The panel. Reads `importSession` from the store; when null (no
 * import in flight) renders nothing — the host (App.tsx) only
 * mounts this when `viewMode === 'import-merged'` so the null branch
 * is mostly defensive.
 */
export function ModuleSelectionPanel(): JSX.Element | null {
  const locale = useArxmlStore((s) => s.locale);
  const importSession = useArxmlStore((s) => s.importSession);
  const selectModule = useArxmlStore((s) => s.selectModule);
  const cancelImport = useArxmlStore((s) => s.cancelImport);
  const commitImport = useArxmlStore((s) => s.commitImport);

  const handleToggle = useCallback(
    (mergedPath: string, next: boolean): void => {
      selectModule(mergedPath, next);
    },
    [selectModule],
  );

  const handleCommit = useCallback((): void => {
    const result = commitImport();
    // commitImport is a pure sync function — we forward success
    // via the store's setError field so the existing ErrorBanner
    // renders the toast. No additional handler needed.
    if (!result.ok) {
      const kind = result.error.kind;
      if (kind === 'no-modules-selected') {
        // Shouldn't happen because the button is disabled, but
        // defensively surface if the store ever returns it.
        const state = useArxmlStore.getState();
        state.setError(t(state.locale, 'app.import.error.noModulesSelected'));
      }
      // patch-apply-failed is already surfaced via store.setError
      // inside commitImport — no extra work here.
    }
  }, [commitImport]);

  const handleCancel = useCallback((): void => {
    cancelImport();
  }, [cancelImport]);

  if (importSession === null) return null;

  const selectedCount = importSession.selections.filter((s) => s.selected).length;
  const canCommit = selectedCount > 0;

  return (
    <section
      className="module-selection-panel"
      data-testid="module-selection-panel"
      aria-label={t(locale, 'app.import.moduleSelection.title')}
    >
      <header className="module-selection-header">
        <h2 className="module-selection-title">{t(locale, 'app.import.moduleSelection.title')}</h2>
      </header>
      <ul className="module-selection-rows">
        {importSession.selections.map((sel) => {
          const sourceFile = importSession.originalPaths[sel.sourceDocIndex] ?? '(unknown)';
          return (
            <SelectionRow
              key={sel.mergedModulePath}
              mergedPath={sel.mergedModulePath}
              moduleShortName={sel.moduleShortName}
              sourceFile={sourceFile}
              selected={sel.selected}
              collidesWithTarget={sel.collidesWithTarget}
              onToggle={(next) => handleToggle(sel.mergedModulePath, next)}
            />
          );
        })}
      </ul>
      <footer className="module-selection-footer">
        <button
          type="button"
          className="module-selection-cancel"
          data-testid="module-selection-cancel"
          onClick={handleCancel}
        >
          {t(locale, 'common.cancel')}
        </button>
        <button
          type="button"
          className="module-selection-commit"
          data-testid="module-selection-commit"
          disabled={!canCommit}
          onClick={handleCommit}
        >
          {t(locale, 'app.import.commit.confirm', {
            N: selectedCount,
            M: importSession.incomingDocs.length,
          })}
        </button>
      </footer>
    </section>
  );
}
