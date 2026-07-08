// ConfirmDialog2 — 2-button modal for destructive yes/no confirms
// (Sprint ... v1.36.0 MINOR T4).
//
// Pattern mirrors the v1.x ConfirmDialog (Sprint 12 #3): module-level
// `externalSetState` + promise resolve. The host component mounts once
// at the app root. Calling `confirmDestructive(options)` shows a
// 2-button modal and resolves with the user's choice.
//
// 2-button shape is intentionally distinct from the existing
// 3-button ConfirmDialog (continue/discard/saveAndProceed for
// unsaved-changes). Lesson: confirm-dialogs-serve-different-scenarios
// — 3-button (unsaved-changes) and 2-button (destructive yes/no) are
// different UI patterns; don't force one API.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { t } from '@shared/i18n/index.js';

import { useArxmlStore } from '../store/useArxmlStore';

import './ConfirmDialog2.css';

export type DestructiveChoice = 'confirm' | 'cancel';

export interface ConfirmDestructiveOptions {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
}

interface ConfirmState {
  readonly options: ConfirmDestructiveOptions;
  readonly resolve: (value: DestructiveChoice) => void;
}

let externalSetState: ((state: ConfirmState | null) => void) | null = null;

/**
 * Show a destructive confirm dialog. Returns a promise that resolves
 * with the user's choice.
 *
 * Esc / × / backdrop click all resolve with 'cancel' — the user has
 * not committed to a destructive action.
 *
 * If `ConfirmRoot2` has not mounted yet, the promise resolves
 * immediately with 'cancel'. This is intentionally a safe fallback
 * (do not destroy user data).
 */
export function confirmDestructive(options: ConfirmDestructiveOptions): Promise<DestructiveChoice> {
  return new Promise<DestructiveChoice>((resolve) => {
    if (externalSetState === null) {
      resolve('cancel');
      return;
    }
    externalSetState({ options, resolve });
  });
}

/**
 * Root-level component that renders the destructive confirm dialog
 * when one is active. Mount once in the app root (e.g. inside `App`).
 */
export function ConfirmRoot2(): JSX.Element | null {
  const [state, setState] = useState<ConfirmState | null>(null);
  const locale = useArxmlStore((s) => s.locale);

  useEffect(() => {
    externalSetState = setState;
    return () => {
      externalSetState = null;
    };
  }, []);

  if (state === null) return null;

  const close = (choice: DestructiveChoice): void => {
    setState(null);
    state.resolve(choice);
  };

  const handleConfirm = (): void => close('confirm');
  const handleCancel = (): void => close('cancel');
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

  const titleId = 'confirm-destructive-title';
  // Default labels resolved via t() — can be overridden by options.
  const confirmLabel =
    state.options.confirmLabel ?? t(locale, 'dcmConfig.generateNew.confirm.confirm');
  const cancelLabel =
    state.options.cancelLabel ?? t(locale, 'dcmConfig.generateNew.confirm.cancel');

  return createPortal(
    <div
      className="confirm-destructive-overlay"
      data-testid="confirm-destructive-overlay"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div
        className="confirm-destructive-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={handleDialogClick}
      >
        <div className="confirm-destructive-header">
          <h2 id={titleId} data-testid="confirm-destructive-title">
            {state.options.title}
          </h2>
          <button
            type="button"
            className="confirm-destructive-close"
            aria-label="close"
            data-testid="confirm-destructive-close"
            onClick={handleCancel}
          >
            ✕
          </button>
        </div>
        <div className="confirm-destructive-body">
          <div className="confirm-destructive-message" data-testid="confirm-destructive-message">
            {state.options.message}
          </div>
        </div>
        <div className="confirm-destructive-footer">
          <button
            type="button"
            className="confirm-destructive-btn confirm-destructive-btn-cancel"
            data-testid="confirm-destructive-cancel"
            onClick={handleCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="confirm-destructive-btn confirm-destructive-btn-danger"
            data-testid="confirm-destructive-confirm"
            onClick={handleConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
