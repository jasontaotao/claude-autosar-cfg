// MappingPolicyStep — full-import wizard Step 2（spec §10.2.2）。
//
// 显示当前 profileId；配置 PduId base/step/order 与 UL 命名模板。任何变更
// 由 shell 重新触发 mapping 预览（hash 变化），旧的预览结果被 seq guard 丢弃。
// 数值输入为十进制，非法/空输入不产生 dispatch（保持既有状态不变）。

import type { PduIdPolicy, UpperLayerNamingPolicy } from '@core/dbc/profile.js';
import { t, type Locale } from '@shared/i18n/index.js';

interface MappingPolicyStepProps {
  readonly locale: Locale;
  readonly profileId: string;
  readonly pduIdPolicy?: Partial<PduIdPolicy>;
  readonly upperLayerNaming?: Partial<UpperLayerNamingPolicy>;
  readonly reparsing: boolean;
  readonly onPolicyChange: (
    pduIdPolicy?: Partial<PduIdPolicy>,
    upperLayerNaming?: Partial<UpperLayerNamingPolicy>,
  ) => void;
  readonly onNext: () => void;
}

/** 十进制正整数解析；空/非法返回 undefined（不覆盖既有值）。 */
function parseDecimal(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function MappingPolicyStep({
  locale,
  profileId,
  pduIdPolicy,
  upperLayerNaming,
  reparsing,
  onPolicyChange,
  onNext,
}: MappingPolicyStepProps): JSX.Element {
  const ulEnabled = upperLayerNaming?.enabled ?? false;

  return (
    <section className="dbc-wizard-step" data-testid="dbc-wizard-step-policy">
      <div className="dbc-wizard-card">
        <div className="dbc-wizard-row-line">
          <span className="dbc-wizard-field-label">{t(locale, 'dbc.import.policy.profile')}</span>
          <span className="dbc-wizard-profile-id" data-testid="dbc-wizard-profile-id">
            {profileId}
          </span>
        </div>

        <h3 className="dbc-wizard-step-title">{t(locale, 'dbc.import.policy.pduId.title')}</h3>
        <div className="dbc-wizard-grid">
          <label className="dbc-wizard-field">
            <span className="dbc-wizard-field-label">
              {t(locale, 'dbc.import.policy.pduId.txBase')}
            </span>
            <input
              type="number"
              min={0}
              step={1}
              className="dbc-wizard-input"
              defaultValue={pduIdPolicy?.txBase?.toString(10) ?? ''}
              onChange={(e): void => {
                const value = parseDecimal(e.target.value);
                if (value === undefined || value === pduIdPolicy?.txBase) return;
                onPolicyChange({ ...pduIdPolicy, txBase: value }, undefined);
              }}
              aria-label={t(locale, 'dbc.import.policy.pduId.txBase')}
              data-testid="dbc-wizard-pdu-tx-base"
            />
          </label>
          <label className="dbc-wizard-field">
            <span className="dbc-wizard-field-label">
              {t(locale, 'dbc.import.policy.pduId.rxBase')}
            </span>
            <input
              type="number"
              min={0}
              step={1}
              className="dbc-wizard-input"
              defaultValue={pduIdPolicy?.rxBase?.toString(10) ?? ''}
              onChange={(e): void => {
                const value = parseDecimal(e.target.value);
                if (value === undefined || value === pduIdPolicy?.rxBase) return;
                onPolicyChange({ ...pduIdPolicy, rxBase: value }, undefined);
              }}
              aria-label={t(locale, 'dbc.import.policy.pduId.rxBase')}
              data-testid="dbc-wizard-pdu-rx-base"
            />
          </label>
          <label className="dbc-wizard-field">
            <span className="dbc-wizard-field-label">
              {t(locale, 'dbc.import.policy.pduId.step')}
            </span>
            <input
              type="number"
              min={1}
              step={1}
              className="dbc-wizard-input"
              defaultValue={pduIdPolicy?.step?.toString(10) ?? ''}
              onChange={(e): void => {
                const value = parseDecimal(e.target.value);
                if (value === undefined || value < 1 || value === pduIdPolicy?.step) return;
                onPolicyChange({ ...pduIdPolicy, step: value }, undefined);
              }}
              aria-label={t(locale, 'dbc.import.policy.pduId.step')}
              data-testid="dbc-wizard-pdu-step"
            />
          </label>
          <label className="dbc-wizard-field">
            <span className="dbc-wizard-field-label">
              {t(locale, 'dbc.import.policy.pduId.order')}
            </span>
            <select
              className="dbc-wizard-select"
              value={pduIdPolicy?.order ?? 'document-order'}
              onChange={(e): void => {
                const order = e.target.value as PduIdPolicy['order'];
                onPolicyChange({ ...pduIdPolicy, order }, undefined);
              }}
              data-testid="dbc-wizard-pdu-order"
            >
              <option value="document-order">
                {t(locale, 'dbc.import.policy.pduId.order.document')}
              </option>
              <option value="shortName-order">
                {t(locale, 'dbc.import.policy.pduId.order.shortName')}
              </option>
            </select>
          </label>
        </div>

        <h3 className="dbc-wizard-step-title">{t(locale, 'dbc.import.policy.ul.title')}</h3>
        <div className="dbc-wizard-grid">
          <label className="dbc-wizard-checkbox">
            <input
              type="checkbox"
              checked={ulEnabled}
              onChange={(e): void => {
                onPolicyChange(undefined, { ...upperLayerNaming, enabled: e.target.checked });
              }}
              data-testid="dbc-wizard-ul-enabled"
            />
            <span>{t(locale, 'dbc.import.policy.ul.enabled')}</span>
          </label>
          <label className="dbc-wizard-field">
            <span className="dbc-wizard-field-label">
              {t(locale, 'dbc.import.policy.ul.txTemplate')}
            </span>
            <input
              type="text"
              className="dbc-wizard-input"
              defaultValue={upperLayerNaming?.txTemplate ?? ''}
              onChange={(e): void => {
                onPolicyChange(undefined, { ...upperLayerNaming, txTemplate: e.target.value });
              }}
              disabled={!ulEnabled}
              aria-label={t(locale, 'dbc.import.policy.ul.txTemplate')}
              data-testid="dbc-wizard-ul-tx-template"
            />
          </label>
          <label className="dbc-wizard-field">
            <span className="dbc-wizard-field-label">
              {t(locale, 'dbc.import.policy.ul.rxTemplate')}
            </span>
            <input
              type="text"
              className="dbc-wizard-input"
              defaultValue={upperLayerNaming?.rxTemplate ?? ''}
              onChange={(e): void => {
                onPolicyChange(undefined, { ...upperLayerNaming, rxTemplate: e.target.value });
              }}
              disabled={!ulEnabled}
              aria-label={t(locale, 'dbc.import.policy.ul.rxTemplate')}
              data-testid="dbc-wizard-ul-rx-template"
            />
          </label>
        </div>
      </div>

      <div className="dbc-wizard-actions">
        <button
          type="button"
          className="dbc-wizard-btn dbc-wizard-btn-primary"
          onClick={onNext}
          disabled={reparsing}
          data-testid="dbc-wizard-next"
        >
          {reparsing
            ? t(locale, 'dbc.import.policy.reparsing')
            : t(locale, 'dbc.import.preview.next')}
        </button>
      </div>
    </section>
  );
}
