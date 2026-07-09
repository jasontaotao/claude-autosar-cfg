// v1.33.0 MINOR T1 — xlsx-import push channel listener.
// 主进程 xlsxEcucBatchImportHandler 成功完成后通过 webContents.send
// 推送 payload;本 hook 监听并写入 store slice。
//
// 关联 lesson: store-as-source-of-truth-for-async-args

import type { EcucInstanceRow } from '../../shared/types.js';

import { useArxmlStore } from './useArxmlStore.js';

interface XlsxImportCompletePayload {
  readonly rows: readonly EcucInstanceRow[];
  readonly source: 'manual' | 'wizard';
  // v1.36.1 PATCH M1 — main computes importedAt once and pushes it
  // verbatim. Previously the listener stamped its own Date.now()
  // here, which diverged from the main-side save timestamp by a few
  // ms (caused cross-session display jitter on the Reuse button +
  // time element).
  readonly importedAt: number;
  // v1.40.0 MINOR T3 (L1) — main pushes persistence outcome so the
  // listener can surface a warning toast when `persisted === false`.
  // The push fires only after the disk write resolves, so the value
  // reflects what actually landed on disk.
  readonly persisted: boolean;
}

/** Attach the IPC push listener for xlsx:import-complete.
 *  Returns a cleanup function for hot-reload safety.
 *
 *  v1.36.0 MINOR T3 — defensive no-op when the bridge is missing
 *  (test renders that don't preload `window.autosarApi`). Mirrors
 *  the `attachXlsxHistoryBootstrap` pattern: the listener is
 *  optional in the lifetime of the app; if the bridge is gone we
 *  return a no-op cleanup so the React `useEffect` body doesn't
 *  throw.
 */
export function attachXlsxImportListener(): () => void {
  // preload 的 onXlsxImportComplete 在内部包装了 ipcRenderer.on
  // listener,捕获到 IPC event 后以 `handler(payload)` 单参形式回调
  // (见 src/preload/index.ts:287-296)。因此本 handler 在运行时只
  // 收到 payload,签名刻意窄化为 1 参,与底层 ipcRenderer 监听器的
  // 2 参 `(_event, payload)` 原型不同;前者是公开 API 契约,后者
  // 是内部边界适配点。
  const bridge = (
    window as unknown as {
      autosarApi?: {
        onXlsxImportComplete?: (
          handler: (payload: XlsxImportCompletePayload) => void,
        ) => () => void;
      };
    }
  ).autosarApi;
  if (bridge?.onXlsxImportComplete === undefined) {
    // Bridge missing in test/dev env. xlsxLastImport stays at
    // default; no-op cleanup for the useEffect body.
    return () => undefined;
  }
  const handler = (payload: XlsxImportCompletePayload) => {
    useArxmlStore.getState().setXlsxLastImport({
      rows: payload.rows,
      source: payload.source,
      importedAt: payload.importedAt,
    });
  };
  return bridge.onXlsxImportComplete(handler);
}
