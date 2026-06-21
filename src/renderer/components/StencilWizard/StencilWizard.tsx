// StencilWizard (v1.8.0 K Stencil Wizard — Tasks 6/7 + Task 12 polish).
//
// Renderer modal that lets the user invoke the wizard from the UI.
// Lifts local state for `family` / `mode` / `gate`, composes the
// three sub-components, and on Generate invokes the IPC channel
// `stencil:generate:v1` followed by `stencil:save:v1` (Task 12) so
// the generated XML actually reaches disk via the native OS save
// dialog (no copy-paste / no toast-only path).
//
// IPC surface (preload bridge in `src/preload/index.ts`):
//   - `window.autosarApi.stencilGenerate(req)` -> `StencilResponse`
//   - `window.autosarApi.stencilSave({ xml, suggestedFilename })` -> `StencilSaveResponse`
//
// Accessibility (Task 12):
//   - `role="dialog"` + `aria-modal="true"` + `aria-labelledby` on the
//     dialog, `role="presentation"` on the backdrop.
//   - Focus trap: when open, focus moves to the first interactive
//     element (the family picker). Tab/Shift+Tab cycle within the
//     dialog so a screen-reader user can never escape into the inert
//     background.
//   - Esc / backdrop / ×-button all resolve with `onClose()`.
//   - On close, focus returns to the element that opened the wizard
//     (passed via the optional `returnFocusRef` prop) so keyboard
//     users don't lose their place in the File menu / Cmd-K palette.
//   - All controls have aria-labels matching the project's
//     convention (i18n-driven via `t(locale, key)` where present,
//     static aria-label where not — Cancel/Generate buttons inherit
//     their text from i18n, the family picker gets
//     `aria-label="stencil family"`).

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { Locale } from '@shared/i18n';
import { t } from '@shared/i18n';

import type {
  StencilFamily,
  StencilMode,
  StencilRequest,
  StencilResponse,
  StencilSaveResponse,
} from '../../../main/stencil/types.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';

import { FamilyPicker } from './FamilyPicker.js';
import { GateToggle } from './GateToggle.js';
import { ModeToggle } from './ModeToggle.js';

interface StencilWizardProps {
  readonly onClose: () => void;
  /**
   * Element that triggered the wizard. When the dialog closes,
   * focus is restored to this element so keyboard / screen-reader
   * users don't lose their place. Optional — the wizard still
   * works without it; focus just doesn't get restored.
   */
  readonly returnFocusRef?: React.RefObject<HTMLElement>;
}

export function StencilWizard({ onClose, returnFocusRef }: StencilWizardProps): JSX.Element {
  const locale: Locale = useArxmlStore((s) => s.locale);
  const setError = useArxmlStore((s) => s.setError);
  const setSuccess = useArxmlStore((s) => s.setSuccess);

  const [family, setFamily] = useState<StencilFamily>('com');
  const [mode, setMode] = useState<StencilMode>('free');
  const [gate, setGate] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // Task 12 — focus trap. We capture the first / last focusable
  // descendants once the dialog mounts and cycle Tab / Shift+Tab
  // between them so the focus can never escape into the inert
  // backdrop. The family picker is the natural first stop (the
  // `<select>`); the Generate button is the natural last stop.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstFocusableRef = useRef<HTMLElement | null>(null);
  const lastFocusableRef = useRef<HTMLElement | null>(null);

  // On mount, find the first / last focusable descendants and move
  // focus to the first. The query is intentionally narrow: the
  // modal is small enough that a one-time scan is cheaper than
  // re-querying on every Tab keypress.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return undefined;
    const focusables = collectFocusable(dialog);
    firstFocusableRef.current = focusables[0] ?? null;
    lastFocusableRef.current = focusables[focusables.length - 1] ?? null;
    // Defer to next frame so the DOM node is painted and reachable
    // via ref (matches NewProjectDialog's auto-focus pattern).
    const raf = requestAnimationFrame(() => firstFocusableRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  // On close, restore focus to the trigger element. We call this
  // whenever the parent unmounts us (which happens on close).
  useEffect(() => {
    // Snapshot the ref value at effect time (not at cleanup time)
    // so React's exhaustive-deps lint is happy AND the snapshot
    // matches the element the user was on when they opened the
    // wizard. Copying the ref into a local variable is the
    // standard escape hatch for this lint rule.
    const trigger = returnFocusRef?.current ?? null;
    return () => {
      // Defer one frame so React has finished tearing down the
      // portal before we try to focus an outside element — focuses
      // dispatched during the unmount are silently dropped in some
      // browser versions.
      if (trigger !== null) {
        requestAnimationFrame(() => trigger.focus());
      }
    };
  }, [returnFocusRef]);

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
      return;
    }
    // Task 12 — focus trap. Cycle Tab between first and last
    // focusable descendants so focus never escapes into the
    // inert backdrop. Shift+Tab from the first lands on the last;
    // Tab from the last lands on the first.
    if (e.key === 'Tab') {
      const first = firstFocusableRef.current;
      const last = lastFocusableRef.current;
      if (first === null || last === null) return;
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const handleGenerate = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    const req: StencilRequest = { family, mode, gate };
    let generateResult: StencilResponse;
    try {
      generateResult = await window.autosarApi.stencilGenerate(req);
    } catch (e) {
      // Defensive: a rejection here means the IPC channel threw
      // (handler crashed, preload bridge malformed, etc.). Surface
      // a generic build-failed message rather than leaking the
      // raw error text into the toast.
      const message = t(locale, 'stencil.error.buildFailed');
      setLastError(message);
      setError(message);
      setBusy(false);
      return;
    }

    if (!generateResult.ok) {
      // Defensive: prefer `result.errors` (gate path, Task 8) over
      // `result.error.i18nKey` (pre-gate path). Both are valid
      // shapes per `StencilResponse`.
      const i18nKey =
        'error' in generateResult && generateResult.error !== undefined
          ? generateResult.error.i18nKey
          : 'stencil.error.buildFailed';
      const params =
        'errors' in generateResult && generateResult.errors !== undefined
          ? { count: generateResult.errors.length }
          : undefined;
      const message = t(locale, i18nKey as Parameters<typeof t>[1], params);
      setLastError(message);
      setError(message);
      setBusy(false);
      return;
    }

    // Task 12 — wire the native save dialog + disk write. The
    // generate path now produces the XML string; `stencilSave`
    // pops the OS save dialog and writes the file. Cancellation
    // is a successful no-op (we still close the wizard — the
    // user has the XML nowhere if we didn't, but they also
    // didn't get a file. Closing matches the prior toast-only
    // behavior; a future "copy to clipboard on cancel" is
    // out-of-scope for Task 12).
    let saveResult: StencilSaveResponse;
    try {
      saveResult = await window.autosarApi.stencilSave({
        xml: generateResult.xml,
        suggestedFilename: generateResult.suggestedFilename,
      });
    } catch (e) {
      const message = t(locale, 'stencil.error.buildFailed');
      setLastError(message);
      setError(message);
      setBusy(false);
      return;
    }

    if (saveResult.ok) {
      if (saveResult.value.canceled) {
        // User backed out of the save dialog — close cleanly,
        // no success toast. The XML is gone (the wizard doesn't
        // retain it) which matches the rest of the app's save
        // cancelation pattern.
        onClose();
      } else {
        setSuccess(
          t(locale, 'stencil.success.saved', { name: basename(saveResult.value.path) }),
        );
        onClose();
      }
    } else {
      // Defensive: surface the per-kind error message. The
      // per-kind dispatch (permission / disk-full / ...) is owned
      // by the parent store; here we just render a single toast.
      const message = t(locale, 'stencil.error.buildFailed');
      setLastError(message);
      setError(message);
    }
    setBusy(false);
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
        ref={dialogRef}
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
            aria-label={t(locale, 'stencil.cancel')}
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
            aria-label={t(locale, 'stencil.generate')}
          >
            {t(locale, 'stencil.generate')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Collect the focusable descendants of `root` in DOM order. Limited
 * to the controls the wizard actually renders: button / select /
 * input / textarea / [tabindex] (when tabindex >= 0). Disabled
 * elements and `tabindex="-1"` are skipped per the standard
 * focusability rules.
 */
function collectFocusable(root: HTMLElement): HTMLElement[] {
  const selector =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll<HTMLElement>(selector));
}

/**
 * `path.basename` equivalent that handles both `/` and `\` separators
 * (Windows + POSIX). The OS save dialog returns native paths so we
 * can't rely on a single separator.
 */
function basename(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx >= 0 ? p.slice(idx + 1) : p;
}
