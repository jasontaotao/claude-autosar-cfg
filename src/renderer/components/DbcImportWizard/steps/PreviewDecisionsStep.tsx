// PreviewDecisionsStep — full-import wizard Step 3（spec §10.2.3 + §10.3）。
//
// 行按 Com / CanIf / PduR 分组并按键（模块, 路径）排序；展开行显示字段级
// diff 与精确 source badge（Auto / Derived / Profile-default / Unmapped /
// Error）；warning 按 code 分组、本地化 label + count + 可展开明细；
// stats 展示含 skipped 计数。warnings / rows 各自独立滚动，commit 按钮
// 常驻 actions 栏（不随内容溢出而消失）。

import { useMemo, useState } from 'react';

import type { DbcWarningCode } from '@core/dbc/dbm.js';
import { t, type Locale } from '@shared/i18n/index.js';
import type {
  DbcImportCategory,
  DbcImportDecision,
  DbcFullImportPreview,
  DbcImportRow,
} from '@shared/types/dbc-import';

type WarningGroup = {
  readonly code: DbcWarningCode;
  readonly warnings: readonly { readonly elementRef: string; readonly message: string }[];
};

/** 固定分组（模块名即真实 shortName，非法模块名不渲染）。 */
const MODULES = ['Com', 'CanIf', 'PduR'] as const;

function categoryKey(category: DbcImportCategory): Parameters<typeof t>[1] {
  switch (category) {
    case 'added':
      return 'dbc.import.category.added';
    case 'updated':
      return 'dbc.import.category.updated';
    case 'locally-modified':
      return 'dbc.import.category.locallyModified';
    case 'conflict':
      return 'dbc.import.category.conflict';
    case 'converged':
      return 'dbc.import.category.converged';
    case 'removed-in-dbc':
      return 'dbc.import.category.removedInDbc';
  }
}

function warningKey(code: DbcWarningCode): Parameters<typeof t>[1] {
  return `dbc.import.warning.${code}` as Parameters<typeof t>[1];
}

function warningGroups(preview: DbcFullImportPreview): readonly WarningGroup[] {
  const groups = new Map<DbcWarningCode, Array<WarningGroup['warnings'][number]>>();
  for (const warning of preview.warnings) {
    const current = groups.get(warning.code);
    if (current === undefined) groups.set(warning.code, [warning]);
    else current.push(warning);
  }
  return [...groups].map(([code, warnings]) => ({ code, warnings }));
}

/** (module, path) 排序——commit 的顺序与 UI 展示顺序必须一致。 */
export function sortRowsByModulePath<T extends Pick<DbcImportRow, 'module' | 'path'>>(
  rows: readonly T[],
): readonly T[] {
  return [...rows].sort((a, b) => {
    if (a.module !== b.module) return a.module < b.module ? -1 : 1;
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return 0;
  });
}

function rowsForModule(
  rows: readonly DbcImportRow[],
  module: (typeof MODULES)[number],
): readonly DbcImportRow[] {
  return sortRowsByModulePath(rows).filter((row) => row.module === module);
}

/** 字段 diff 末段 = UI 显示键（definition spine 末段，§8.1）。 */
function diffLabel(paramKey: string): string {
  const index = paramKey.lastIndexOf('/');
  return index >= 0 ? paramKey.slice(index + 1) : paramKey;
}

interface PreviewDecisionsStepProps {
  readonly locale: Locale;
  readonly preview: DbcFullImportPreview;
  readonly decisions: ReadonlyMap<string, DbcImportDecision>;
  readonly committing: boolean;
  readonly onDecisionChange: (path: string, decision: DbcImportDecision) => void;
  readonly onCommit: () => void;
  readonly onBack: () => void;
}

export function PreviewDecisionsStep({
  locale,
  preview,
  decisions,
  committing,
  onDecisionChange,
  onCommit,
  onBack,
}: PreviewDecisionsStepProps): JSX.Element {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const groups = useMemo(() => warningGroups(preview), [preview]);
  const hasDirtyTarget = (['Com', 'CanIf', 'PduR'] as const).some(
    (module) => preview.targetModules[module].dirty,
  );

  const toggleRow = (path: string): void => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <section className="dbc-wizard-step" data-testid="dbc-wizard-step-preview">
      <div className="dbc-wizard-stats" data-testid="dbc-wizard-stats">
        <span className="dbc-wizard-stat" data-testid="dbc-wizard-stat-messages">
          {t(locale, 'dbc.import.preview.stats.messages', { count: preview.stats.messages })}
        </span>
        <span className="dbc-wizard-stat" data-testid="dbc-wizard-stat-signals">
          {t(locale, 'dbc.import.preview.stats.signals', { count: preview.stats.signals })}
        </span>
        <span className="dbc-wizard-stat" data-testid="dbc-wizard-stat-skipped-irrelevant">
          {t(locale, 'dbc.import.preview.stats.skippedIrrelevant', {
            count: preview.stats.skippedIrrelevantMessages,
          })}
        </span>
        <span className="dbc-wizard-stat" data-testid="dbc-wizard-stat-skipped-multiplexed">
          {t(locale, 'dbc.import.preview.stats.skippedMultiplexed', {
            count: preview.stats.skippedMultiplexedSignals,
          })}
        </span>
      </div>

      {hasDirtyTarget && (
        <p className="dbc-wizard-dirty" data-testid="dbc-wizard-dirty-warning">
          {t(locale, 'dbc.import.preview.dirty.saveFirst')}
        </p>
      )}

      {groups.length > 0 && (
        <div className="dbc-wizard-warnings-scroll" data-testid="dbc-wizard-warnings-scroll">
          <h3 className="dbc-wizard-step-title">
            {t(locale, 'dbc.import.preview.warnings.title', { count: preview.warnings.length })}
          </h3>
          {groups.map((group) => (
            <div
              className="dbc-wizard-warning-group-wrap"
              data-testid={`dbc-wizard-warning-group-${group.code}`}
              key={group.code}
            >
              <details
                className="dbc-wizard-warning-group"
                data-testid={`dbc-wizard-warning-detail-${group.code}`}
              >
                <summary>
                  <span className="dbc-wizard-warning-label">
                    {t(locale, warningKey(group.code))}
                  </span>{' '}
                  <span className="dbc-wizard-warning-count">({group.warnings.length})</span>
                </summary>
                <ul className="dbc-wizard-warning-items">
                  {group.warnings.map((warning, index) => (
                    <li key={`${warning.elementRef}-${index}`}>
                      <code>{warning.elementRef}</code> — {warning.message}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </div>
      )}

      <div className="dbc-wizard-rows-scroll" data-testid="dbc-wizard-rows-scroll">
        {preview.rows.length === 0 ? (
          <p className="dbc-wizard-empty">{t(locale, 'dbc.import.preview.noRows')}</p>
        ) : (
          MODULES.map((module) => {
            const rows = rowsForModule(preview.rows, module);
            if (rows.length === 0) return null;
            return (
              <section
                className="dbc-wizard-group"
                data-testid={`dbc-wizard-group-${module}`}
                key={module}
              >
                <h3 className="dbc-wizard-group-title">{module}</h3>
                <table className="dbc-wizard-table">
                  <thead>
                    <tr>
                      <th scope="col">{t(locale, 'dbc.import.preview.table.path')}</th>
                      <th scope="col">{t(locale, 'dbc.import.preview.table.name')}</th>
                      <th scope="col">{t(locale, 'dbc.import.preview.table.category')}</th>
                      <th scope="col">{t(locale, 'dbc.import.preview.table.decision')}</th>
                      <th scope="col" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const decision = decisions.get(row.path) ?? row.defaultDecision;
                      const isExpanded = expanded.has(row.path);
                      return (
                        <tr key={row.path} data-testid={`dbc-wizard-row-${row.path}`}>
                          <td>
                            <button
                              type="button"
                              className="dbc-wizard-row-toggle"
                              onClick={(): void => toggleRow(row.path)}
                              aria-expanded={isExpanded}
                              data-testid={`dbc-wizard-row-expand-${row.path}`}
                            >
                              {isExpanded ? '▾' : '▸'}
                            </button>
                            <span className="dbc-wizard-path">{row.path}</span>
                          </td>
                          <td>{row.shortName}</td>
                          <td>
                            <span className={`dbc-wizard-badge badge-${row.category}`}>
                              {t(locale, categoryKey(row.category))}
                            </span>
                          </td>
                          <td>
                            <select
                              className="dbc-wizard-select"
                              value={decision}
                              onChange={(e): void =>
                                onDecisionChange(row.path, e.target.value as DbcImportDecision)
                              }
                              disabled={committing}
                              data-testid={`dbc-wizard-decision-${row.path}`}
                            >
                              <option value="import">
                                {t(locale, 'dbc.import.decision.import')}
                              </option>
                              <option value="keep-local">
                                {t(locale, 'dbc.import.decision.keepLocal')}
                              </option>
                              <option value="delete">
                                {t(locale, 'dbc.import.decision.delete')}
                              </option>
                            </select>
                          </td>
                          <td>
                            {isExpanded && row.fieldDiffs.length > 0 && (
                              <div
                                className="dbc-wizard-diffs"
                                data-testid={`dbc-wizard-diffs-${row.path}`}
                              >
                                <table className="dbc-wizard-diff-table">
                                  <thead>
                                    <tr>
                                      <th scope="col">Parameter</th>
                                      <th scope="col">
                                        {t(locale, 'dbc.import.preview.diff.local')}
                                      </th>
                                      <th scope="col">
                                        {t(locale, 'dbc.import.preview.diff.incoming')}
                                      </th>
                                      <th scope="col">
                                        {t(locale, 'dbc.import.preview.diff.source')}
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.fieldDiffs.map((diff, index) => (
                                      <tr key={`${diff.paramKey}-${index}`}>
                                        <td className="dbc-wizard-diff-param">
                                          {diffLabel(diff.paramKey)}
                                        </td>
                                        <td>
                                          {diff.local !== undefined ? String(diff.local) : '—'}
                                        </td>
                                        <td>
                                          {diff.incoming !== undefined
                                            ? String(diff.incoming)
                                            : '—'}
                                        </td>
                                        <td>
                                          <span
                                            className={`dbc-wizard-source dbc-wizard-source-${diff.source}`}
                                            data-testid={`dbc-wizard-source-${diff.source}`}
                                          >
                                            {diff.source}
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            );
          })
        )}
      </div>

      <div className="dbc-wizard-actions">
        <button
          type="button"
          className="dbc-wizard-btn"
          onClick={onBack}
          disabled={committing}
          data-testid="dbc-wizard-back"
        >
          {t(locale, 'dbc.import.action.back')}
        </button>
        <button
          type="button"
          className="dbc-wizard-btn dbc-wizard-btn-primary"
          onClick={onCommit}
          disabled={committing}
          data-testid="dbc-wizard-commit"
        >
          {committing
            ? t(locale, 'dbc.import.action.committing')
            : t(locale, 'dbc.import.action.commit')}
        </button>
      </div>
    </section>
  );
}
