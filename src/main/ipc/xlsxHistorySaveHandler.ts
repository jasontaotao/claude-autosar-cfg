// v1.36.0 MINOR T2 — xlsxImportHistory save handler.
//
// Pure thin wrapper around writeXlsxHistory (T1). Called by
// xlsxEcucBatchImportHandler (T3) after the xlsx:import-complete
// broadcast — not exposed via the preload bridge (main-internal
// only).

import {
  writeXlsxHistory,
  type MainXlsxImportRecord,
} from '../xlsxHistoryStorage.js';

export type XlsHistorySaveRequest = MainXlsxImportRecord;

export type XlsHistorySaveResponse =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: { readonly kind: 'write-failed'; readonly message: string } };

export function xlsxHistorySaveHandler(req: XlsHistorySaveRequest): XlsHistorySaveResponse {
  try {
    writeXlsxHistory(req);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: {
        kind: 'write-failed',
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }
}
