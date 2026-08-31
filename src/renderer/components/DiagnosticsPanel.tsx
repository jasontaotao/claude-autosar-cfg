import { useMemo, useState } from 'react';
import type { JSX } from 'react';

import { t } from '../../shared/i18n/index.js';
import type { DiagnosticEntry } from '../store/slices/diagnosticsTypes';
import { useArxmlStore } from '../store/useArxmlStore';

import './DiagnosticsPanel.css';

type DiagnosticFilter = 'all' | 'error' | 'warn';

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

function diagnosticText(entry: DiagnosticEntry): string {
  const lines = [
    `${formatTimestamp(entry.ts)} [${entry.level}] ${entry.source}: ${entry.message}`,
  ];
  if (entry.detail !== undefined) lines.push(entry.detail);
  if (entry.stack !== undefined) lines.push(entry.stack);
  return lines.join('\n');
}

export function DiagnosticsPanel(): JSX.Element {
  const locale = useArxmlStore((s) => s.locale);
  const entries = useArxmlStore((s) => s.diagnostics);
  const appendDiagnostic = useArxmlStore((s) => s.appendDiagnostic);
  const clearDiagnostics = useArxmlStore((s) => s.clearDiagnostics);
  const [filter, setFilter] = useState<DiagnosticFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const visible = useMemo(() => {
    const filtered = entries.filter((entry) => {
      if (filter === 'error') return entry.level === 'error';
      if (filter === 'warn') return entry.level === 'warn';
      return true;
    });
    return [...filtered].reverse();
  }, [entries, filter]);

  const onCopy = (): void => {
    const text = visible.map(diagnosticText).join('\n\n');
    try {
      void navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      appendDiagnostic({
        level: 'warn',
        source: 'diagnostics',
        message: 'Clipboard unavailable',
      });
    }
  };

  return (
    <section className="diagnostics-panel" data-testid="diagnostics-panel">
      <header className="diagnostics-toolbar">
        <div className="diagnostics-filters" role="group" aria-label={t(locale, 'panels.diagnostics')}>
          <button
            type="button"
            className={`diagnostics-filter ${filter === 'all' ? 'is-active' : ''}`}
            onClick={() => setFilter('all')}
            data-testid="diagnostics-filter-all"
          >
            {t(locale, 'diagnostics.filter.all')}
          </button>
          <button
            type="button"
            className={`diagnostics-filter ${filter === 'error' ? 'is-active' : ''}`}
            onClick={() => setFilter('error')}
            data-testid="diagnostics-filter-error"
          >
            {t(locale, 'diagnostics.filter.error')}
          </button>
          <button
            type="button"
            className={`diagnostics-filter ${filter === 'warn' ? 'is-active' : ''}`}
            onClick={() => setFilter('warn')}
            data-testid="diagnostics-filter-warning"
          >
            {t(locale, 'diagnostics.filter.warning')}
          </button>
        </div>
        <div className="diagnostics-actions">
          <button
            type="button"
            className="diagnostics-button"
            onClick={onCopy}
            disabled={visible.length === 0}
            data-testid="diagnostics-copy"
          >
            {copied ? t(locale, 'diagnostics.copied') : t(locale, 'diagnostics.copy')}
          </button>
          <button
            type="button"
            className="diagnostics-button diagnostics-button-danger"
            onClick={clearDiagnostics}
            disabled={entries.length === 0}
            data-testid="diagnostics-clear"
          >
            {t(locale, 'diagnostics.clear')}
          </button>
        </div>
      </header>

      {visible.length === 0 ? (
        <p className="diagnostics-empty" data-testid="diagnostics-empty">
          {t(locale, 'diagnostics.empty')}
        </p>
      ) : (
        <ul className="diagnostics-list">
          {visible.map((entry) => {
            const expanded = expandedId === entry.id;
            const hasDetail =
              entry.detail !== undefined || entry.stack !== undefined || entry.correlationId !== undefined;
            return (
              <li
                key={entry.id}
                className={`diagnostics-item diagnostics-item--${entry.level}`}
                data-testid="diagnostics-item"
              >
                <div className="diagnostics-item-main">
                  <span className="diagnostics-time">{formatTimestamp(entry.ts)}</span>
                  <span className="diagnostics-level">{entry.level}</span>
                  <span className="diagnostics-source">{entry.source}</span>
                  <span className="diagnostics-message">{entry.message}</span>
                  {hasDetail && (
                    <button
                      type="button"
                      className="diagnostics-toggle"
                      onClick={() => setExpandedId(expanded ? null : entry.id)}
                      aria-expanded={expanded}
                      data-testid={`diagnostics-toggle-${entry.id}`}
                    >
                      {expanded ? t(locale, 'diagnostics.collapse') : t(locale, 'diagnostics.expand')}
                    </button>
                  )}
                </div>
                {expanded && (
                  <pre className="diagnostics-detail" data-testid={`diagnostics-detail-${entry.id}`}>
                    {diagnosticText(entry)}
                  </pre>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
