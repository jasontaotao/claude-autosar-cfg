// v1.33.0 MINOR T1 — xlsx-import push channel listener.
// 主进程 xlsxEcucBatchImportHandler 成功完成后通过 webContents.send
// 推送 payload;本 hook 监听并写入 store slice。
//
// 关联 lesson: store-as-source-of-truth-for-async-args

import { useArxmlStore } from './useArxmlStore.js';
import type { EcucInstanceRow } from '../../shared/types.js';

interface XlsxImportCompletePayload {
  readonly rows: readonly EcucInstanceRow[];
  readonly source: 'manual' | 'wizard';
}

/** Attach the IPC push listener for xlsx:import-complete.
 *  Returns a cleanup function for hot-reload safety. */
export function attachXlsxImportListener(): () => void {
  const handler = (payload: XlsxImportCompletePayload) => {
    useArxmlStore.getState().setXlsxLastImport({
      rows: payload.rows,
      source: payload.source,
      importedAt: Date.now(),
    });
  };
  return window.autosarApi.onXlsxImportComplete(handler);
}
