// SourceTargetStep — full-import wizard Step 1（spec §10.2.1）。
//
// 选择 DBC 文件 → 无 targetNode 的 discovery 预览 → 目标节点下拉只来自
// preview.nodes（DBC `BU_` 名称，禁止使用 EcuC ECU-INSTANCE shortName）。

import { t, type Locale } from '@shared/i18n/index.js';
import type { DbcFullImportPreview } from '@shared/types/dbc-import';

interface SourceTargetStepProps {
  readonly locale: Locale;
  readonly dbcPath?: string;
  readonly discovery?: DbcFullImportPreview;
  readonly targetNode?: string;
  readonly busy: boolean;
  readonly onPick: () => void;
  readonly onNodeChange: (node: string) => void;
}

export function SourceTargetStep({
  locale,
  dbcPath,
  discovery,
  targetNode,
  busy,
  onPick,
  onNodeChange,
}: SourceTargetStepProps): JSX.Element {
  return (
    <section className="dbc-wizard-step" data-testid="dbc-wizard-step-source-target">
      <div className="dbc-wizard-card">
        <div className="dbc-wizard-row-line">
          <span className="dbc-wizard-field-label">{t(locale, 'dbc.import.source.path')}</span>
          <span className="dbc-wizard-path" data-testid="dbc-wizard-dbc-path">
            {dbcPath ?? ''}
          </span>
          <button
            type="button"
            className="dbc-wizard-btn"
            onClick={onPick}
            disabled={busy}
            data-testid="dbc-wizard-pick-file"
          >
            {busy
              ? t(locale, 'dbc.import.pick.picking')
              : dbcPath === undefined
                ? t(locale, 'dbc.import.select.button')
                : t(locale, 'dbc.import.pick.another')}
          </button>
        </div>
        {busy && discovery === undefined && (
          <p className="dbc-wizard-step-desc" data-testid="dbc-wizard-discovering">
            {t(locale, 'dbc.import.source.discovering')}
          </p>
        )}
        {dbcPath !== undefined && (
          <label className="dbc-wizard-field">
            <span className="dbc-wizard-field-label">
              {t(locale, 'dbc.import.source.node.label')}
            </span>
            <select
              className="dbc-wizard-select"
              value={targetNode ?? ''}
              onChange={(e): void => onNodeChange(e.target.value)}
              disabled={busy}
              data-testid="dbc-wizard-target-node"
            >
              <option value="">{t(locale, 'dbc.import.source.node.empty')}</option>
              {(discovery?.nodes ?? []).map((node) => (
                <option key={node} value={node}>
                  {node}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </section>
  );
}
