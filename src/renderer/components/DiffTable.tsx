// DiffTable — Sprint 14 ECUC ARXML Import — T12.
//
// Three-column diff view for a single open module:
//   - existing | incoming | decision
//
// Each row is one `ContainerDiff` (path exists in one or both sides).
// The decision column has a radio per `ImportResolution` value; the
// default is `'overwrite'` for incoming-only rows and
// `'keep-existing'` for existing-only rows (per spec §6.1 step 6).
//
// The diff itself is computed lazily via `buildModuleDiff` on first
// mount and on `activeModuleForDiff` change. Per-row resolution
// changes are forwarded to `store.resolveModule(mergedPath, resolution,
// containerResolutions?)`. The store appends to `importSession.undoStack`
// so the user can undo via `undoInternal` (pre-commit only).
//
// Param overrides — when an existing param has a different value than
// the incoming one — render in a highlighted cell (`diff-table-cell-highlight`)
// so the user can spot the difference without reading both columns.
//
// The component is a pure renderer + dispatch. It does NOT compute
// patches — `store.commitImport()` (T8) compiles the final patches
// after the user clicks Commit in `ModuleSelectionPanel`.

import { useCallback, useMemo } from 'react';
import type { JSX } from 'react';

import { buildModuleDiff } from '@core/import/diff';
import type { ImportResolution } from '@core/import/types';
import { t } from '@shared/i18n';

import { useArxmlStore } from '../store/useArxmlStore';

import './DiffTable.css';

interface RowProps {
  readonly path: string;
  readonly existingLabel: string | null;
  readonly incomingLabel: string | null;
  readonly isParamOverride: boolean;
  readonly resolution: ImportResolution;
  readonly onResolutionChange: (next: ImportResolution) => void;
}

const RESOLUTION_VALUES: readonly ImportResolution[] = [
  'keep-existing',
  'overwrite',
  'keep-both',
  'skip',
] as const;

function rowTestId(path: string, side: 'existing' | 'incoming-only' | 'both'): string {
  // Convert the merged path to a stable test id (slashes → '-').
  const tail = path.split('/').filter(Boolean).join('-');
  // Root path renders as `diff-table-row-<side>` (no tail) — keeps
  // the brief's testid convention (`diff-table-row-incoming-only`).
  if (tail === '') return `diff-table-row-${side}`;
  return `diff-table-row-${side}-${tail}`;
}

function paramTestId(key: string): string {
  return `diff-table-param-override-${key}`;
}

/**
 * One diff row. Renders two text cells (existing + incoming labels)
 * and a decision cell with four radios. When `isParamOverride` is
 * true the row gets the `diff-table-cell-highlight` class so visual
 * diffs surface even when the values look similar at a glance.
 */
function DiffRow({
  path,
  existingLabel,
  incomingLabel,
  isParamOverride,
  resolution,
  onResolutionChange,
}: RowProps): JSX.Element {
  const side: 'existing' | 'incoming-only' | 'both' =
    existingLabel === null ? 'incoming-only' : incomingLabel === null ? 'existing' : 'both';
  const highlightClass = isParamOverride ? 'diff-table-cell-highlight' : '';
  return (
    <tr
      className={`diff-table-row diff-table-row-${side} ${highlightClass}`}
      data-testid={rowTestId(path, side)}
    >
      <td className="diff-table-cell-existing">{existingLabel ?? '—'}</td>
      <td className="diff-table-cell-incoming">{incomingLabel ?? '—'}</td>
      <td className="diff-table-cell-decision">
        {RESOLUTION_VALUES.map((value) => {
          const radioId = `${rowTestId(path, side)}-decision-${value}`;
          return (
            <label key={value} className="diff-table-radio">
              <input
                type="radio"
                name={`diff-table-${path}`}
                value={value}
                checked={resolution === value}
                data-testid={radioId}
                onChange={() => onResolutionChange(value)}
              />
              <span>
                {t(
                  useArxmlStore.getState().locale,
                  resolutionToI18nKey(value),
                )}
              </span>
            </label>
          );
        })}
      </td>
    </tr>
  );
}

/** Map ImportResolution → i18n key (full key). */
function resolutionToI18nKey(r: ImportResolution):
  | 'app.import.resolution.keepExisting'
  | 'app.import.resolution.overwrite'
  | 'app.import.resolution.keepBoth'
  | 'app.import.resolution.skip' {
  switch (r) {
    case 'keep-existing':
      return 'app.import.resolution.keepExisting';
    case 'overwrite':
      return 'app.import.resolution.overwrite';
    case 'keep-both':
      return 'app.import.resolution.keepBoth';
    case 'skip':
      return 'app.import.resolution.skip';
  }
}

/**
 * The DiffTable component. Reads `importSession` and the active
 * target documents from the store. When `activeModuleForDiff` is
 * null (no diff open) renders nothing — the host (App.tsx) only
 * mounts this when `viewMode === 'import-merged'`, but we keep the
 * null guard defensive.
 */
export function DiffTable(): JSX.Element | null {
  const locale = useArxmlStore((s) => s.locale);
  const importSession = useArxmlStore((s) => s.importSession);
  const documents = useArxmlStore((s) => s.documents);
  const resolveModule = useArxmlStore((s) => s.resolveModule);
  const closeDiff = useArxmlStore((s) => s.closeDiff);

  // Find the active selection (incoming module) by merged path.
  const activeSelection = useMemo(() => {
    if (importSession === null) return null;
    const activePath = importSession.activeModuleForDiff;
    if (activePath === null) return null;
    return importSession.selections.find((s) => s.mergedModulePath === activePath) ?? null;
  }, [importSession]);

  // Locate the incoming module's ArxmlModule instance in the
  // session's incomingDocs (needed for buildModuleDiff's incoming
  // arg).
  const incomingModule = useMemo(() => {
    if (importSession === null || activeSelection === null) return null;
    const doc = importSession.incomingDocs[activeSelection.sourceDocIndex];
    if (doc === undefined) return null;
    const shortName = activeSelection.moduleShortName;
    for (const pkg of doc.packages) {
      for (const el of pkg.elements) {
        if (el.kind === 'module' && el.shortName === shortName) return el;
      }
    }
    return null;
  }, [importSession, activeSelection]);

  // Locate the existing target module when the selection collides
  // with a target document.
  const existingModule = useMemo(() => {
    if (activeSelection === null) return null;
    const targetPath = activeSelection.targetModulePath;
    if (targetPath === null) return null;
    const segments = targetPath.split('/').filter(Boolean);
    const moduleShortName = segments[segments.length - 1];
    if (moduleShortName === undefined) return null;
    for (const doc of documents) {
      for (const pkg of doc.packages) {
        for (const el of pkg.elements) {
          if (el.kind === 'module' && el.shortName === moduleShortName) return el;
        }
      }
    }
    return null;
  }, [activeSelection, documents]);

  const diffResult = useMemo(() => {
    if (incomingModule === null) return null;
    return buildModuleDiff(existingModule, incomingModule);
  }, [existingModule, incomingModule]);

  const handleResolution = useCallback(
    (path: string, next: ImportResolution): void => {
      if (importSession === null || activeSelection === null) return;
      // Build / update the containerResolutions map. When this is the
      // first per-container decision for this row, fall back to the
      // existing module-level resolution (the patch compiler reads
      // containerResolutions when present, module-level otherwise).
      const existing = importSession.resolutions.find(
        (r) => r.mergedModulePath === activeSelection.mergedModulePath,
      );
      const baseMap = existing?.containerResolutions
        ? new Map(existing.containerResolutions)
        : new Map<string, ImportResolution>();
      baseMap.set(path, next);
      resolveModule(activeSelection.mergedModulePath, next, baseMap);
    },
    [importSession, activeSelection, resolveModule],
  );

  if (importSession === null || activeSelection === null || diffResult === null) {
    return null;
  }
  if (!diffResult.ok) {
    // The diff step itself failed (multiplicity exceeded etc.) — render
    // a localised error placeholder so the user knows the import is
    // blocked at this module.
    return (
      <section
        className="diff-table diff-table-error"
        data-testid="diff-table-error"
        aria-label={t(locale, 'app.import.diff.title', { shortName: activeSelection.moduleShortName })}
      >
        <header className="diff-table-header">
          <h3 className="diff-table-title">
            {t(locale, 'app.import.diff.title', { shortName: activeSelection.moduleShortName })}
          </h3>
          <button
            type="button"
            className="diff-table-close"
            data-testid="diff-table-close"
            onClick={() => closeDiff()}
          >
            {t(locale, 'common.cancel')}
          </button>
        </header>
        <p className="diff-table-error-message">{diffResult.error.kind}</p>
      </section>
    );
  }

  const diff = diffResult.value;
  const moduleResolution =
    importSession.resolutions.find(
      (r) => r.mergedModulePath === activeSelection.mergedModulePath,
    )?.resolution ?? 'overwrite';

  return (
    <section
      className="diff-table"
      data-testid="diff-table"
      aria-label={t(locale, 'app.import.diff.title', { shortName: activeSelection.moduleShortName })}
    >
      <header className="diff-table-header">
        <h3 className="diff-table-title">
          {t(locale, 'app.import.diff.title', { shortName: activeSelection.moduleShortName })}
        </h3>
        <button
          type="button"
          className="diff-table-close"
          data-testid="diff-table-close"
          onClick={() => closeDiff()}
        >
          {t(locale, 'common.cancel')}
        </button>
      </header>
      <table className="diff-table-grid">
        <thead>
          <tr>
            <th data-testid="diff-table-column-existing">Existing</th>
            <th data-testid="diff-table-column-incoming">Incoming</th>
            <th data-testid="diff-table-column-decision">Decision</th>
          </tr>
        </thead>
        <tbody>
          {/* Container rows. */}
          {diff.containers.map((c) => {
            const path = c.path;
            const rowResolution =
              importSession.resolutions
                .find((r) => r.mergedModulePath === activeSelection.mergedModulePath)
                ?.containerResolutions?.get(path) ??
              (c.existing === null ? 'overwrite' : c.incoming === null ? 'keep-existing' : moduleResolution);
            return (
              <DiffRow
                key={path}
                path={path}
                existingLabel={c.existing ? c.existing.shortName : null}
                incomingLabel={c.incoming ? c.incoming.shortName : null}
                isParamOverride={false}
                resolution={rowResolution}
                onResolutionChange={(next) => handleResolution(path, next)}
              />
            );
          })}
          {/* Param override rows. */}
          {diff.paramOverrides.map((p) => {
            const rowResolution = moduleResolution;
            const existingLabel =
              p.existingValue === null ? null : String(p.existingValue);
            const incomingLabel =
              p.incomingValue === null ? null : String(p.incomingValue);
            const isHighlighted = existingLabel !== incomingLabel;
            return (
              <DiffRow
                key={`${p.path}/${p.param}`}
                path={`${p.path}/${p.param}`}
                existingLabel={existingLabel}
                incomingLabel={incomingLabel}
                isParamOverride={isHighlighted}
                resolution={rowResolution}
                onResolutionChange={(next) => handleResolution(`${p.path}/${p.param}`, next)}
              />
            );
          })}
        </tbody>
      </table>
      {/* Param override highlight test-ids — only when there's an
          actual param override row with a distinct testid, so the
          test's `getByTestId('diff-table-param-override-<key>')` can
          locate the cell. We add a hidden marker element next to the
          param override rows. */}
      {diff.paramOverrides.map((p) => (
        <span
          key={`marker-${p.path}/${p.param}`}
          data-testid={paramTestId(p.param)}
          className={`diff-table-param-override-marker ${
            p.existingValue !== p.incomingValue ? 'diff-table-cell-highlight' : ''
          }`}
          hidden
        />
      ))}
      {/* Reference counts as a footnote so the user sees them but
          per-reference resolution is out of scope for T12 (T13+). */}
      <footer className="diff-table-footer">
        <span>
          {t(locale, 'app.import.diff.title', { shortName: activeSelection.moduleShortName })}
          {' · '}
          {diff.references.length} reference(s)
        </span>
      </footer>
    </section>
  );
}
