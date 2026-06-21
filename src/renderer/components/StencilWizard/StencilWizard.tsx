// StencilWizard (v1.8.0 K Stencil Wizard — Task 6).
//
// Renderer modal that lets the user invoke the wizard from the UI.
// Lifts local state for `family` / `mode` / `gate`, composes the
// three sub-components, and on Generate invokes the IPC channel
// `stencil:generate:v1`. The actual save-to-disk flow lives in a
// later polish task (Task 12) — Task 6 just generates the XML
// string and shows a toast so the wiring is testable end-to-end.
//
// IPC: this modal calls `window.electron.ipcRenderer.invoke` directly
// because Task 6 explicitly does not modify the preload bridge. The
// production renderer must install a thin preload wrapper that
// exposes `stencilGenerate(req)` via `window.autosarApi` (planned
// for Task 7). Until then the modal is reachable from tests
// (where the stub is installed in beforeEach) but a real
// user-facing trigger has not been wired.
//
// Accessibility: mirrors `NewProjectDialog`'s modal shell —
// `role="dialog"` + `aria-modal="true"` + `aria-labelledby` on the
// dialog, `role="presentation"` on the backdrop, Esc / backdrop /
// ×-button all resolve with `onClose()`. Focus trap is a Task 12
// polish item; the dialog body starts with the family picker which
// is keyboard-reachable.

import { useState } from 'react';
import { createPortal } from 'react-dom';

import type { Locale } from '@shared/i18n';
import { t } from '@shared/i18n';

import type { StencilFamily, StencilMode, StencilRequest, StencilResponse } from '../../../main/stencil/types.js';
import { IPC_CHANNELS } from '../../../shared/ipc-contract.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';

import { FamilyPicker } from './FamilyPicker.js';
import { GateToggle } from './GateToggle.js';
import { ModeToggle } from './ModeToggle.js';

interface StencilWizardProps {
  readonly onClose: () => void;
}

/**
 * Type-narrowed read of the renderer's IPC bridge. The production
 * preload (`src/preload/index.ts`) exposes only `window.autosarApi`;
 * Task 6 deliberately does not modify that file, so the wizard
 * uses a non-standard `window.electron.ipcRenderer.invoke` path.
 * A future Task 7 will add a typed `window.autosarApi.stencilGenerate(req)`
 * wrapper and switch this component to it.
 */
interface ElectronLike {
  readonly ipcRenderer: {
    readonly invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  };
}

function getElectron(): ElectronLike | null {
  const w = (globalThis as { window?: { electron?: ElectronLike } }).window;
  return w?.electron ?? null;
}

export function StencilWizard({ onClose }: StencilWizardProps): JSX.Element {
  const locale: Locale = useArxmlStore((s) => s.locale);
  const setError = useArxmlStore((s) => s.setError);
  const setSuccess = useArxmlStore((s) => s.setSuccess);

  const [family, setFamily] = useState<StencilFamily>('com');
  const [mode, setMode] = useState<StencilMode>('free');
  const [gate, setGate] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const handleBackdropClick = (): void => {
    onClose();
  };

  const handleDialogClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    // Stop backdrop click from firing when the user clicks inside
    // the dialog body — mirrors NewProjectDialog / ConfirmDialog.
    e.stopPropagation();
  };

  const handleOverlayKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleGenerate = async (): Promise<void> => {
    if (busy) return;
    const electron = getElectron();
    if (electron === null) {
      // Bridge not installed yet (Task 7 is the wiring task). Surface
      // a localized error rather than silently no-op'ing — a silent
      // no-op is the silent-failure-hunter's worst nightmare.
      setError(t(locale, 'stencil.error.buildFailed'));
      return;
    }
    setBusy(true);
    const req: StencilRequest = { family, mode, gate };
    try {
      const result = (await electron.ipcRenderer.invoke(
        IPC_CHANNELS.STENCIL_GENERATE_V1,
        req,
      )) as StencilResponse;
      if (result.ok) {
        // Task 12 will wire the OS save dialog. For now just toast
        // the suggested filename so the wiring is visible end-to-end.
        setSuccess(`Generated ${result.suggestedFilename}`);
        onClose();
      } else {
        // Defensive: prefer `result.errors` (gate path, Task 8) over
        // `result.error.i18nKey` (pre-gate path). Both are valid
        // shapes per `StencilResponse`.
        const i18nKey =
          'error' in result && result.error !== undefined
            ? result.error.i18nKey
            : 'stencil.error.buildFailed';
        const params =
          'errors' in result && result.errors !== undefined ? { count: result.errors.length } : undefined;
        const message = t(locale, i18nKey as Parameters<typeof t>[1], params);
        setLastError(message);
        setError(message);
      }
    } catch (e) {
      // Defensive: a rejection here means the IPC channel threw
      // (handler crashed, preload bridge malformed, etc.). Surface
      // a generic build-failed message rather than leaking the
      // raw error text into the toast.
      const message = t(locale, 'stencil.error.buildFailed');
      setLastError(message);
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const titleId = 'stencil-title';

  return createPortal(
    <div
      className="stencil-overlay"
      data-testid="stencil-overlay"
      onClick={handleBackdropClick}
      onKeyDown={handleOverlayKeyDown}
      role="presentation"
    >
      <div
        className="stencil-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={handleDialogClick}
      >
        <div className="stencil-header">
          <h2 id={titleId} data-testid="stencil-title">
            {t(locale, 'stencil.title')}
          </h2>
        </div>

        <div className="stencil-body">
          <div className="stencil-field">
            <FamilyPicker value={family} onChange={setFamily} locale={locale} />
          </div>
          <div className="stencil-field">
            <ModeToggle value={mode} onChange={setMode} locale={locale} />
          </div>
          <div className="stencil-field">
            <GateToggle checked={gate} onChange={setGate} locale={locale} />
          </div>
          {lastError !== null ? (
            <div className="stencil-error" data-testid="stencil-error" role="alert">
              {lastError}
            </div>
          ) : null}
        </div>

        <div className="stencil-footer">
          <button
            type="button"
            className="stencil-btn stencil-btn-cancel"
            data-testid="stencil-cancel"
            onClick={onClose}
            disabled={busy}
          >
            {t(locale, 'stencil.cancel')}
          </button>
          <button
            type="button"
            className="stencil-btn stencil-btn-generate"
            data-testid="stencil-generate"
            onClick={() => {
              void handleGenerate();
            }}
            disabled={busy}
          >
            {t(locale, 'stencil.generate')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}