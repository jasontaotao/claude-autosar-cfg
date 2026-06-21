// ValidationPanel — S3-T5: surface validation results from the store.
// Reads `validationErrors` and `lastValidatedAt` from useArxmlStore and
// renders one of three states: empty (no doc), valid (no errors), or
// invalid (errors grouped by kind with click-to-select).
//
// Sprint 11 Phase 1 (Option A) i18n: title / subtitle / counts go
// through t(locale, key).
//
// Sprint 14 #1 Phase C (T15): appends a "Script 校验" collapsible
// group at the bottom of the panel that lists scripts of kind
// 'validator' and their latest run violations. The group is hidden
// when no validator script has been run, or when the latest run has
// no violations. Phase D will wire a click-to-open-ScriptPanel
// affordance; for now the rows render the violation message as
// read-only text.

import type { JSX } from 'react';

import type { ValidationError } from '@core/validation';
import { t } from '@shared/i18n';

import { useArxmlStore } from '../store/useArxmlStore';
import { useScriptStore } from '../store/useScriptStore';

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
 * Sprint 10 #3: branch on err.paramKey to fix the element-level click
 * bug. Pre-Sprint 10 #3, this function always stripped the trailing
 * segment from err.path, which produced the wrong click target for
 * element-level errors (multiplicity / cross-ref / ref-dest / ref-cycle)
 * where err.path IS the element path itself (no paramKey).
 *
 * - param-level errors (range / enum / reference / required / schema):
 *   err.path = container path + '/' + paramKey. Strip the paramKey
 *   so the click selects the container that owns the param.
 * - element-level errors (multiplicity / cross-ref / ref-dest /
 *   ref-cycle): paramKey is undefined. err.path is the element path
 *   itself. Return it unchanged so the click selects the element.
 */
function extractContainerPath(err: ValidationError): string {
  if (err.paramKey === undefined) {
    return err.path;
  }
  const idx = err.path.lastIndexOf('/');
  return idx > 0 ? err.path.slice(0, idx) : err.path;
}

export function ValidationPanel({ embedded = false }: { embedded?: boolean }): JSX.Element {
  const errors = useArxmlStore((s) => s.validationErrors);
  const lastValidatedAt = useArxmlStore((s) => s.lastValidatedAt);
  const select = useArxmlStore((s) => s.select);
  const locale = useArxmlStore((s) => s.locale);
  // Sprint 14 / T15 — Script 校验 group. Read validator scripts + their
  // latest run from the script store. The group only renders when at
  // least one validator exists AND has produced at least one
  // violation. We compute it before the early-return paths so the
  // group can attach to every state (empty / valid / invalid).
  const validatorScripts = useScriptStore((s) => s.scripts.filter((x) => x.kind === 'validator'));
  const scriptRunResult = useScriptStore((s) => s.runResult);
  const hasScriptGroup =
    validatorScripts.length > 0 &&
    scriptRunResult !== null &&
    scriptRunResult.violations.length > 0;
  const scriptGroupBlock = hasScriptGroup ? (
    <details className="validation-script-group" data-testid="validation-script-group" open>
      <summary className="validation-script-group-summary">
        <span className="kind-badge kind-script-violation">script:*</span>
        <span className="kind-count">{scriptRunResult?.violations.length ?? 0}</span>
        <span className="validation-script-group-label">{t(locale, 'script.violation.group')}</span>
      </summary>
      <ul className="error-list">
        {scriptRunResult?.violations.map((v, i) => (
          <li key={`sv-${i}`}>
            <span
              className="error-row validation-script-violation-row"
              title={v.message}
              data-testid={`script-violation-row-${i}`}
            >
              <code className="error-path">{v.kind}</code>
              <span className="error-msg">{v.message}</span>
            </span>
          </li>
        ))}
      </ul>
    </details>
  ) : null;

  // No doc loaded
  if (lastValidatedAt === null) {
    const inner = (
      <>
        <p className="muted">{t(locale, 'arxmlPanel.empty')}</p>
        {scriptGroupBlock}
      </>
    );
    if (embedded) {
      return (
        <div className="validation-panel-embedded" data-testid="validation-embedded-empty">
          {inner}
        </div>
      );
    }
    return (
      <aside className="validation-panel empty" aria-label={t(locale, 'validation.title')}>
        {inner}
      </aside>
    );
  }

  // Doc loaded, no errors
  if (errors.length === 0) {
    if (embedded) {
      return (
        <div className="validation-panel-embedded" data-testid="validation-embedded-valid">
          <p className="muted">{t(locale, 'validation.subtitle')}</p>
          {scriptGroupBlock}
        </div>
      );
    }
    return (
      <aside
        className="validation-panel valid"
        aria-label={t(locale, 'validation.title')}
        role="status"
      >
        <header>
          <h3>{t(locale, 'validation.title')}</h3>
          <span className="badge badge-ok">{t(locale, 'validation.allPassed')}</span>
        </header>
        <p className="muted">{t(locale, 'validation.subtitle')}</p>
        {scriptGroupBlock}
      </aside>
    );
  }

  // Doc loaded with errors — group by kind
  const grouped = groupByKind(errors);
  const count = errors.length;

  if (embedded) {
    return (
      <div className="validation-panel-embedded" data-testid="validation-embedded-invalid">
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
                          onClick={() => select(extractContainerPath(err))}
                          title={err.message}
                          data-testid={`error-row-${i}`}
                        >
                          <code className="error-path">
                            {err.paramKey !== undefined
                              ? `${err.path} (${err.paramKey})`
                              : err.path}
                          </code>
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
      </div>
    );
  }

  return (
    <aside
      className="validation-panel invalid"
      aria-label={t(locale, 'validation.title')}
      role="alert"
    >
      <header>
        <h3>{t(locale, 'validation.title')}</h3>
        <span className="badge badge-error">
          {count === 1
            ? t(locale, 'validation.violation', { count })
            : t(locale, 'validation.violations', { count })}
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
                        onClick={() => select(extractContainerPath(err))}
                        title={err.message}
                        data-testid={`error-row-${i}`}
                      >
                        <code className="error-path">
                          {err.paramKey !== undefined ? `${err.path} (${err.paramKey})` : err.path}
                        </code>
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
      {scriptGroupBlock}
    </aside>
  );
}
