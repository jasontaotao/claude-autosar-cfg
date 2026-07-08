// v1.36.0 MINOR T2 — xlsxImportHistory load handler.
//
// Pure thin wrapper around readXlsxHistory (T1). Returns the typed
// discriminated envelope matching the IPC contract.

import { readXlsxHistory, type MainXlsxImportRecord } from '../xlsxHistoryStorage.js';

export type XlsHistoryLoadResponse =
  | { readonly ok: true; readonly value: readonly MainXlsxImportRecord[] }
  | {
      readonly ok: false;
      readonly error: { readonly kind: 'read-failed'; readonly message: string };
    };

export function xlsxHistoryLoadHandler(): XlsHistoryLoadResponse {
  try {
    return { ok: true, value: readXlsxHistory() };
  } catch (e) {
    return {
      ok: false,
      error: {
        kind: 'read-failed',
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }
}
