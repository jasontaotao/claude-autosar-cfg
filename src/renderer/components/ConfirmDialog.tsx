// ConfirmDialog — self-contained modal for unsaved-changes protection
// (Sprint 12 #3 Task 6).
//
// Pattern mirrors PromptDialog (Sprint 12 #2): module-level
// `externalSetState` + promise resolve. The host component mounts once
// at the app root. Calling `confirm(options)` shows a 3-button modal
// and resolves with the user's choice. Esc, backdrop click, and the ×
// close button all resolve with 'continue' — the user has not committed
// to a destructive action.
//
// Sprint 17a — the default button labels are now locale-reactive.
// `ConfirmRoot` subscribes to `useArxmlStore((s) => s.locale)` and
// resolves the default labels via `t(locale, ...)`. Custom labels
// passed in `ConfirmOptions` still override the defaults (the
// per-action dirty-guard in `useProjectActions` keeps using the
// existing `confirm.unsaved.saveAndNew.<action>` keys without change).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { t } from '@shared/i18n';

import { useArxmlStore } from '../store/useArxmlStore';

import './ConfirmDialog.css';

export type ConfirmChoice = 'continue' | 'discard' | 'saveAndProceed';

export interface ConfirmOptions {
  readonly title: string;
  readonly message: string;
  readonly continueLabel?: string;
  readonly discardLabel?: string;
  readonly saveLabel?: string;
}

interface ConfirmState {
  readonly options: ConfirmOptions;
  readonly resolve: (value: ConfirmChoice) => void;
}

let externalSetState: ((state: ConfirmState | null) => void) | null = null;

/**
 * Resolve the default button labels for the given locale. The
 * i18n bundle values for the 3 default keys are identical to the
 * previous hardcoded constants (so the existing zh-CN tests
 * continue to pass without change); the en values are the canonical
 * English strings.
 */
function defaultLabels(locale: 'zh-CN' | 'en'): {
  continue: string;
  discard: string;
  save: string;
} {
  return {
    continue: t(locale, 'confirm.unsaved.continue'),
    discard: t(locale, 'confirm.unsaved.discard'),
    save: t(locale, 'confirm.unsaved.saveAndNew'),
  };
}

/**
 * Show a confirm dialog. Returns a promise that resolves with the user's
 * choice (`'continue'`, `'discard'`, or `'saveAndProceed'`).
 *
 * Esc / backdrop click / × button resolve with `'continue'` — interpreted
 * as "用户期望不动" (the user has not committed to a destructive action).
 *
 * If `ConfirmRoot` has not mounted yet, the promise resolves immediately
 * with `'continue'`. This is intentionally a safe fallback (do not destroy
 * user data) — the host should be mounted before any switching action is
 * triggered.
 */
export function confirm(options: ConfirmOptions): Promise<ConfirmChoice> {
  return new Promise<ConfirmChoice>((resolve) => {
    if (externalSetState === null) {
      resolve('continue');
      return;
    }
    externalSetState({ options, resolve });
  });
}

/**
 * Root-level component that renders the confirm dialog when one is active.
 * Mount once in the app root (e.g. inside `App`).
 */
export function ConfirmRoot(): JSX.Element | null {
  const [state, setState] = useState<ConfirmState | null>(null);
  // Subscribe to locale so default labels re-render when the user
  // toggles the language mid-modal.
  const locale = useArxmlStore((s) => s.locale);

  // Expose setState to the module-level `confirm()` function.
  useEffect(() => {
    externalSetState = setState;
    return () => {
      externalSetState = null;
    };
  }, []);

  if (state === null) return null;

  const close = (choice: ConfirmChoice): void => {
    setState(null);
    state.resolve(choice);
  };

  const handleContinue = (): void => close('continue');
  const handleDiscard = (): void => close('discard');
  const handleSave = (): void => close('saveAndProceed');

  // Backdrop click only — clicks inside the dialog body should not
  // bubble here because we stopPropagation on the dialog itself.
  const handleBackdropClick = (): void => close('continue');

  const handleDialogClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close('continue');
    }
  };

  const titleId = 'confirm-dialog-title';
  const labels = defaultLabels(locale);

  return createPortal(
    <div
      className="confirm-overlay"
      data-testid="confirm-overlay"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={handleDialogClick}
      >
        <div className="confirm-dialog-header">
          <h2 id={titleId} data-testid="confirm-title">
            {state.options.title}
          </h2>
          <button
            type="button"
            className="confirm-dialog-close"
            aria-label="close"
            data-testid="confirm-close"
            onClick={handleContinue}
          >
            ✕
          </button>
        </div>
        <div className="confirm-dialog-body">
          <div className="confirm-message" data-testid="confirm-message">
            {state.options.message}
          </div>
        </div>
        <div className="confirm-dialog-footer">
          <button
            type="button"
            className="confirm-btn confirm-btn-cancel"
            data-testid="confirm-continue"
            onClick={handleContinue}
          >
            {state.options.continueLabel ?? labels.continue}
          </button>
          <button
            type="button"
            className="confirm-btn confirm-btn-danger"
            data-testid="confirm-discard"
            onClick={handleDiscard}
          >
            {state.options.discardLabel ?? labels.discard}
          </button>
          <button
            type="button"
            className="confirm-btn confirm-btn-create"
            data-testid="confirm-saveAndProceed"
            onClick={handleSave}
          >
            {state.options.saveLabel ?? labels.save}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
