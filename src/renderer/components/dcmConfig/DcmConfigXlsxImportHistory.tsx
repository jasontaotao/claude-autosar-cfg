// v1.34.0 MINOR T2 — XlsxImportHistory surface.
//
// v1.33.0 MINOR 把 XlsxImportSlice 的 xlsxImportHistory 写入 store
// 但从未 UI surface。本组件激活该 timeline 表面(只读),并提供
// 每条 entry 的 Reuse 按钮 — 用户点 Reuse 后,useDcmConfigLauncher
// 下一次 dcm:config 用的就是历史 rows(non-destructive,
// 不重跑 IPC,行为通过 reuseFromHistory slice action 完成)。
//
// 关联 lesson: surface-stored-data-on-its-own-shot — Phase 1 UI
// cost 远小于 Phase 0 slicing(已 v1.33.0 完成) + Phase 2 IPC
// activation(本次不需要因为 Reuse 只写 xlsxLastImport,不触发
// IPC)。

import { t } from '@shared/i18n/index.js';
import type { Locale } from '@shared/i18n/index.js';

import type { XlsxImportRecord } from '../../store/slices/xlsxImportSlice.js';

interface DcmConfigXlsxImportHistoryProps {
  readonly history: readonly XlsxImportRecord[];
  readonly locale: Locale;
  readonly onReuse: (importedAt: number) => void;
}

/**
 * Read-only timeline + per-entry Reuse button. Renders an empty-state
 * line when history is empty; otherwise renders an ordered list (most
 * recent first, matching the v1.33.0 slice cap-5 + prepend-first
 * invariant). Pure presentational — no slice subscription; parent
 * (DcmConfigSuccessDialog) owns the history → store binding.
 */
export function DcmConfigXlsxImportHistory(
  props: DcmConfigXlsxImportHistoryProps,
): JSX.Element {
  const { history, locale, onReuse } = props;

  if (history.length === 0) {
    return (
      <p data-testid="xlsx-import-history-empty">
        {t(locale, 'xlsxImportHistory.empty')}
      </p>
    );
  }

  return (
    <ol className="xlsx-import-history__list">
      {history.map((record) => (
        <li
          key={record.importedAt}
          data-testid={`xlsx-import-history-row-${record.importedAt}`}
        >
          <time dateTime={new Date(record.importedAt).toISOString()}>
            {new Date(record.importedAt).toLocaleString(locale)}
          </time>
          {' — '}
          {record.source}
          {' — '}
          {t(locale, 'xlsxImportHistory.rowsCount', { count: record.rows.length })}
          <button
            type="button"
            onClick={() => onReuse(record.importedAt)}
            data-testid={`xlsx-import-history-reuse-${record.importedAt}`}
          >
            {t(locale, 'xlsxImportHistory.reuseButton')}
          </button>
        </li>
      ))}
    </ol>
  );
}
