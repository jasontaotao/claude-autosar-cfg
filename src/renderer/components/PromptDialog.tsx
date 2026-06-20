// PromptDialog — Electron-safe replacement for window.prompt().
//
// In Electron with `contextIsolation: true`, `window.prompt()` is silently
// disabled (returns null immediately). This module provides a promise-based
// `prompt()` function that renders a minimal modal dialog via React and
// resolves with the user's input string, or `null` on cancel.
//
// Sprint 17a — the Cancel / OK button labels are now locale-reactive.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { t } from '@shared/i18n';

import { useArxmlStore } from '../store/useArxmlStore';

import './PromptDialog.css';

export interface PromptOptions {
  readonly message: string;
  readonly defaultValue?: string;
}

interface PromptState {
  readonly options: PromptOptions;
  readonly resolve: (value: string | null) => void;
}

let externalSetState: ((state: PromptState | null) => void) | null = null;

/**
 * Show a prompt dialog. Returns a promise that resolves with the user's
 * input string, or `null` if the user cancels or closes the dialog.
 *
 * This is the Electron-safe equivalent of `window.prompt()`.
 */
export function prompt(options: PromptOptions): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    if (externalSetState === null) {
      // PromptRoot hasn't mounted yet — fall back to null.
      resolve(null);
      return;
    }
    externalSetState({ options, resolve });
  });
}

/**
 * Root-level component that renders the prompt dialog when one is active.
 * Mount once in the app root (e.g. inside `App`).
 */
export function PromptRoot(): JSX.Element | null {
  const [state, setState] = useState<PromptState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Subscribe to locale so the Cancel / OK labels re-render when the
  // user toggles the language mid-modal.
  const locale = useArxmlStore((s) => s.locale);

  // Expose setState to the module-level `prompt()` function.
  useEffect(() => {
    externalSetState = setState;
    return () => {
      externalSetState = null;
    };
  }, []);

  // Auto-focus the input when the dialog opens.
  useEffect(() => {
    if (state !== null) {
      // Defer to next frame so the DOM node is painted.
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [state]);

  if (state === null) return null;

  const handleConfirm = (): void => {
    const value = inputRef.current?.value ?? '';
    const resolved = value.trim().length > 0 ? value.trim() : null;
    setState(null);
    state.resolve(resolved);
  };

  const handleCancel = (): void => {
    setState(null);
    state.resolve(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  return createPortal(
    <div className="prompt-overlay" data-testid="prompt-overlay">
      <div className="prompt-dialog" role="dialog" aria-modal="true">
        <label className="prompt-label">{state.options.message}</label>
        <input
          ref={inputRef}
          type="text"
          className="prompt-input"
          defaultValue={state.options.defaultValue ?? ''}
          onKeyDown={handleKeyDown}
          data-testid="prompt-input"
        />
        <div className="prompt-actions">
          <button
            type="button"
            className="prompt-btn prompt-btn-cancel"
            onClick={handleCancel}
            data-testid="prompt-cancel"
          >
            {t(locale, 'prompt.cancel')}
          </button>
          <button
            type="button"
            className="prompt-btn prompt-btn-confirm"
            onClick={handleConfirm}
            data-testid="prompt-confirm"
          >
            {t(locale, 'prompt.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
