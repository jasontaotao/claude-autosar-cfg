// OdxViewer — v1.22.0 T2 (HIGH: ODX 完全没做).
//
// Read-only modal that renders an `OdxSummary` produced by the main-
// side `parseOdxHandler` (src/main/ipc/parseOdxHandler.ts). Closes
// the v1.21.0 carry-over "ODX 完全没做" gap by giving the user a
// visible UI affordance for "open a .odx file".
//
// Scope is intentionally minimal:
//   - Header: filename + summary counts (DTCs, DIDs, Routines)
//   - 3 sections, one per diagnostic surface, each a table:
//       DTCs: id / DOP name / trouble code / diagnostic text
//       DIDs: id / name
//       Routines: id / name
//   - Error state when `summary === null && error !== undefined`
//
// Out of scope (deferred to v1.22.x follow-ups):
//   - State-chart drill-down (full DIAG-LAYER shape, not just
//     the BASE-VARIANT DTC/DID/Routine lists)
//   - Tabbed UI — T2 ships 3 side-by-side sections; if the user
//     surfaces a "too long" complaint, a Tabs component can be
//     added without breaking this contract
//   - Project integration (ODX ↔ ARXML cross-reference)
//
// Pure presentational — no state, no store access. The host (App.tsx)
// owns the open/close flag and the parse state machine.
//
// Accessibility (mirrors v1.21.0 DbcViewer / StencilWizard pattern):
//   - Escape closes the modal
//   - Backdrop click closes; inner card stopPropagation prevents
//     table-row clicks from accidentally dismissing
//   - Initial focus moves to the close button on open

import { useEffect, useRef } from 'react';

import { t } from '@shared/i18n/index.js';
import type { Locale } from '@shared/i18n/index.js';
import { basename } from '@shared/path';
import type { OdxSummary } from '@shared/types';

import './OdxViewer.css';

export interface OdxViewerProps {
  /** Render-gate — when false, the modal is not in the DOM. */
  readonly open: boolean;
  /** Absolute path of the parsed file — shown in the title. */
  readonly path: string;
  /** Parsed summary, or `null` when in error state. */
  readonly summary: OdxSummary | null;
  /** Error message shown in place of the tables when `summary` is null. */
  readonly error?: string;
  readonly locale: Locale;
  readonly onClose: () => void;
  /** v1.24.0 MINOR T3 — fires when user clicks "Export Diagnostic Extract". */
  readonly onExport: () => void;
  /** v1.24.0 MINOR T3 — true while the export IPC round-trip is in flight; disables the button. */
  readonly exporting: boolean;
}

export function OdxViewer({
  open,
  path,
  summary,
  error,
  locale,
  onClose,
  onExport,
  exporting,
}: OdxViewerProps): JSX.Element | null {
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

  // Initial focus on the close button.
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
      className="odx-viewer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="odx-viewer-title"
      data-testid="odx-viewer"
      onClick={onClose}
    >
      <div
        className="odx-viewer-modal"
        onClick={(e): void => {
          e.stopPropagation();
        }}
      >
        <header className="odx-viewer-header">
          <h2 id="odx-viewer-title" className="odx-viewer-title" data-testid="odx-viewer-title">
            {t(locale, 'odx.viewer.title')} — {basename(path)}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="odx-viewer-close"
            onClick={onClose}
            aria-label={t(locale, 'odx.viewer.close')}
            data-testid="odx-viewer-close"
          >
            ×
          </button>
        </header>
        {/* v1.24.0 MINOR T3 — Export Diagnostic Extract button.
            Disabled while the export IPC round-trip is in flight
            (`exporting`) or when there's no parsed summary yet
            (null/error arm above renders the error banner instead
            of the tables). Click fires `onExport` so the host
            (App.tsx) can drive the T2 IPC handler. */}
        <button
          type="button"
          className="odx-viewer-export"
          onClick={onExport}
          disabled={exporting || summary === null}
          aria-label={
            exporting
              ? t(locale, 'odx.export.diagnosticExtract.exporting')
              : t(locale, 'odx.export.diagnosticExtract.button')
          }
          data-testid="odx-viewer-export"
        >
          {exporting
            ? t(locale, 'odx.export.diagnosticExtract.exporting')
            : t(locale, 'odx.export.diagnosticExtract.button')}
        </button>
        {summary === null ? (
          <div className="odx-viewer-error" data-testid="odx-viewer-error">
            <strong>{t(locale, 'odx.viewer.errorTitle')}:</strong> {error ?? '(no message)'}
          </div>
        ) : (
          <>
            <dl className="odx-viewer-stats" data-testid="odx-viewer-stats">
              <div className="odx-viewer-stat">
                <dt>{t(locale, 'odx.viewer.tabs.dtc')}</dt>
                <dd>{t(locale, 'odx.viewer.stats.dtc', { count: summary.dtcCount })}</dd>
              </div>
              <div className="odx-viewer-stat">
                <dt>{t(locale, 'odx.viewer.tabs.did')}</dt>
                <dd>{t(locale, 'odx.viewer.stats.did', { count: summary.didCount })}</dd>
              </div>
              <div className="odx-viewer-stat">
                <dt>{t(locale, 'odx.viewer.tabs.routine')}</dt>
                <dd>{t(locale, 'odx.viewer.stats.routine', { count: summary.routineCount })}</dd>
              </div>
            </dl>

            <section className="odx-viewer-section">
              <h3 className="odx-viewer-section-title">{t(locale, 'odx.viewer.tabs.dtc')}</h3>
              {summary.dtcs.length === 0 ? (
                <p className="odx-viewer-empty" data-testid="odx-empty-dtc">
                  {t(locale, 'odx.viewer.empty', { kind: 'DTC' })}
                </p>
              ) : (
                <div className="odx-viewer-table-wrap">
                  <table className="odx-viewer-table" data-testid="odx-dtc-table">
                    <thead>
                      <tr>
                        <th>{t(locale, 'odx.viewer.dtc.id')}</th>
                        <th>{t(locale, 'odx.viewer.dtc.name')}</th>
                        <th>{t(locale, 'odx.viewer.dtc.code')}</th>
                        <th>{t(locale, 'odx.viewer.dtc.text')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.dtcs.map((d) => (
                        <tr key={d.id} data-testid={`odx-dtc-${d.id}`}>
                          <td>{d.id}</td>
                          <td>{d.shortName}</td>
                          {/* Render the raw ODX `TROUBLE-CODE` value
                              (e.g. `0x123456`). The hex prefix is part
                              of the canonical surface for diagnostic
                              engineers; `displayCode` (prefix-stripped)
                              is kept in the type for callers that want
                              the human form but is not the primary
                              rendered value. */}
                          <td>{d.troubleCode}</td>
                          <td>{d.text}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="odx-viewer-section">
              <h3 className="odx-viewer-section-title">{t(locale, 'odx.viewer.tabs.did')}</h3>
              {summary.dids.length === 0 ? (
                <p className="odx-viewer-empty" data-testid="odx-empty-did">
                  {t(locale, 'odx.viewer.empty', { kind: 'DID' })}
                </p>
              ) : (
                <div className="odx-viewer-table-wrap">
                  <table className="odx-viewer-table" data-testid="odx-did-table">
                    <thead>
                      <tr>
                        <th>{t(locale, 'odx.viewer.did.id')}</th>
                        <th>{t(locale, 'odx.viewer.did.name')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.dids.map((d) => (
                        <tr key={d.id} data-testid={`odx-did-${d.id}`}>
                          <td>{d.id}</td>
                          <td>{d.shortName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="odx-viewer-section">
              <h3 className="odx-viewer-section-title">{t(locale, 'odx.viewer.tabs.routine')}</h3>
              {summary.routines.length === 0 ? (
                <p className="odx-viewer-empty" data-testid="odx-empty-routine">
                  {t(locale, 'odx.viewer.empty', { kind: 'Routine' })}
                </p>
              ) : (
                <div className="odx-viewer-table-wrap">
                  <table className="odx-viewer-table" data-testid="odx-routine-table">
                    <thead>
                      <tr>
                        <th>{t(locale, 'odx.viewer.routine.id')}</th>
                        <th>{t(locale, 'odx.viewer.routine.name')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.routines.map((r) => (
                        <tr key={r.id} data-testid={`odx-routine-${r.id}`}>
                          <td>{r.id}</td>
                          <td>{r.shortName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
