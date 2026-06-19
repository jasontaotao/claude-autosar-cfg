// ModuleFromBswmdPicker — Sprint 14 / Task 10.
//
// Multi-select picker for choosing 1+ modules across 1+ loaded BSWMD
// files to instantiate as new ECUC ARXML skeletons. Host owns the
// `open` / `onConfirm` / `onClose` lifecycle; the dialog reads
// `useArxmlStore.bswmdSchemas` + `bswmdPaths` (parallel arrays, indexed
// by position) and renders a per-BSWMD tree of checkboxes.
//
// Selection model: `Set<key>` where `key = ${bswmdPath}::${moduleShortName}`.
// This is the same shape `resolveCollisionFilename` (T3) uses internally,
// which means the map the parent computes with `resolveCollisionFilename`
// for the right pane lines up directly with the `selectedPicks` array we
// pass to `onConfirm`.
//
// Disabled modules (`BswmdDocument.disabledModules`) are filtered out via
// `getActiveModules` (T4). When a host pre-selects a specific BSWMD via
// `preSelectedBswmdPath`, every module from that BSWMD is checked on
// mount so the user can directly hit Confirm after opening from a
// ProjectPanel "+" button (Scene ② in the mockup).
//
// Collision UX: when 2+ BSWMDs declare the same `moduleShortName` and
// both are selected, the i18n `ecuc.fromBswmd.collisionWarn` message
// surfaces in the right pane. The actual filename suffixing happens in
// `resolveCollisionFilename` — we just visualise the warning here.
//
// z-index 9994 — sits BELOW BswmdPickerDialog (9995), CascadeConfirmDialog
// (9996), and ConfirmDialog (9998) so any of those can override an open
// BSWMD picker.

import { useEffect, useMemo, useState, type JSX } from 'react';
import { createPortal } from 'react-dom';

import { resolveCollisionFilename } from '@core/arxml/skeleton.js';
import type { PickedModule } from '@core/arxml/skeleton.js';
import { getActiveModules } from '@core/project/bswmd.js';
import { t } from '@shared/i18n.js';

import { useArxmlStore } from '../store/useArxmlStore.js';

import './ModuleFromBswmdPicker.css';

interface Props {
  readonly open: boolean;
  readonly projectDir: string;
  readonly onConfirm: (picks: readonly PickedModule[]) => void;
  readonly onClose: () => void;
  /**
   * Optional BSWMD path whose modules should be pre-checked on mount.
   * Used when the dialog is opened from a ProjectPanel "+" button so the
   * user lands inside the right BSWMD without having to scroll.
   */
  readonly preSelectedBswmdPath?: string;
}

/**
 * Stable, collision-safe identifier for a (bswmdPath, moduleShortName)
 * pair. Matches the key shape used by `resolveCollisionFilename`.
 */
function pickKey(p: PickedModule): string {
  return `${p.bswmdPath}::${p.moduleShortName}`;
}

export function ModuleFromBswmdPicker({
  open,
  projectDir,
  onConfirm,
  onClose,
  preSelectedBswmdPath,
}: Props): JSX.Element | null {
  const bswmdSchemas = useArxmlStore((s) => s.bswmdSchemas);
  const bswmdPaths = useArxmlStore((s) => s.bswmdPaths);
  const documents = useArxmlStore((s) => s.documents);
  const locale = useArxmlStore((s) => s.locale);

  // Sprint 16 — set-semantic pre-seed. Walk every loaded document and
  // pre-check the (bswmdPath, moduleShortName) tuples that already have
  // an ECUC instance in the project. Unchecking such a row will mark
  // it for exclusion on Confirm; checking a previously-absent row
  // marks it for generation. `preSelectedBswmdPath` (when supplied by
  // the host) further seeds every active module from that BSWMD so a
  // user opening the picker from a ProjectPanel "+" lands inside it.
  const [selected, setSelected] = useState<Set<string>>(() => {
    const seeds = new Set<string>();
    for (const doc of documents) {
      if (doc.sourceBswmdPath === undefined) continue;
      const moduleEl = doc.packages[0]?.elements[0];
      if (moduleEl?.kind !== 'module') continue;
      seeds.add(pickKey({ bswmdPath: doc.sourceBswmdPath, moduleShortName: moduleEl.shortName }));
    }
    if (preSelectedBswmdPath !== undefined) {
      const idx = bswmdPaths.indexOf(preSelectedBswmdPath);
      const schema = idx >= 0 ? bswmdSchemas[idx] : undefined;
      if (schema !== undefined) {
        for (const m of getActiveModules(schema)) {
          seeds.add(pickKey({ bswmdPath: preSelectedBswmdPath, moduleShortName: m.shortName }));
        }
      }
    }
    return seeds;
  });
  const [filter, setFilter] = useState('');

  // If `preSelectedBswmdPath` changes mid-flight (rare — host usually
  // re-opens), reseed. We intentionally keep this off the normal
  // render path so user-driven check toggles aren't overwritten.
  useEffect(() => {
    if (preSelectedBswmdPath === undefined) return;
    const idx = bswmdPaths.indexOf(preSelectedBswmdPath);
    const schema = idx >= 0 ? bswmdSchemas[idx] : undefined;
    if (schema === undefined) return;
    setSelected((prev) => {
      // Add the new pre-selection seeds; preserve any existing checks
      // outside the target BSWMD.
      const next = new Set(prev);
      for (const m of getActiveModules(schema)) {
        next.add(pickKey({ bswmdPath: preSelectedBswmdPath, moduleShortName: m.shortName }));
      }
      return next;
    });
  }, [preSelectedBswmdPath, bswmdPaths, bswmdSchemas]);

  // Enumerate (bswmdPath, moduleShortName) pairs across all BSWMDs,
  // applying the disabled-module filter (`getActiveModules`) and the
  // substring filter. Order matches `bswmdPaths` order so the UI
  // grouping is stable.
  const allPicks = useMemo<readonly PickedModule[]>(() => {
    const lowerFilter = filter.toLowerCase();
    const out: PickedModule[] = [];
    bswmdPaths.forEach((bp, idx) => {
      const schema = bswmdSchemas[idx];
      if (schema === undefined) return;
      for (const m of getActiveModules(schema)) {
        if (
          lowerFilter !== '' &&
          !m.shortName.toLowerCase().includes(lowerFilter) &&
          !m.path.toLowerCase().includes(lowerFilter)
        ) {
          continue;
        }
        out.push({ bswmdPath: bp, moduleShortName: m.shortName });
      }
    });
    return out;
  }, [bswmdSchemas, bswmdPaths, filter]);

  // Subset of `allPicks` the user has checked.
  const selectedPicks = useMemo(
    () => allPicks.filter((p) => selected.has(pickKey(p))),
    [allPicks, selected],
  );

  // Collision resolution: same logic the parent will use downstream to
  // pick filenames. We compute it here so the right pane can show the
  // final write target.
  const collisionMap = useMemo(
    () => resolveCollisionFilename(selectedPicks, projectDir),
    [selectedPicks, projectDir],
  );

  // A collision exists when the user has selected 2+ picks sharing a
  // `moduleShortName` (i.e. one module picked across 2+ BSWMDs).
  const hasCollision = useMemo(() => {
    const seen = new Set<string>();
    for (const p of selectedPicks) {
      if (seen.has(p.moduleShortName)) return true;
      seen.add(p.moduleShortName);
    }
    return false;
  }, [selectedPicks]);

  if (!open) return null;

  const handleBackdropClick = (): void => {
    onClose();
  };

  const handleDialogClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();
  };

  const handleOverlayKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleToggle = (p: PickedModule, checked: boolean): void => {
    const key = pickKey(p);
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const handleConfirm = (): void => {
    if (selectedPicks.length === 0) return;
    onConfirm(selectedPicks);
  };

  return createPortal(
    <div
      className="mfbp-overlay"
      data-testid="mfbp-overlay"
      onClick={handleBackdropClick}
      onKeyDown={handleOverlayKeyDown}
    >
      <div
        className="mfbp-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t(locale, 'ecuc.fromBswmd.menu')}
        onClick={handleDialogClick}
      >
        <div className="mfbp-header">
          <div>
            <h2 className="mfbp-title">{t(locale, 'ecuc.fromBswmd.menu')}</h2>
            <div className="mfbp-subtitle">
              {t(locale, 'ecuc.fromBswmd.willCreate')} → <code>{projectDir}/</code>
            </div>
          </div>
          <button
            type="button"
            className="mfbp-close"
            data-testid="mfbp-close"
            aria-label="close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="mfbp-body">
          <div className="mfbp-left">
            <input
              type="search"
              className="mfbp-filter"
              data-testid="mfbp-filter"
              placeholder={t(locale, 'ecuc.fromBswmd.filter')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <div className="mfbp-groups">
              {bswmdPaths.map((bp, idx) => {
                const schema = bswmdSchemas[idx];
                if (schema === undefined) return null;
                const activeModules = getActiveModules(schema);
                const lowerFilter = filter.toLowerCase();
                const visible = activeModules.filter(
                  (m) =>
                    lowerFilter === '' ||
                    m.shortName.toLowerCase().includes(lowerFilter) ||
                    m.path.toLowerCase().includes(lowerFilter),
                );
                if (visible.length === 0 && lowerFilter !== '') return null;
                return (
                  <details key={bp} className="mfbp-group" open>
                    <summary className="mfbp-group-header">
                      <span className="mfbp-group-filename">
                        {bp.split(/[\\/]/).pop() ?? bp}
                      </span>
                      <span className="mfbp-group-count">
                        {visible.length}/{activeModules.length}
                      </span>
                    </summary>
                    <ul className="mfbp-rows">
                      {visible.map((m) => {
                        const p: PickedModule = { bswmdPath: bp, moduleShortName: m.shortName };
                        const key = pickKey(p);
                        const checked = selected.has(key);
                        return (
                          <li key={key} className="mfbp-row">
                            <label className="mfbp-row-label">
                              <input
                                type="checkbox"
                                aria-label={m.shortName}
                                data-testid={`mfbp-row-${m.shortName}`}
                                checked={checked}
                                onChange={(e) => handleToggle(p, e.target.checked)}
                              />
                              <span className="mfbp-row-name">{m.shortName}</span>
                              <span className="mfbp-row-path">{m.path}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                );
              })}
            </div>
          </div>
          <div className="mfbp-right">
            <div className="mfbp-summary">
              <strong>{t(locale, 'ecuc.fromBswmd.selectedCount', { count: selectedPicks.length })}</strong>
            </div>
            {hasCollision && (
              <div className="mfbp-collision" data-testid="mfbp-collision">
                <span className="mfbp-collision-icon">⚠</span>
                <span>{t(locale, 'ecuc.fromBswmd.collisionWarn')}</span>
              </div>
            )}
            {selectedPicks.length > 0 && (
              <>
                <p
                  className="mfbp-output-hint"
                  data-testid="ecuc-output-dir-hint"
                >
                  {t(locale, 'ecuc.fromBswmd.outputDir', { dir: 'ecuc' })}
                </p>
                <h3 className="mfbp-section-title">{t(locale, 'ecuc.fromBswmd.willCreate')}</h3>
                <ul className="mfbp-files" data-testid="mfbp-files">
                  {selectedPicks.map((p) => (
                    <li key={pickKey(p)}>
                      <code>{collisionMap.get(pickKey(p))}</code>
                    </li>
                  ))}
                </ul>
                <div className="mfbp-target">
                  {t(locale, 'ecuc.fromBswmd.targetDir')}: <code>{projectDir}/</code>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="mfbp-footer">
          <button
            type="button"
            className="mfbp-btn mfbp-btn-cancel"
            data-testid="mfbp-cancel"
            onClick={onClose}
          >
            {t(locale, 'common.cancel')}
          </button>
          <button
            type="button"
            className="mfbp-btn mfbp-btn-confirm"
            data-testid="mfbp-confirm"
            disabled={selectedPicks.length === 0}
            onClick={handleConfirm}
          >
            {t(locale, 'ecuc.fromBswmd.createN', { count: selectedPicks.length })}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}