// DcmConfigSuccessDialog — v1.31.0 PATCH T1.
//
// Shown after a successful dcm:config IPC. Surfaces the single
// outputPath + the 5 service-kind counts + appliedStepCount so
// the user can locate the freshly-written Dcm_Config.arxml.
//
// Parity with v1.24.0 T3 DiagnosticExtractSuccessDialog (a11y +
// i18n). The single output simplifies the paths section (no
// dem/dcm split).
//
// v1.33.1 PATCH T3 — Override UI (v1.33.0 half-finished
// <details> + Browse/Clear) is DELETED in this task; a new
// "Generate New" button replaces it, wired through the new
// `onGenerateNew` prop to launcher.handleGenerateNew (T2).
//
// i18n: all user-facing strings go through t(locale, key, params)
// per the v1.23.1 T1 L1 i18n-bypass-pattern lesson.

import { useEffect, useRef } from 'react';

import { t } from '@shared/i18n/index.js';
import type { Locale } from '@shared/i18n/index.js';
import type { DcmConfigHandlerResult } from '@shared/types.js';

import type { XlsxImportRecord } from '../../store/slices/xlsxImportSlice.js';

import { DcmConfigXlsxImportHistory } from './DcmConfigXlsxImportHistory.js';

import './DcmConfigSuccessDialog.css';

export interface DcmConfigSuccessDialogProps {
  /** Render-gate — when false, the modal is not in the DOM. */
  readonly open: boolean;
  /** v1.30.0 MINOR handler result (outputPath + 5 service counts + appliedStepCount). */
  readonly result: DcmConfigHandlerResult;
  readonly locale: Locale;
  readonly onClose: () => void;
  /** v1.33.1 PATCH T3 — SuccessDialog "Generate New" button click.
   * Wires through to launcher.handleGenerateNew (T2) which re-fires
   * dcm:config with the captured lastOdxPath. */
  readonly onGenerateNew: () => void | Promise<void>;
  /** v1.34.0 MINOR T3 — xlsx import history snapshot. Drives the
   * collapsed <details> section below the Generate New button.
   * Ordered most-recent-first by the v1.33.0 slice cap-at-5 +
   * prepend-first invariant. */
  readonly history: readonly XlsxImportRecord[];
  /** v1.34.0 MINOR T3 — Reuse button click from a history entry.
   * Caller wires this to the slice's `reuseFromHistory` action. */
  readonly onReuseFromHistory: (importedAt: number) => void;
}

export function DcmConfigSuccessDialog(props: DcmConfigSuccessDialogProps): JSX.Element | null {
  const { open, result, locale, onClose, onGenerateNew, history, onReuseFromHistory } = props;
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

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
      className="dcm-config-success-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dcm-config-success-title"
      data-testid="dcm-config-success-dialog"
      onClick={onClose}
    >
      <div
        className="dcm-config-success-card"
        onClick={(e): void => {
          e.stopPropagation();
        }}
      >
        <h2
          id="dcm-config-success-title"
          className="dcm-config-success-title"
          data-testid="dcm-config-success-title"
        >
          {t(locale, 'odx.export.dcmConfig.success.title')}
        </h2>
        <p className="dcm-config-success-body" data-testid="dcm-config-success-body">
          {t(locale, 'odx.export.dcmConfig.success.body', {
            dspCount: result.odxLinkedDcmDspCount,
            routineCount: result.odxLinkedRoutineCount,
            appliedStepCount: result.appliedStepCount,
          })}
        </p>
        <dl className="dcm-config-success-paths" data-testid="dcm-config-success-paths">
          <div className="dcm-config-success-path-row">
            <dt>Dcm</dt>
            <dd>
              <code>{result.outputPath}</code>
            </dd>
          </div>
          {/* v1.33.0 MINOR T6 — `bswmdPath` is required on
              DcmConfigHandlerResult, so the autofill row is rendered
              unconditionally (the previous `!== undefined` guard is
              no longer reachable). The field mirrors the resolved
              BSWMD path the handler actually read. */}
          <div
            className="dcm-config-success-path-row dcm-config-success-bswmd-autofill"
            data-testid="dcm-config-success-bswmd-autofill"
          >
            <dt>{t(locale, 'dcmConfig.bswmdPath.autofill')}</dt>
            <dd>
              <code>{result.bswmdPath}</code>
            </dd>
          </div>
          {/* v1.33.0 MINOR T7 — applied step count surface. Renders
              only when appliedStepCount > 0 (no empty placeholder).
              i18n key is `dcmConfig.appliedCount.summary` with
              `{count}` placeholder. data-testid is the E2E hook. */}
          {result.appliedStepCount > 0 && (
            <p
              className="dcm-config-success-applied-count"
              data-testid="dcm-config-success-applied-count"
            >
              {t(locale, 'dcmConfig.appliedCount.summary', {
                count: result.appliedStepCount,
              })}
            </p>
          )}
        </dl>
        {/* v1.33.1 PATCH T3 — "Generate New" button. Re-fires
            dcm:config with the captured lastOdxPath. Replaces the
            deleted v1.33.0 Override <details> + Browse/Clear UI. */}
        <button
          type="button"
          onClick={() => {
            void onGenerateNew();
          }}
          data-testid="dcm-config-generate-new"
          className="dcm-config-generate-new"
        >
          {t(locale, 'dcmConfig.generateNew.button')}
        </button>
        {/* v1.34.0 MINOR T3 — xlsx import history <details>. Collapsed
            by default; the <summary> surfaces the i18n title + entry
            count so users see at-a-glance how many imports are
            available for Reuse. Pure presentational wiring — the
            child <DcmConfigXlsxImportHistory> owns its own empty /
            row render. No `open` prop = collapsed default. */}
        <details
          className="xlsx-import-history"
          data-testid="dcm-config-xlsx-history-details"
        >
          <summary>
            {t(locale, 'xlsxImportHistory.title')} ({history.length})
          </summary>
          <DcmConfigXlsxImportHistory
            history={history}
            locale={locale}
            onReuse={onReuseFromHistory}
          />
        </details>
        <div className="dcm-config-success-actions">
          <button
            ref={closeButtonRef}
            type="button"
            className="dcm-config-success-close"
            onClick={onClose}
            data-testid="dcm-config-success-close"
          >
            {t(locale, 'odx.export.dcmConfig.success.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
