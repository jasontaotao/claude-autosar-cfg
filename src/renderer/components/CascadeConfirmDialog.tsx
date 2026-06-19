// CascadeConfirmDialog — Sprint 15 / Phase 3.3.
//
// 3-option modal shown when the user requests a delete-container on a node
// that has 1+ references pointing to it. Mirrors the visual shell +
// module-level state pattern used by ConfirmDialog and PromptDialog, but
// is intentionally a separate component (per design decision 5) because
// the choice semantics are different — the existing ConfirmDialog's
// `ConfirmChoice = 'continue' | 'discard' | 'saveAndProceed'` is reserved
// for dirty-guard flows and would be semantically overloaded if reused.
//
// Resolution semantics:
//   - 'cancel'   — user backed out, no mutation applied
//   - 'only'     — delete the container, leave references dangling
//                  (validation will flag them as `ref-unresolved`)
//   - 'cascade'  — delete the container AND every reference param that
//                  points to it
//
// All three "exit" paths (Esc, backdrop click, Cancel button) resolve
// with `'cancel'` — the user has not committed to a destructive action.
// "Only delete" is the auto-focused default because it is the safest of
// the two destructive choices (no cascading side effects).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { t } from '../../shared/i18n.js';
import { useArxmlStore } from '../store/useArxmlStore.js';

import './CascadeConfirmDialog.css';

export type CascadeChoice = 'cancel' | 'only' | 'cascade';

/**
 * A single cross-reference pointing to the container the user is about
 * to delete. Surfaced verbatim in the dialog body so the engineer can
 * audit which containers will lose (or keep) their ref link.
 */
export interface CascadeReference {
  readonly filePath: string;
  readonly containerPath: string;
  readonly paramKey: string;
}

export interface CascadeConfirmOptions {
  readonly targetShortName: string;
  readonly references: readonly CascadeReference[];
}

interface CascadeState {
  readonly options: CascadeConfirmOptions;
  readonly resolve: (value: CascadeChoice) => void;
}

let externalSetState: ((state: CascadeState | null) => void) | null = null;

/** Maximum number of references to render before truncating with a
 *  "... and N more" footer. Keeps the dialog from ballooning when a
 *  shared BSW buffer is referenced 50+ times. */
const MAX_REFS_VISIBLE = 10;

/**
 * Show the cascade confirm dialog. Returns a promise that resolves with
 * the user's choice. If `CascadeConfirmRoot` has not mounted yet, the
 * promise resolves immediately with `'cancel'` — a safe fallback
 * (delete operations must not proceed without explicit user consent).
 */
export function confirmCascade(options: CascadeConfirmOptions): Promise<CascadeChoice> {
  return new Promise<CascadeChoice>((resolve) => {
    if (externalSetState === null) {
      resolve('cancel');
      return;
    }
    externalSetState({ options, resolve });
  });
}

/**
 * Root-level component that renders the cascade confirm dialog when one
 * is active. Mount once in the app root (alongside ConfirmRoot and
 * PromptRoot). Returns `null` when no dialog is active.
 */
export function CascadeConfirmRoot(): JSX.Element | null {
  const [state, setState] = useState<CascadeState | null>(null);
  const locale = useArxmlStore((s) => s.locale);

  // Expose setState to the module-level `confirmCascade()` function.
  useEffect(() => {
    externalSetState = setState;
    return () => {
      externalSetState = null;
    };
  }, []);

  if (state === null) return null;

  const close = (choice: CascadeChoice): void => {
    setState(null);
    state.resolve(choice);
  };

  const handleCancel = (): void => close('cancel');
  const handleOnly = (): void => close('only');
  const handleCascade = (): void => close('cascade');

  // Backdrop click resolves with 'cancel' — same convention as the other
  // dialogs: clicking outside the dialog is treated as "I didn't mean
  // to commit". Clicks inside the dialog body must not bubble, so we
  // stopPropagation on the dialog itself.
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

  const titleId = 'cascade-dialog-title';
  const messageId = 'cascade-dialog-message';

  const { targetShortName, references } = state.options;
  const visibleRefs = references.slice(0, MAX_REFS_VISIBLE);
  const hiddenCount = references.length - visibleRefs.length;
  const title = t(locale, 'confirm.cascade.title', { name: targetShortName });
  const message = t(locale, 'confirm.cascade.message', {
    name: targetShortName,
    count: references.length,
  });

  return createPortal(
    <div
      className="cascade-overlay"
      data-testid="cascade-overlay"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div
        className="cascade-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onClick={handleDialogClick}
      >
        <div className="cascade-dialog-header">
          <h2 id={titleId} data-testid="cascade-title">
            {title}
          </h2>
        </div>
        <div className="cascade-dialog-body">
          <div id={messageId} className="cascade-message" data-testid="cascade-message">
            {message}
          </div>
          <ul className="cascade-refs" data-testid="cascade-refs">
            {visibleRefs.map((ref, i) => (
              <li
                key={`${ref.filePath}::${ref.containerPath}::${ref.paramKey}::${i}`}
                className="cascade-ref-item"
                data-testid="cascade-ref-item"
              >
                <span className="cascade-ref-file">{ref.filePath}</span>
                <span className="cascade-ref-sep"> &rsaquo; </span>
                <span className="cascade-ref-path">{ref.containerPath}</span>
                <span className="cascade-ref-sep"> . </span>
                <span className="cascade-ref-key">{ref.paramKey}</span>
              </li>
            ))}
          </ul>
          {hiddenCount > 0 ? (
            <div
              className="cascade-more"
              data-testid="cascade-more"
            >{`... and ${hiddenCount} more`}</div>
          ) : null}
        </div>
        <div className="cascade-dialog-footer">
          <button
            type="button"
            className="cascade-btn cascade-btn-cancel"
            data-testid="cascade-cancel"
            onClick={handleCancel}
          >
            {t(locale, 'confirm.cascade.cancel')}
          </button>
          <button
            type="button"
            className="cascade-btn cascade-btn-only"
            data-testid="cascade-only"
            onClick={handleOnly}
            autoFocus
          >
            {t(locale, 'confirm.cascade.only')}
          </button>
          <button
            type="button"
            className="cascade-btn cascade-btn-cascade"
            data-testid="cascade-cascade"
            onClick={handleCascade}
          >
            {t(locale, 'confirm.cascade.cascade')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
