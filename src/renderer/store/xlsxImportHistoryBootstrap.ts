// v1.36.0 MINOR T3 — xlsxImportHistory bootstrap.
//
// Calls xlsxHistoryLoad on App mount and writes the result to
// XlsxImportSlice via hydrateXlsxHistory. Mirrors the v1.33.0
// attachXlsxImportListener pattern (return cleanup fn for hot-reload
// safety; same module layout in store/).

import { useArxmlStore } from './useArxmlStore.js';
import type { MainXlsxImportRecord } from '../../main/xlsxHistoryStorage.js';

interface XlsHistoryLoadSuccess {
  readonly ok: true;
  readonly value: readonly MainXlsxImportRecord[];
}
interface XlsHistoryLoadFailure {
  readonly ok: false;
  readonly error: { readonly kind: 'read-failed'; readonly message: string };
}

type XlsHistoryLoadResponse = XlsHistoryLoadSuccess | XlsHistoryLoadFailure;

export function attachXlsxHistoryBootstrap(): () => void {
  // The renderer bridge is a thin wrapper around ipcRenderer.invoke;
  // the envelope matches the main-side handler's return shape.
  const bridge = (window as unknown as {
    autosarApi?: {
      xlsxHistoryLoad?: () => Promise<XlsHistoryLoadResponse>;
    };
  }).autosarApi;
  if (bridge?.xlsxHistoryLoad === undefined) {
    // Defensive: bridge missing in test/dev env. Resolve silently —
    // xlsxImportHistory stays at default [].
    return () => undefined;
  }
  let cancelled = false;
  void bridge
    .xlsxHistoryLoad()
    .then((res) => {
      if (cancelled) return;
      if (res.ok) {
        useArxmlStore.getState().hydrateXlsxHistory(res.value);
      } else {
        // Defensive: load failed (e.g., disk error). The session
        // starts with empty history; user can re-import to repopulate.
        // eslint-disable-next-line no-console
        console.warn(
          `xlsxImportHistoryBootstrap: load failed (${res.error.kind}: ${res.error.message}); starting with empty history`,
        );
      }
    })
    .catch((e) => {
      if (cancelled) return;
      // eslint-disable-next-line no-console
      console.warn(
        `xlsxImportHistoryBootstrap: unexpected error: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    });
  return () => {
    cancelled = true;
  };
}
