// src/renderer/components/ValidationPanel/ValidationPanel.tsx
// Cluster G (v1.6.0) — Bottom-docked ValidationPanel.
//
// Per G spec §3 (UI integration): dedicated `ValidationPanel` component
// docked at the bottom of the window (parallel to existing Issues
// panel). Toggleable via toolbar. Click-to-navigate: clicking an
// error row fires `useArxmlStore.select(path)`.
//
// The pre-existing `src/renderer/components/ValidationPanel.tsx`
// continues to surface the legacy `validateProjectForRenderer`
// results; this new component surfaces the G-cluster SWS validator
// results. Both can render simultaneously (different sources).

import type { JSX } from 'react';

import type { Locale } from '@shared/i18n';
import { t } from '@shared/i18n';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { useSwsValidatorStore } from '../../store/useSwsValidatorStore.js';

import './ValidationPanel.css';

interface Props {
  readonly locale: Locale;
}

export function SwsValidationPanel({ locale }: Props): JSX.Element {
  const enabled = useSwsValidatorStore((s) => s.enabled);
  const panelOpen = useSwsValidatorStore((s) => s.panelOpen);
  const togglePanel = useSwsValidatorStore((s) => s.togglePanel);
  const running = useSwsValidatorStore((s) => s.running);
  const results = useSwsValidatorStore((s) => s.results);
  const severityFilter = useSwsValidatorStore((s) => s.severityFilter);
  const setSeverityFilter = useSwsValidatorStore((s) => s.setSeverityFilter);
  const focusedErrorIndex = useSwsValidatorStore((s) => s.focusedErrorIndex);
  const select = useArxmlStore((s) => s.select);
  const tour = useArxmlStore((s) => s.tour);

  if (!enabled) {
    return (
      <div
        className="sws-panel sws-panel-disabled"
        data-testid="sws-panel-disabled"
      >
        <span className="sws-panel-disabled-label">
          {t(locale, 'swsValidator.panel.disabled')}
        </span>
      </div>
    );
  }

  if (!panelOpen) {
    return (
      <button
        type="button"
        className="sws-panel-toggle"
        onClick={togglePanel}
        data-testid="sws-panel-toggle-open"
        aria-label={t(locale, 'swsValidator.panel.toggleAria')}
      >
        {t(locale, 'swsValidator.panel.title')}
      </button>
    );
  }

  const errorCount = results.filter((r) => r.severity === 'error').length;
  const warningCount = results.filter((r) => r.severity === 'warning').length;
  const visible = results.filter((r) => {
    if (severityFilter === 'all') return true;
    return r.severity === severityFilter;
  });
  const focused = visible[focusedErrorIndex];

  return (
    <aside
      className="sws-panel"
      data-testid="sws-panel"
      role="region"
      aria-label={t(locale, 'swsValidator.panel.title')}
    >
      <header className="sws-panel-header">
        <h3>{t(locale, 'swsValidator.panel.title')}</h3>
        <div className="sws-panel-badges">
          {errorCount > 0 && (
            <span className="sws-badge sws-badge-error" data-testid="sws-badge-error">
              {t(locale, 'swsValidator.panel.errorBadge', { count: errorCount })}
            </span>
          )}
          {warningCount > 0 && (
            <span className="sws-badge sws-badge-warning" data-testid="sws-badge-warning">
              {t(locale, 'swsValidator.panel.warningBadge', { count: warningCount })}
            </span>
          )}
          {running && (
            <span className="sws-panel-running">{t(locale, 'swsValidator.panel.running')}</span>
          )}
          {tour?.kind === 'running' && (
            <span className="sws-panel-paused" data-testid="sws-panel-paused">
              {t(locale, 'swsValidator.panel.paused')}
            </span>
          )}
        </div>
        <div className="sws-panel-filter">
          {(['all', 'error', 'warning'] as const).map((f) => (
            <button
              type="button"
              key={f}
              className={
                severityFilter === f
                  ? 'sws-filter-btn sws-filter-btn-active'
                  : 'sws-filter-btn'
              }
              onClick={() => setSeverityFilter(f)}
              data-testid={`sws-filter-${f}`}
            >
              {t(locale, `swsValidator.panel.filter.${f}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="sws-panel-close"
          onClick={togglePanel}
          data-testid="sws-panel-toggle-close"
          aria-label={t(locale, 'swsValidator.panel.toggleAria')}
        >
          ×
        </button>
      </header>
      <ul className="sws-panel-list" data-testid="sws-panel-list">
        {visible.length === 0 ? (
          <li className="sws-panel-empty" data-testid="sws-panel-empty">
            {t(locale, 'swsValidator.panel.empty')}
          </li>
        ) : (
          visible.map((r, i) => (
            <li
              key={`${r.ruleId}-${r.path}-${i}`}
              className={
                focused === r
                  ? 'sws-panel-row sws-panel-row-focused'
                  : 'sws-panel-row'
              }
              data-testid={`sws-panel-row-${i}`}
            >
              <button
                type="button"
                onClick={() => select(r.path)}
                className="sws-panel-row-button"
              >
                <span className={`sws-severity sws-severity-${r.severity}`}>
                  {t(locale, `swsValidator.panel.severity.${r.severity}`)}
                </span>
                <code className="sws-rule-id">{r.ruleId}</code>
                <code className="sws-path">{r.path}</code>
                <span className="sws-message">
                  {t(
                    locale,
                    r.messageKey as Parameters<typeof t>[1],
                    r.messageVars as Readonly<Record<string, string | number | boolean>> | undefined,
                  )}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}