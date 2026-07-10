// --- v1.24.0 T2 — ODX→Diagnostic Extract bridge IPC types ---

/**
 * v1.24.0 T2 — ODX→Diagnostic Extract bridge IPC request.
 *
 * Path-based (not content-based): the handler re-parses the .odx-d
 * using v1.22.0's `parseOdxHandler`. This keeps the IPC payload small
 * (just paths) and reuses the existing ODX parser validation.
 */
export interface OdxImportDiagExtractRequest {
  /** Absolute path to the .odx-d file (parsed by v1.22.0's parseOdxHandler). */
  readonly odxPath: string;
  /** Absolute path to the output directory. Must exist and be writable. */
  readonly outputDir: string;
}

/**
 * v1.24.0 T2 — ODX→Diagnostic Extract bridge IPC response.
 *
 * Success: `{ ok: true; value: { demPath, dcmPath, stats } }`
 *   where `stats = { dtcCount, didCount, routineCount }` matches
 *   the parsed `OdxSummary` counts.
 *
 * Failure: `{ ok: false; error: { kind, message } }` with kinds:
 *   - `read-failed`  — .odx-d not found, parse failure, outputDir missing/not-writable
 *   - `write-failed` — 2-phase atomic write failed; `rolledBack` is true
 *                      if existing files were restored from snapshot
 */
export type OdxImportDiagExtractResponse =
  | {
      readonly ok: true;
      readonly value: {
        readonly demPath: string;
        readonly dcmPath: string;
        readonly stats: {
          readonly dtcCount: number;
          readonly didCount: number;
          readonly routineCount: number;
        };
      };
    }
  | {
      readonly ok: false;
      readonly error:
        | { readonly kind: 'read-failed'; readonly message: string }
        | {
            readonly kind: 'write-failed';
            readonly message: string;
            readonly rolledBack: boolean;
          };
    };
