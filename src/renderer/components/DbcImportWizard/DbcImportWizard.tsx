// DbcImportWizard — v1.23.0 T4 (3-Step Wizard UI + Menu Wiring).
//
// 3-step modal that drives the v1.23.0 T3 IPC pipeline
// (`window.autosarApi.dbcImportComStack`) end-to-end:
//   1. SelectDbc        — user picks a DBC file via the existing
//                         `dbc:open` IPC + parses via `dbc:parse`
//   2. PreviewMapping   — show parsed DBC messages + a targetNode
//                         dropdown sourced from `dbc.nodes` (NOT from
//                         the EcuC `<ECU-INSTANCE>` shortName — see
//                         CRITICAL below)
//   3. ConfirmApply     — call the IPC handler with both dbcContent
//                         and the user-selected targetNode
//
// CRITICAL — targetNode semantics (T3 HIGH-2 fix). The IPC validator
// at `src/main/ipc/dbcImportComStackHandler.ts:393` requires
// `targetNode` to be one of `DbcSummary.nodes` (DBC `BU_` line names
// like `ECM`, `TCM`). It is NOT the EcuC `<ECU-INSTANCE>` shortName.
// The Preview step's <select> is therefore populated from
// `initialDbc.nodes` — never auto-derived from the active project's
// EcuC instance. The handler also validates this at runtime; we add
// a defensive client-side check that disables the Next button until
// the user has selected a node, so the user gets immediate feedback
// (the IPC error would only surface after the click round-trip).
//
// Pure presentational: no store access, no IPC calls. The host
// (App.tsx) supplies the DBC summary (or a fresh-pick flow), owns
// the open/close flag, and handles the IPC round-trip via `onApply`.
// The pick-DBC flow is currently the host's responsibility too —
// the wizard only renders the "Pick a DBC file…" CTA and lets the
// host orchestrate the open + parse + set-state cycle.
//
// Accessibility (mirrors DbcViewer / OdxViewer):
//   - Escape closes the modal
//   - Backdrop click closes; inner card stopPropagation prevents
//     table-row clicks from accidentally dismissing
//   - Initial focus moves to the close button on open

import { useEffect, useRef, useState } from 'react';

import { t, type Locale } from '@shared/i18n/index.js';
import type { DbcSummary } from '@shared/types';

import './DbcImportWizard.css';

type Step = 'select' | 'preview' | 'confirm';

function formatCanId(id: number, isExtended: boolean): string {
  const width = isExtended ? 8 : 3;
  return `0x${id.toString(16).toUpperCase().padStart(width, '0')}`;
}

export interface DbcImportWizardProps {
  readonly onClose: () => void;
  /**
   * Apply handler — receives the raw DBC content + the user-selected
   * targetNode (a DBC `BU_` node name from `initialDbc.nodes`). The
   * host (App.tsx) calls the v1.23.0 T3 IPC
   * `window.autosarApi.dbcImportComStack` with both, then reloads
   * the project.
   */
  readonly onApply: (dbcContent: string, targetNode: string) => Promise<void>;
  /**
   * Optional pre-parsed DBC summary — when provided the wizard
   * skips Step 1 and lands directly on the Preview step. This is
   * the post-IPC-parse shape from `dbc:parse`, supplied by the host
   * after a successful `openDbc → parseDbc` round-trip.
   */
  readonly initialDbc?: DbcSummary;
  /** Raw DBC UTF-8 text — required when `initialDbc` is provided (passed to onApply). */
  readonly dbcContent?: string;
  /**
   * Optional callback invoked when the user clicks the "Pick a DBC
   * file…" button on Step 1. The host implements the actual
   * `openDbc → parseDbc` flow + sets the result back via the
   * `initialDbc` / `dbcContent` re-render. We keep the wizard
   * presentational so the IPC orchestration stays in one place.
   */
  readonly onPickDbc?: () => void;
  /**
   * Locale bound to the host's `useArxmlStore`. Drives the
   * `t(locale, key)` calls in the JSX so a zh-CN user sees the
   * Chinese strings (the v1.23.0 T4 CRITICAL fix — pre-fix the
   * wizard rendered hardcoded English regardless of locale).
   * Defaults to `'zh-CN'` to keep the existing call sites unchanged.
   */
  readonly locale?: Locale;
}

export function DbcImportWizard({
  onClose,
  onApply,
  initialDbc,
  dbcContent = '',
  onPickDbc,
  locale = 'zh-CN',
}: DbcImportWizardProps): JSX.Element {
  // Step routing. When the host supplies `initialDbc` we land
  // directly on the Preview step (the host already did the
  // open + parse round-trip); otherwise we start on the Select step.
  const [step, setStep] = useState<Step>(initialDbc !== undefined ? 'preview' : 'select');
  // `targetNode` is the user-selected DBC `BU_` node name from the
  // Preview step's <select>. Empty string == "not yet selected"
  // (drives the disabled state of the Next button). The IPC handler
  // validates that the value is one of `initialDbc.nodes`; the
  // client-side check here is purely a UX fast-path so the user
  // gets immediate feedback.
  const [targetNode, setTargetNode] = useState<string>('');
  // `applying` gates the Apply button so a second click cannot fire
  // a second IPC round-trip before the first resolves.
  const [applying, setApplying] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Escape-to-close. Mount the listener only while the wizard is
  // mounted so a closed wizard does not block other Escape handlers.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Initial focus on the close button so a keyboard-only user can
  // press Space/Enter immediately.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // Apply handler — fires from Step 3's Apply button. Disabled until
  // `targetNode` is non-empty AND `dbcContent` is non-empty (the
  // latter is the host's responsibility to provide via the `initialDbc`
  // re-render). Re-entrancy guard via `applying` state.
  async function handleApply(): Promise<void> {
    if (targetNode.length === 0 || dbcContent.length === 0) return;
    if (applying) return;
    setApplying(true);
    try {
      await onApply(dbcContent, targetNode);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div
      className="dbc-wizard-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dbc-wizard-title"
      data-testid="dbc-wizard"
      onClick={onClose}
    >
      <div
        className="dbc-wizard-modal"
        onClick={(e): void => {
          e.stopPropagation();
        }}
      >
        <header className="dbc-wizard-header">
          <h2 id="dbc-wizard-title" className="dbc-wizard-title" data-testid="dbc-wizard-title">
            {t(locale, 'dbc.import.wizard.title')}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="dbc-wizard-close"
            onClick={onClose}
            aria-label={t(locale, 'dbc.import.close')}
            data-testid="dbc-wizard-close"
          >
            ×
          </button>
        </header>
        {step === 'select' && (
          <section className="dbc-wizard-step" data-testid="dbc-wizard-step-select">
            <p className="dbc-wizard-step-desc">
              Select a DBC file to import into the active project&apos;s Com-stack ECUC values.
            </p>
            <button
              type="button"
              className="dbc-wizard-btn dbc-wizard-btn-primary"
              onClick={(): void => {
                if (onPickDbc !== undefined) onPickDbc();
              }}
              data-testid="dbc-wizard-pick-file"
            >
              {t(locale, 'dbc.import.select.button')}
            </button>
          </section>
        )}
        {step === 'preview' && initialDbc !== undefined && (
          <section className="dbc-wizard-step" data-testid="dbc-wizard-step-preview">
            <h3 className="dbc-wizard-step-title">{t(locale, 'dbc.import.step.preview')}</h3>
            <p className="dbc-wizard-step-desc">
              {t(locale, 'dbc.import.preview.messages', { count: initialDbc.messages.length })}
            </p>
            <ul className="dbc-wizard-messages">
              {initialDbc.messages.map((m) => (
                <li
                  key={m.id}
                  className="dbc-wizard-message"
                  data-testid={`dbc-wizard-msg-${m.id}`}
                >
                  <span className="dbc-wizard-msg-name">{m.name}</span>
                  <span className="dbc-wizard-msg-id">
                    CAN ID {formatCanId(m.id, m.isExtended)}
                  </span>
                  <span className="dbc-wizard-msg-frame" data-testid={`dbc-wizard-frame-${m.id}`}>
                    {m.isExtended ? 'EXT' : 'STD'}
                  </span>
                  <span className="dbc-wizard-msg-meta">
                    DLC {m.dlc} · tx {m.transmitter} · {m.signalCount} signals
                  </span>
                </li>
              ))}
            </ul>
            {/*
              CRITICAL: targetNode is sourced from `initialDbc.nodes`
              (DBC `BU_` line names) — NOT from the EcuC `<ECU-INSTANCE>`
              shortName. The IPC validator at
              `src/main/ipc/dbcImportComStackHandler.ts` rejects any
              targetNode not present in the parsed DBC's nodes list.
            */}
            <label className="dbc-wizard-field">
              <span className="dbc-wizard-field-label">Target node (DBC BU_ name)</span>
              <select
                className="dbc-wizard-select"
                value={targetNode}
                onChange={(e): void => {
                  setTargetNode(e.target.value);
                }}
                data-testid="dbc-wizard-target-node"
                aria-label="Target DBC node name"
              >
                <option value="">— select a node —</option>
                {initialDbc.nodes.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <div className="dbc-wizard-actions">
              <button
                type="button"
                className="dbc-wizard-btn dbc-wizard-btn-primary"
                onClick={(): void => {
                  setStep('confirm');
                }}
                disabled={targetNode.length === 0}
                data-testid="dbc-wizard-next"
              >
                {t(locale, 'dbc.import.preview.next')}
              </button>
            </div>
          </section>
        )}
        {step === 'confirm' && (
          <section className="dbc-wizard-step" data-testid="dbc-wizard-step-confirm">
            <h3 className="dbc-wizard-step-title">{t(locale, 'dbc.import.step.confirm')}</h3>
            <p className="dbc-wizard-warning" data-testid="dbc-wizard-warning">
              {t(locale, 'dbc.import.confirm.warning', { targetNode })}
            </p>
            <div className="dbc-wizard-actions">
              <button
                type="button"
                className="dbc-wizard-btn"
                onClick={(): void => {
                  setStep('preview');
                }}
                disabled={applying}
                data-testid="dbc-wizard-back"
              >
                Back
              </button>
              <button
                type="button"
                className="dbc-wizard-btn dbc-wizard-btn-primary"
                onClick={(): void => {
                  void handleApply();
                }}
                disabled={applying}
                data-testid="dbc-wizard-apply"
              >
                {applying
                  ? t(locale, 'dbc.import.confirm.applying')
                  : t(locale, 'dbc.import.confirm.apply')}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
