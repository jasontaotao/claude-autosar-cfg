// ValidationPanel — S3-T5: surface validation results from the store.
// Reads `validationErrors` and `lastValidatedAt` from useArxmlStore and
// renders one of three states: empty (no doc), valid (no errors), or
// invalid (errors grouped by kind with click-to-select).

import type { JSX } from 'react';

import type { ValidationError } from '@core/validation';

import { useArxmlStore } from '../store/useArxmlStore';

import './ValidationPanel.css';

/**
 * Group errors by their `kind` for the collapsible sectioned display.
 * Pure helper — extracted so the render stays readable.
 */
function groupByKind(
  errors: readonly ValidationError[],
): Record<string, readonly ValidationError[]> {
  const acc: Record<string, ValidationError[]> = {};
  for (const err of errors) {
    const bucket = acc[err.kind] ?? [];
    bucket.push(err);
    acc[err.kind] = bucket;
  }
  return acc;
}

/**
 * Strip the trailing `/<paramKey>` from a full param path so the click
 * handler selects the parent container (where the param lives) rather
 * than a non-existent leaf.
 */
function extractContainerPath(paramPath: string): string {
  const idx = paramPath.lastIndexOf('/');
  return idx > 0 ? paramPath.slice(0, idx) : paramPath;
}

export function ValidationPanel(): JSX.Element {
  const errors = useArxmlStore((s) => s.validationErrors);
  const lastValidatedAt = useArxmlStore((s) => s.lastValidatedAt);
  const select = useArxmlStore((s) => s.select);

  // No doc loaded
  if (lastValidatedAt === null) {
    return (
      <aside className="validation-panel empty" aria-label="Validation">
        <p className="muted">No document loaded.</p>
      </aside>
    );
  }

  // Doc loaded, no errors
  if (errors.length === 0) {
    return (
      <aside className="validation-panel valid" aria-label="Validation" role="status">
        <header>
          <h3>Validation</h3>
          <span className="badge badge-ok">All checks passed</span>
        </header>
        <p className="muted">ECUC subset schema applied. Edit a param to revalidate.</p>
      </aside>
    );
  }

  // Doc loaded with errors — group by kind
  const grouped = groupByKind(errors);
  const count = errors.length;

  return (
    <aside className="validation-panel invalid" aria-label="Validation" role="alert">
      <header>
        <h3>Validation</h3>
        <span className="badge badge-error">
          {count} violation{count === 1 ? '' : 's'}
        </span>
      </header>
      <ul className="kind-list">
        {Object.entries(grouped).map(([kind, items]) => (
          <li key={kind}>
            <details open>
              <summary>
                <span className={`kind-badge kind-${kind}`}>{kind}</span>
                <span className="kind-count">{items.length}</span>
              </summary>
              <ul className="error-list">
                {items.map((err, i) => {
                  const key = `${err.path}-${err.paramKey ?? ''}-${i}`;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        className="error-row"
                        onClick={() => select(extractContainerPath(err.path))}
                        title={err.message}
                        data-testid={`error-row-${i}`}
                      >
                        <code className="error-path">{err.paramKey ?? err.path}</code>
                        <span className="error-msg">{err.message}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </aside>
  );
}
