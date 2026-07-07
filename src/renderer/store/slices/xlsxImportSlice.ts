// v1.33.0 MINOR T1 — xlsx-import 状态切片。
//
// 之前 launcher 的 promptAndOpen 传 xlsxRows: [] 占位符(从 v1.31.x
// 遗留到 v1.32.x)。本切片把最近一次 xlsx 导入结果落地到 store,
// 消除 placeholder debt (lesson store-as-source-of-truth-for-async-args)。
//
// 关联 IPC: xlsxEcucBatchImportHandler 成功完成后,main 端通过
// XLSX_IMPORT_COMPLETE push channel 广播 payload;renderer 端通过
// attachXlsxImportListener() 监听并写入本 slice。

import type { StateCreator } from 'zustand';

import type { EcucInstanceRow } from '../../../shared/types.js';
import type { ArxmlState } from '../useArxmlStore.js';

export interface XlsxImportRecord {
  readonly rows: readonly EcucInstanceRow[];
  readonly source: 'manual' | 'wizard';
  readonly importedAt: number;
}

export interface XlsxImportSlice {
  readonly xlsxLastImport: XlsxImportRecord | null;
  readonly xlsxImportHistory: readonly XlsxImportRecord[];
  setXlsxLastImport: (record: XlsxImportRecord | null) => void;
  /** v1.34.0 MINOR — Reuse button hook. Reads the historical record
   * matching `importedAt` from `xlsxImportHistory` and re-applies it
   * via `setXlsxLastImport`. The caller (renderer
   * `<DcmConfigXlsxImportHistory>` Reuse button click) is the only
   * trigger; we do NOT mutate `xlsxImportHistory` (history stays
   * append-only; cap-at-5 + prepend-first invariant preserved).
   *
   * Defensive: if `importedAt` is not in history (stale entry, race,
   * etc.), logs `console.warn` and no-ops. Slice invariant preserved. */
  reuseFromHistory: (importedAt: number) => void;
}

const MAX_HISTORY = 5;

export const createXlsxImportSlice: StateCreator<ArxmlState, [], [], XlsxImportSlice> = (set) => ({
  xlsxLastImport: null,
  xlsxImportHistory: [],
  setXlsxLastImport: (record) =>
    set((s) => ({
      xlsxLastImport: record,
      xlsxImportHistory:
        record === null ? [] : [record, ...s.xlsxImportHistory].slice(0, MAX_HISTORY),
    })),
  reuseFromHistory: (importedAt) =>
    set((s) => {
      const entry = s.xlsxImportHistory.find((r) => r.importedAt === importedAt);
      if (entry === undefined) {
        console.warn(`XlsxImportSlice.reuseFromHistory: no entry at importedAt=${importedAt}`);
        return s; // defensive no-op; preserve slice invariant
      }
      return {
        ...s,
        xlsxLastImport: entry,
      };
    }),
});
