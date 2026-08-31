// DbcViewerInner — P2 (spec §4.1) split: the original viewer
// implementation, extracted verbatim so DbcViewer can be wrapped in
// a PanelErrorBoundary without changing the outer props contract.
// DbcViewer — v1.21.0 Bug #5 (HIGH: DBC 解析器装上未接入).
//
// Read-only modal that renders a `DbcSummary` produced by the main-
// side `parseDbcHandler` (src/main/ipc/parseDbcHandler.ts). Closes
// the v1.7.0 @dbc-forge/core dead-code gap by giving the user a
// visible UI affordance for "open a .dbc file".
//
// Scope is intentionally minimal:
//   - Header: filename + network stats (version, nodes, messages)
//   - Nodes chip row
//   - Messages table (id / name / dlc / transmitter / signal count)
//   - Error state when `summary === null && error !== undefined`
//
// Out of scope (deferred to follow-ups per MEMORY.md Bug #5):
//   - Signal-level drill-down (would need a second IPC channel that
//     streams the full Network)
//   - Multi-transmitter column (DbcSummary currently exposes only the
//     primary transmitter)
//   - Project integration (CAN network → ARXML mapping)
//
// Pure presentational — no state, no store access. The host (App.tsx)
// owns the open/close flag and the parse state machine.
//
// Accessibility (post-v1.21.0 code-review HIGH-1):
//   - Escape closes the modal (mirrors StencilWizard / ConfirmDialog)
//   - Click on the backdrop closes the modal (matches the user's
//     mental model of a dimmed backdrop being "outside" the modal)
//   - Click on the modal body does NOT close (stopPropagation on the
//     inner card) so table-row clicks don't accidentally dismiss
//   - Initial focus moves to the close button on open so a keyboard
//     user can immediately press Space/Enter to dismiss

import { useEffect, useRef } from 'react';

import { t } from '@shared/i18n/index.js';
import type { Locale } from '@shared/i18n/index.js';
import { basename } from '@shared/path';
import type { DbcSummary } from '@shared/types';

import './DbcViewer.css';

export interface DbcViewerInnerProps {
  /** Render-gate — when false, the modal is not in the DOM. */
  readonly open: boolean;
  /** Absolute path of the parsed file — shown in the title. */
  readonly path: string;
  /** Parsed summary, or `null` when in error state. */
  readonly summary: DbcSummary | null;
  /** Error message shown in place of the table when `summary` is null. */
  readonly error?: string;
  readonly locale: Locale;
  readonly onClose: () => void;
}

function formatCanId(id: number, isExtended: boolean): string {
  const width = isExtended ? 8 : 3;
  return `0x${id.toString(16).toUpperCase().padStart(width, '0')}`;
}

export function DbcViewerInner({
  open,
  path,
  summary,
  error,
  locale,
  onClose,
}: DbcViewerInnerProps): JSX.Element | null {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Escape-to-close. Mount the listener only while the modal is open
  // so a closed modal does not block other Escape handlers (e.g. the
  // menu dropdown's Escape close). Matches StencilWizard's
  // `handleOverlayKeyDown` pattern at StencilWizard.tsx:127-150.
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
      className="dbc-viewer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dbc-viewer-title"
      data-testid="dbc-viewer"
      // Backdrop click closes; inner card click stops propagation so
      // the user can interact with the table without dismissing the
      // modal. Matches the StencilWizard backdrop-click pattern.
      onClick={onClose}
    >
      <div
        className="dbc-viewer-modal"
        onClick={(e): void => {
          e.stopPropagation();
        }}
      >
        <header className="dbc-viewer-header">
          <h2 id="dbc-viewer-title" className="dbc-viewer-title" data-testid="dbc-viewer-title">
            {t(locale, 'dbc.viewer.title')} — {basename(path)}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="dbc-viewer-close"
            onClick={onClose}
            aria-label={t(locale, 'dbc.viewer.close')}
            data-testid="dbc-viewer-close"
          >
            ×
          </button>
        </header>
        {summary === null ? (
          <div className="dbc-viewer-error" data-testid="dbc-viewer-error">
            <strong>{t(locale, 'dbc.viewer.errorTitle')}:</strong> {error ?? ''}
          </div>
        ) : (
          <>
            <dl className="dbc-viewer-stats" data-testid="dbc-viewer-stats">
              <div className="dbc-viewer-stat">
                <dt>{t(locale, 'dbc.viewer.version')}</dt>
                <dd>{summary.version.length > 0 ? summary.version : '—'}</dd>
              </div>
              <div className="dbc-viewer-stat">
                <dt>{t(locale, 'dbc.viewer.nodes')}</dt>
                <dd>{summary.nodeCount}</dd>
              </div>
              <div className="dbc-viewer-stat">
                <dt>{t(locale, 'dbc.viewer.messages')}</dt>
                <dd>{summary.messageCount}</dd>
              </div>
            </dl>
            <div className="dbc-viewer-nodes" data-testid="dbc-viewer-nodes">
              {summary.nodes.map((n) => (
                <span key={n} className="dbc-viewer-node-chip">
                  {n}
                </span>
              ))}
            </div>
            <div className="dbc-viewer-table-wrap">
              <table className="dbc-viewer-table" data-testid="dbc-viewer-table">
                <thead>
                  <tr>
                    <th>{t(locale, 'dbc.viewer.column.id')}</th>
                    <th>{t(locale, 'dbc.viewer.column.name')}</th>
                    <th>{t(locale, 'dbc.viewer.column.dlc')}</th>
                    <th>{t(locale, 'dbc.viewer.column.transmitter')}</th>
                    <th>{t(locale, 'dbc.viewer.column.signals')}</th>
                    <th>{t(locale, 'dbc.viewer.column.frame')}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.messages.map((m) => (
                    <tr key={m.id} data-testid={`dbc-message-${m.id}`}>
                      <td>{formatCanId(m.id, m.isExtended)}</td>
                      <td>{m.name}</td>
                      <td>{m.dlc}</td>
                      <td>{m.transmitter}</td>
                      <td>{m.signalCount}</td>
                      <td data-testid={`dbc-message-frame-${m.id}`}>
                        {m.isExtended
                          ? t(locale, 'dbc.viewer.frame.extended')
                          : t(locale, 'dbc.viewer.frame.standard')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
