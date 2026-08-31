// P2 (spec §4.1) — reusable in-panel error boundary. Wraps the existing
// ErrorBoundary and renders a token-styled error card that fills the
// hosting panel without affecting sibling panels.
import { useState, type JSX, type ReactNode } from 'react';

import { t, type Locale } from '../../shared/i18n/index.js';

import { ErrorBoundary } from './ErrorBoundary.js';
import './PanelErrorBoundary.css';

export type PanelErrorId =
  | 'tree'
  | 'param-editor'
  | 'script-panel'
  | 'dbc-viewer'
  | 'odx-viewer'
  | 'validation-panel';

export interface PanelErrorBoundaryProps {
  /** Stable panel id — drives the `panel-error-<panel>` testid. */
  readonly panel: PanelErrorId;
  readonly locale: Locale;
  /** Optional close action for modal-style panels (DBC/ODX viewers). */
  readonly onClose?: () => void;
  readonly children: ReactNode;
}

interface PanelErrorCardProps {
  readonly error: Error;
  readonly panel: PanelErrorId;
  readonly locale: Locale;
  readonly onClose?: () => void;
  readonly reset: () => void;
}

function PanelErrorCard({
  error,
  panel,
  locale,
  onClose,
  reset,
}: PanelErrorCardProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const copyDetails = (): void => {
    const detail = `${error.message}\n${error.stack ?? ''}`;
    const clipboard = navigator.clipboard;
    if (clipboard === undefined) return;
    clipboard
      .writeText(detail)
      .then(() => {
        setCopied(true);
      })
      .catch(() => undefined);
  };
  return (
    <section className="panel-error-card" role="alert" data-testid={`panel-error-${panel}`}>
      <span className="panel-error-card__icon" aria-hidden="true">
        ⚠
      </span>
      <h3 className="panel-error-card__title">{t(locale, 'panel.error.title')}</h3>
      <p className="panel-error-card__message">{error.message}</p>
      <div className="panel-error-card__actions">
        <button type="button" className="app-btn" onClick={reset}>
          {t(locale, 'panel.error.retry')}
        </button>
        <button type="button" className="app-btn" onClick={copyDetails}>
          {copied ? t(locale, 'panel.error.copied') : t(locale, 'panel.error.copyDetails')}
        </button>
        {onClose !== undefined && (
          <button type="button" className="app-btn" onClick={onClose}>
            {t(locale, 'panel.error.close')}
          </button>
        )}
      </div>
    </section>
  );
}

export function PanelErrorBoundary({
  panel,
  locale,
  onClose,
  children,
}: PanelErrorBoundaryProps): JSX.Element {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <PanelErrorCard
          error={error}
          panel={panel}
          locale={locale}
          onClose={onClose}
          reset={reset}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
