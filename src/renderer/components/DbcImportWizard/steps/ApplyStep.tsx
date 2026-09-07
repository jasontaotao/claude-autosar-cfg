// ApplyStep — full-import wizard Step 4（spec §10.2.4 成功后分支）。
//
// 提交成功后的只读确认页：applied / kept / deleted 计数 + provenance
// manifest 路径。onImported 已由 shell 在 commit 成功后触发（host 负责
// 项目 reload）。

import { t, type Locale } from '@shared/i18n/index.js';

interface ApplyStepProps {
  readonly locale: Locale;
  readonly applied: number;
  readonly kept: number;
  readonly deleted: number;
  readonly manifestPath: string;
  readonly onFinish: () => void;
}

export function ApplyStep({
  locale,
  applied,
  kept,
  deleted,
  manifestPath,
  onFinish,
}: ApplyStepProps): JSX.Element {
  return (
    <section className="dbc-wizard-step" data-testid="dbc-wizard-step-apply">
      <h3 className="dbc-wizard-step-title">{t(locale, 'dbc.import.apply.title')}</h3>
      <p className="dbc-wizard-step-desc" data-testid="dbc-wizard-apply-counts">
        {t(locale, 'dbc.import.apply.body', { applied, kept, deleted })}
      </p>
      <p className="dbc-wizard-path" data-testid="dbc-wizard-apply-manifest">
        {t(locale, 'dbc.import.apply.manifest', { path: manifestPath })}
      </p>
      <div className="dbc-wizard-actions">
        <button
          type="button"
          className="dbc-wizard-btn dbc-wizard-btn-primary"
          onClick={onFinish}
          data-testid="dbc-wizard-finish"
        >
          {t(locale, 'dbc.import.apply.finish')}
        </button>
      </div>
    </section>
  );
}
