// --- v1.30.0 MINOR — dcm:config IPC types ---------------------------------

import type { EcucInstanceRow } from './xlsx.js';
//
// Closes the v1.27.0 carry-over "dcmConfigHandler implemented but
// no IPC" gap. The handler's pure logic has been integration-tested
// (src/main/ipc/__tests__/dcmConfigHandler.test.ts, ship-blocking
// since v1.27.0); v1.30.0 only adds the channel + types + the two
// small affordances below. Renderer's DcmConfigTrigger is a minimal
// button — full UI lands in 1.31.0 PATCH.

/**
 * v1.30.0 MINOR — `dcm:config` request payload.
 *
 * Re-exports `DcmConfigHandlerArgs` as the IPC request shape. The
 * handler's `args` type becomes the IPC envelope verbatim.
 *
 * `bswmdPath` is OPTIONAL. When provided, the handler skips the
 * `locateDcmBswmdPath()` discovery walk and reads the file at this
 * absolute path verbatim. Real-OEM override path — the user's
 * project manifest (future 1.31.x) will declare an alternate BSWMD
 * location; the renderer forwards the path here.
 *
 * Precedence rule (pre-apply): `bswmdPath` wins over `locateDcmBswmdPath`
 * — explicit override is a declaration, not a hint; no fall-through
 * to the sample fixture.
 */
export interface DcmConfigRequest {
  /** Absolute path of the ODX-D file on disk. */
  readonly odxPath: string;
  /** xlsx rows carrying the 5 Dcm service kinds + per-row params. */
  readonly xlsxRows: readonly EcucInstanceRow[];
  /** Optional output path; defaults to `<odxDir>/Dcm_Config.arxml`. */
  readonly outputPath?: string;
  /**
   * v1.30.0 MINOR — optional real-OEM BSWMD override. When set,
   * the handler reads this file directly and skips the
   * `<samples>/arxml/demo-ecu/bswmd/Bsw_Dcm_Bswmd.arxml` discovery
   * walk. The file MUST be a parseable Dcm BSWMD with the canonical
   * AUTOSAR container shortNames (e.g. `DcmDsp` not `Dcm/DcmDsp` —
   * per v1.25.1 PATCH lesson).
   *
   * Additive on the wire. No `:v1` suffix.
   */
  readonly bswmdPath?: string;
}

/**
 * v1.30.0 MINOR — Dcm config service kind tally. Mirrors the
 * pipeline-internal `DcmServiceKind` (`core/bridge/dcmConfigPipeline.ts`).
 * Duplicated here (not imported) because `shared/` is upstream of
 * `core/bridge/` — circular import if imported.
 */
export type DcmConfigServiceKind =
  | 'DcmClearDTC'
  | 'DcmReadDTC'
  | 'DcmReadDataById'
  | 'DcmWriteDataById'
  | 'DcmRoutineControl';

/**
 * v1.30.0 MINOR — Dcm config pipeline result shape (lifted from
 * `core/bridge/dcmConfigPipeline.ts` into the IPC contract layer so
 * `DcmConfigResponse` can type it).
 */
export interface DcmConfigPipelineResult {
  /** ODX-derived Dcm extract (DIDs + Routines as standalone ARXML). */
  readonly dcmConfigXml: string;
  /** Count of DIDs the ODX contributed. */
  readonly odxLinkedDcmDspCount: number;
  /** Count of Routines the ODX contributed. */
  readonly odxLinkedRoutineCount: number;
  /** Per-kind tally of xlsx rows (5 kinds). */
  readonly serviceCounts: Readonly<Record<DcmConfigServiceKind, number>>;
}

/**
 * v1.30.0 MINOR — Dcm config IPC success value. Extends the pipeline
 * result with handler-injected fields (`outputPath` since v1.27.0,
 * `appliedStepCount` new in v1.30.0).
 */
export interface DcmConfigHandlerResult extends DcmConfigPipelineResult {
  /** Path the handler atomically wrote. */
  readonly outputPath: string;
  /** v1.30.0 MINOR — pre-apply intent counter (raw serviceSteps.length). */
  readonly appliedStepCount: number;
  /**
   * v1.32.0 MINOR T7 — resolved BSWMD path echoed back for the
   * SuccessDialog autofill label. When the caller supplied an
   * explicit `bswmdPath`, this mirrors the input; otherwise it
   * carries the discovered sample-fixture path so the renderer can
   * surface "Auto-selected from project manifest: <path>".
   *
   * v1.33.0 MINOR T6 — promoted to REQUIRED. The handler always
   * populates this field from the resolved `dcmBswmdPath` (callers
   * apply their own `bswmdPath ?? locateDcmBswmdPath` resolution
   * upstream in the launcher; the handler's result mirrors that
   * resolution verbatim). The renderer can therefore render the
   * autofill `<p>` unconditionally.
   */
  readonly bswmdPath: string;
}

/**
 * v1.30.0 MINOR — Dcm config IPC envelope. Mirrors
 * `DbcImportComStackResponse` shape (typed `{ok, value/error}`
 * discriminated union) rather than the v1.27.0 T4 IpcResult (also a
 * discriminated union, structurally identical). Single canonical
 * envelope across all main-process IPC channels.
 */
export type DcmConfigResponse =
  | {
      readonly ok: true;
      readonly value: DcmConfigHandlerResult;
    }
  | {
      readonly ok: false;
      readonly error: DcmConfigError;
    };

// v1.32.0 MINOR T1 — additive kind discriminator on the IPC error envelope.
//   kind ∈ 9 literals + 'unknown' (catch-all).
// The renderer classifyError reads kind FIRST and falls back to regex
// classification ONLY when kind is absent (lesson
// backward-compat-branch-on-missing-discriminator-field).
export type DcmConfigErrorKind =
  | 'odx-unreadable'
  | 'odx-parse-failed'
  | 'bswmd-unreadable'
  | 'odx-dcm-linkage'
  | 'dcm-module-missing'
  | 'container-not-found'
  | 'patch-failed'
  | 'atomic-write-failed'
  // v1.41.0 MINOR T3 (M3) — typed kind for the
  // `locateDcmBswmdPath` sample-fixture miss path (was falling through
  // to the generic `unknown` bucket pre-T3). The renderer toast
  // mapping now has a dedicated class for this so the actionable
  // "fixture not found via discovery" message reaches the user instead
  // of being swallowed as "unexpected".
  | 'no-dcm-bswmd-fixture'
  | 'unknown';

export interface DcmConfigError {
  readonly kind: DcmConfigErrorKind;
  readonly message: string;
  readonly cause?: unknown;
}
