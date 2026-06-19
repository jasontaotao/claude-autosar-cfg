// ScriptOutput — Sprint 14 #1 Phase C (T13) — right column of the
// ScriptPanel.
//
// Renders the latest run output as four collapsible sections:
//   - Logs (always visible when present)
//   - Violations (script:* kind, coloured by severity)
//   - Mutations (set-param / add-child / remove-child)
//   - Status / error message (runtime-error / timeout / etc.)
//
// The Commit / Discard buttons appear only when the run finished with
// mutations (status === 'ok' AND mutations.length > 0).

import type { ScriptLog, ScriptRunResult } from '@main/script/types';
import { t } from '@shared/i18n';

export interface ScriptOutputProps {
  readonly result: ScriptRunResult | null;
  readonly logs: ReadonlyArray<ScriptLog>;
  readonly locale: 'zh-CN' | 'en';
  readonly onCommit: () => void;
  readonly onDiscard: () => void;
  readonly onClear: () => void;
}

export function ScriptOutput({
  result,
  logs,
  locale,
  onCommit,
  onDiscard,
  onClear,
}: ScriptOutputProps): JSX.Element {
  const showCommit = result !== null && result.status === 'ok' && result.mutations.length > 0;
  return (
    <section
      className="script-output"
      aria-label={t(locale, 'script.output.title')}
      data-testid="script-output"
    >
      <header className="script-output-header">
        <h3>{t(locale, 'script.output.title')}</h3>
        <button
          type="button"
          className="script-output-clear"
          onClick={onClear}
          disabled={result === null && logs.length === 0}
          data-testid="script-output-clear"
        >
          {t(locale, 'script.output.clear')}
        </button>
      </header>
      {result !== null && (
        <div
          className={`script-output-status script-output-status-${result.status}`}
          data-testid={`script-output-status-${result.status}`}
        >
          {result.status !== 'ok' && (
            <strong>
              {result.status === 'runtime-error'
                ? t(locale, 'script.error.runtime')
                : result.status === 'syntax-error'
                  ? t(locale, 'script.error.syntax')
                  : result.status === 'timeout'
                    ? t(locale, 'script.error.timeout')
                    : t(locale, 'script.error.import')}
              :{' '}
            </strong>
          )}
          {result.errorMessage ?? `${result.status} · ${result.durationMs}ms`}
        </div>
      )}
      <details open className="script-output-section" data-testid="script-output-logs">
        <summary>logs ({logs.length})</summary>
        {logs.length === 0 ? (
          <p className="muted">—</p>
        ) : (
          <ul className="script-log-list">
            {logs.map((line, i) => (
              <li
                key={`${line.ts}-${i}`}
                className={`script-log-line script-log-${line.level}`}
                data-testid={`script-log-${i}`}
              >
                <span className="script-log-level">{line.level}</span>
                <span className="script-log-message">{line.message}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
      <details open className="script-output-section" data-testid="script-output-violations">
        <summary>
          {t(locale, 'script.output.summary.violations')} ({result?.violations.length ?? 0})
        </summary>
        {result === null || result.violations.length === 0 ? (
          <p className="muted">—</p>
        ) : (
          <ul className="script-violation-list">
            {result.violations.map((v, i) => (
              <li
                key={`v-${i}`}
                className={`script-violation script-violation-${v.severity}`}
                data-testid={`script-violation-${i}`}
              >
                <span className="script-violation-kind">{v.kind}</span>
                <span className="script-violation-msg">{v.message}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
      <details open className="script-output-section" data-testid="script-output-mutations">
        <summary>
          {t(locale, 'script.output.summary.mutations')} ({result?.mutations.length ?? 0})
        </summary>
        {result === null || result.mutations.length === 0 ? (
          <p className="muted">—</p>
        ) : (
          <ul className="script-mutation-list">
            {result.mutations.map((m, i) => (
              <li
                key={`m-${i}`}
                className="script-mutation"
                data-testid={`script-mutation-${i}`}
              >
                <code>{m.kind}</code> <span className="muted">{describeMutation(m)}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
      <footer className="script-output-footer">
        <button
          type="button"
          className="script-output-commit"
          onClick={onCommit}
          disabled={!showCommit}
          data-testid="script-output-commit"
        >
          {t(locale, 'script.output.commit')}
        </button>
        <button
          type="button"
          className="script-output-discard"
          onClick={onDiscard}
          disabled={!showCommit}
          data-testid="script-output-discard"
        >
          {t(locale, 'script.output.discard')}
        </button>
      </footer>
    </section>
  );
}

function describeMutation(
  m: ScriptRunResult['mutations'][number],
): string {
  switch (m.kind) {
    case 'set-param':
      return `${m.containerPath} ${m.paramName} = ${String(m.newValue)}`;
    case 'add-child':
      return `${m.containerPath} + ${m.newShortName}`;
    case 'remove-child':
      return `${m.containerPath} - ${m.shortName}`;
  }
}