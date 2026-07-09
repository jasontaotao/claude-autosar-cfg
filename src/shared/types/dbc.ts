// --- v1.23.0 T3 DBC→Com-Stack bridge types ---------------------------------

import type { ProjectManifest } from './project-manifest.js';
//
// The T3 IPC handler (`dbc:importComStack`) orchestrates the full
// pipeline in one main-process round-trip:
//
//   1. re-parse DBC content (T1)
//   2. call the pure mapper `dbcToComStack` (T2)
//   3. for each of the 3 ECUC value-side files: parse → apply patches
//      → serialize → collect new content
//   4. write all 3 files atomically via the existing
//      `project:writeArxmlBatch` channel
//
// The handler decides Tx-vs-Rx dispatch (via the optional `targetNode`
// field). See `dbcImportComStackHandler.ts` for the full decision
// matrix.

/**
 * v1.23.0 T3 — DBC→Com-Stack bridge IPC request.
 *
 * Mirrors the 3-file-mutating convention established by
 * `ProjectWriteArxmlBatchRequest` (Sprint 14): the caller supplies a
 * manifest path so the handler can resolve the 3 ECUC value-side
 * files relative to the project directory. DBC content is supplied
 * verbatim (already read from disk by `dbc:open`) so the handler
 * never has to touch the user's filesystem for the DBC itself.
 */
export interface DbcImportComStackRequest {
  /** Raw DBC UTF-8 text (already loaded by `dbc:open`). */
  readonly dbcContent: string;
  /**
   * Absolute path of the open project's manifest JSON (e.g.
   * `samples/arxml/demo-ecu/demo.autosarcfg.json`). Used to resolve
   * the 3 ECUC value-side files (`Com_Config.arxml`,
   * `CanIf_Config.arxml`, `PduR_Config.arxml`) by their relative
   * entries in `ProjectManifest.valueArxmls`.
   */
  readonly projectManifestPath: string;
  /**
   * The manifest itself (already loaded by `project:open`). Passed in
   * so the handler does NOT re-read the manifest JSON from disk —
   * keeps the bridge idempotent against a stale manifest JSON on disk
   * (the renderer is the SoT for `projectManifestPath` /
   * `manifest.valueArxmls` at handler invocation time).
   */
  readonly manifest: ProjectManifest;
  /**
   * Optional DBC `BU_` node name used by the T2 mapper to dispatch
   * Tx vs Rx. Messages whose `transmitter` equals `targetNode` are
   * added as CanIf Tx Pdus; others as Rx Pdus. If omitted, the
   * bridge falls back to the legacy "treat every message as Tx"
   * behavior.
   *
   * **CRITICAL — semantic constraint**: `targetNode` MUST be a DBC
   * `BU_` node name (one of the entries in `DbcSummary.nodes`),
   * matching `msg.transmitter` exactly. It is NOT the EcuC
   * `<ECU-INSTANCE>` shortName (which is a different AUTOSAR
   * concept — e.g. `ECM_DEMO`, NOT `ECM`). The T4 wizard MUST
   * source `targetNode` from the parsed DBC summary's `nodes` field
   * and let the user pick one — never auto-derive from the active
   * project's EcuC instance.
   *
   * The handler enforces this at runtime: if `targetNode` is
   * provided AND not present in the parsed DBC's `nodes`, the
   * handler returns `kind: 'read-failed'` with a message listing
   * the available nodes (so the wizard can surface a "Did you mean
   * …" hint).
   */
  readonly targetNode?: string;
}

/**
 * v1.23.0 T3 — DBC→Com-Stack bridge IPC response.
 *
 * Success: `{ ok: true; value: { addedCounts: { com, canIf, pduR } } }`
 * — counts of new ECUC instances added per file (e.g. `com: 1,
 * canIf: 1, pduR: 1` for a single-message DBC). Re-running on an
 * already-bridged project MUST return all-zeros (idempotency
 * enforced by the underlying T2 mapper).
 *
 * Failure: discriminated by `error.kind`:
 *   - `read-failed`  — DBC content not a string / exceeds 32 MiB cap /
 *                      one of the 3 ECUC files missing on disk /
 *                      DB parse / ECUC parse failure
 *   - `bridge-failed` — `dbcToComStack` plan could not be applied
 *                      (patch errors after parse)
 *   - `write-failed` — atomic 3-file write failed
 */
export type DbcImportComStackResponse =
  | {
      readonly ok: true;
      readonly value: {
        readonly addedCounts: {
          readonly com: number;
          readonly canIf: number;
          readonly pduR: number;
        };
      };
    }
  | {
      readonly ok: false;
      readonly error:
        | {
            readonly kind: 'read-failed' | 'bridge-failed';
            readonly message: string;
          }
        | {
            readonly kind: 'write-failed';
            readonly message: string;
            readonly rolledBack: boolean;
          };
    };

