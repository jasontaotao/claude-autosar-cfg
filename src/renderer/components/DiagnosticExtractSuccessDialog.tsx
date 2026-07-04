// DiagnosticExtractSuccessDialog — v1.24.0 MINOR T3.
//
// Shown after a successful ODX→Diagnostic Extract export (T2 IPC
// `importDiagnosticExtract` returned `ok: true`). Surfaces the 2
// generated file paths + the parsed counts (DTCs / DIDs / Routines)
// so the user can locate the freshly-written Dem_Extract.arxml +
// Dcm_Extract.arxml without scanning the file tree.
//
// Pure presentational — no state, no store access. The host
// (App.tsx) owns the open/close flag and the IPC response.
//
// Accessibility (mirrors v1.22.0 T2 OdxViewer / v1.21.0 T4 DbcViewer
// modal pattern):
//   - Escape closes the modal
//   - Backdrop click closes; inner card stopPropagation prevents
//     file-path row clicks from accidentally dismissing
//   - Initial focus moves to the close button on open
//
// i18n: all user-facing strings go through `t(locale, key, params)`
// per the v1.23.1 T1 L1 i18n-bypass-pattern lesson — no hardcoded
// English diagnostic strings (zh-CN bundle covers the locale="zh-CN"
// default path through the same keys).

import { useEffect, useRef } from 'react';

import { t } from '@shared/i18n/index.js';
import type { Locale } from '@shared/i18n/index.js';

import './DiagnosticExtractSuccessDialog.css';

export interface DiagnosticExtractSuccessDialogProps {
  /** Render-gate — when false, the modal is not in the DOM. */
  readonly open: boolean;
  /** Absolute path of the generated Dem_Extract.arxml. */
  readonly demPath: string;
  /** Absolute path of the generated Dcm_Extract.arxml. */
  readonly dcmPath: string;
  /** Counts parsed from the ODX summary; matches the T2 IPC stats payload. */
  readonly stats: {
    readonly dtcCount: number;
    readonly didCount: number;
    readonly routineCount: number;
  };
  readonly locale: Locale;
  readonly onClose: () => void;
}

export function DiagnosticExtractSuccessDialog(
  props: DiagnosticExtractSuccessDialogProps,
): JSX.Element | null {
  const { open, demPath, dcmPath, stats, locale, onClose } = props;
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Escape-to-close. Mount the listener only while the modal is open
  // so a closed modal does not block other Escape handlers.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Initial focus on the close button so a keyboard-only user can
  // press Space/Enter immediately. requestAnimationFrame defers past
  // the mount paint so the ref is attached.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="diag-extract-success-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="diag-extract-success-title"
      data-testid="diag-extract-success-dialog"
      onClick={onClose}
    >
      <div
        className="diag-extract-success-card"
        onClick={(e): void => {
          e.stopPropagation();
        }}
      >
        <h2
          id="diag-extract-success-title"
          className="diag-extract-success-title"
          data-testid="diag-extract-success-title"
        >
          {t(locale, 'odx.export.diagnosticExtract.success.title')}
        </h2>
        <p className="diag-extract-success-body" data-testid="diag-extract-success-body">
          {t(locale, 'odx.export.diagnosticExtract.success.body', {
            dtcCount: stats.dtcCount,
            didCount: stats.didCount,
            routineCount: stats.routineCount,
          })}
        </p>
        <dl className="diag-extract-success-paths" data-testid="diag-extract-success-paths">
          <div className="diag-extract-success-path-row">
            <dt>Dem</dt>
            <dd>
              <code>{demPath}</code>
            </dd>
          </div>
          <div className="diag-extract-success-path-row">
            <dt>Dcm</dt>
            <dd>
              <code>{dcmPath}</code>
            </dd>
          </div>
        </dl>
        <div className="diag-extract-success-actions">
          <button
            ref={closeButtonRef}
            type="button"
            className="diag-extract-success-close"
            onClick={onClose}
            data-testid="diag-extract-success-close"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
