// RemoveModuleConfirmDialog — Sprint 17 P2.
//
// 4-option modal shown when the user requests a BSWMD-remove on a
// schema that has 1+ dependent value-side ARXML files. Mirrors the
// visual shell + module-level state pattern of CascadeConfirmDialog
// (Sprint 15) but the 4th option lets the user ALSO unlink the BSWMD
// file from disk on top of the cascade.
//
// Resolution semantics (returned by `confirmRemoveBswmd`):
//   - 'cancel'             — user backed out, no mutation applied
//   - 'only'               — drop BSWMD from project in-memory, leave
//                            the on-disk file alone, leave dependents
//                            dangling (validation will flag them as
//                            `schema-unknown`)
//   - 'cascade'            — drop BSWMD in-memory + delete each
//                            dependent value-side ARXML from disk
//                            (calls `project:deleteArxml` per
//                            dependent). BSWMD file stays on disk.
//   - 'cascade-and-unlink' — `cascade` + ALSO unlink the BSWMD file
//                            from disk (calls `bswmd:delete` IPC via
//                            the `removeBswmdFromDisk` store action
//                            added in Sprint 17 P1). The on-disk
//                            BSWMD file is gone; in-memory schema
//                            is captured into `lastRemoveSnapshot`
//                            so a single-level `undoLastRemoveBswmd`
//                            can restore the in-memory state.
//
// All three "exit" paths (Esc, backdrop click, Cancel button) resolve
// with `'cancel'` — the user has not committed to a destructive
// action. "Only remove" is the auto-focused default because it is
// the safest of the 3 destructive choices (no disk unlink, no
// cascade side effects on dependents).
//
// Design decision (Sprint 17 P1): kept separate from
// CascadeConfirmDialog (no extension of its 3-option union). The
// 'cascade' meaning diverges from the ECUC-container-delete case
// ("delete references") to "delete dependent ARXML files", so the
// 4th option's semantics (`cascade-and-unlink`) would overload the
// existing dialog's vocabulary.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { t } from '../../shared/i18n.js';
import { useArxmlStore } from '../store/useArxmlStore.js';

import './RemoveModuleConfirmDialog.css';

export type RemoveBswmdChoice =
  | 'cancel'
  | 'only'
  | 'cascade'
  | 'cascade-and-unlink';

/**
 * A single value-side ARXML that depends on the BSWMD the user is
 * about to remove. Surfaced verbatim in the dialog body so the
 * engineer can audit which files will be touched by the cascade.
 *
 * For the BSWMD-remove case, the only meaningful identifier is the
 * `filePath` — unlike the ECUC container-delete case, the dependent
 * is a whole ARXML, not a single `<REFERENCE-VALUES>` entry.
 */
export interface RemoveBswmdDependent {
  readonly filePath: string;
}

export interface RemoveBswmdConfirmOptions {
  readonly targetShortName: string;
  readonly dependents: readonly RemoveBswmdDependent[];
}

interface RemoveBswmdState {
  readonly options: RemoveBswmdConfirmOptions;
  readonly resolve: (value: RemoveBswmdChoice) => void;
}

let externalSetState: ((state: RemoveBswmdState | null) => void) | null = null;

/** Maximum number of dependents to render before truncating with a
 *  "... and N more" footer. Mirrors `CascadeConfirmDialog.MAX_REFS_VISIBLE`. */
const MAX_DEPS_VISIBLE = 10;

/**
 * Show the BSWMD-remove confirm dialog. Returns a promise that
 * resolves with the user's choice. If `RemoveModuleConfirmRoot` has
 * not mounted yet, the promise resolves immediately with `'cancel'`
 * — a safe fallback (BSWMD removal is destructive and must not
 * proceed without explicit user consent).
 */
export function confirmRemoveBswmd(
  options: RemoveBswmdConfirmOptions,
): Promise<RemoveBswmdChoice> {
  return new Promise<RemoveBswmdChoice>((resolve) => {
    if (externalSetState === null) {
      resolve('cancel');
      return;
    }
    externalSetState({ options, resolve });
  });
}

/**
 * Root-level component that renders the BSWMD-remove confirm dialog
 * when one is active. Mount once in the app root (alongside
 * CascadeConfirmRoot). Returns `null` when no dialog is active.
 */
export function RemoveModuleConfirmRoot(): JSX.Element | null {
  const [state, setState] = useState<RemoveBswmdState | null>(null);
  const locale = useArxmlStore((s) => s.locale);

  // Expose setState to the module-level `confirmRemoveBswmd()`
  // function. Mirrors the pattern in CascadeConfirmDialog.
  useEffect(() => {
    externalSetState = setState;
    return () => {
      externalSetState = null;
    };
  }, []);

  if (state === null) return null;

  const close = (choice: RemoveBswmdChoice): void => {
    setState(null);
    state.resolve(choice);
  };

  const handleCancel = (): void => close('cancel');
  const handleOnly = (): void => close('only');
  const handleCascade = (): void => close('cascade');
  const handleCascadeAndUnlink = (): void => close('cascade-and-unlink');

  // Backdrop click resolves with 'cancel' — same convention as the
  // other dialogs: clicking outside the dialog is treated as "I
  // didn't mean to commit". Clicks inside the dialog body must not
  // bubble, so we stopPropagation on the dialog itself.
  const handleBackdropClick = (): void => close('cancel');

  const handleDialogClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close('cancel');
    }
  };

  const titleId = 'remove-dialog-title';
  const messageId = 'remove-dialog-message';

  const { targetShortName, dependents } = state.options;
  const visibleDeps = dependents.slice(0, MAX_DEPS_VISIBLE);
  const hiddenCount = dependents.length - visibleDeps.length;
  const title = t(locale, 'confirm.removeBswmd.title', { name: targetShortName });
  const message = t(locale, 'confirm.removeBswmd.message', {
    name: targetShortName,
    count: dependents.length,
  });

  return createPortal(
    <div
      className="remove-overlay"
      data-testid="remove-overlay"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div
        className="remove-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onClick={handleDialogClick}
      >
        <div className="remove-dialog-header">
          <h2 id={titleId} data-testid="remove-title">
            {title}
          </h2>
        </div>
        <div className="remove-dialog-body">
          <div id={messageId} className="remove-message" data-testid="remove-message">
            {message}
          </div>
          <ul className="remove-deps" data-testid="remove-deps">
            {visibleDeps.map((dep, i) => (
              <li
                key={`${dep.filePath}::${i}`}
                className="remove-dep-item"
                data-testid="remove-dep-item"
              >
                <span className="remove-dep-file">{dep.filePath}</span>
              </li>
            ))}
          </ul>
          {hiddenCount > 0 ? (
            <div className="remove-more" data-testid="remove-more">
              {`... and ${hiddenCount} more`}
            </div>
          ) : null}
        </div>
        <div className="remove-dialog-footer">
          <button
            type="button"
            className="remove-btn remove-btn-cancel"
            data-testid="remove-cancel"
            onClick={handleCancel}
          >
            {t(locale, 'confirm.removeBswmd.cancel')}
          </button>
          <button
            type="button"
            className="remove-btn remove-btn-only"
            data-testid="remove-only"
            onClick={handleOnly}
            autoFocus
          >
            {t(locale, 'confirm.removeBswmd.only')}
          </button>
          <button
            type="button"
            className="remove-btn remove-btn-cascade"
            data-testid="remove-cascade"
            onClick={handleCascade}
          >
            {t(locale, 'confirm.removeBswmd.cascade')}
          </button>
          <button
            type="button"
            className="remove-btn remove-btn-cascadeAndUnlink"
            data-testid="remove-cascadeAndUnlink"
            onClick={handleCascadeAndUnlink}
          >
            {t(locale, 'confirm.removeBswmd.cascadeAndUnlink')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
