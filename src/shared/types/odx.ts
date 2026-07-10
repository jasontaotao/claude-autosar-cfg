// --- v1.22.0 T1 ODX types --------------------------------------------------
//
// ODX-D (ISO 22901) is an XML-based diagnostic exchange format. The
// minimum surface the v1.22.0 viewer needs is three flat lists
// (DTCs, DIDs, Routines) extracted from the BASE-VARIANT DIAG-LAYER.
// The full DIAG-LAYER state chart + env-data + functional-group are
// NOT extracted — a future v1.22.x follow-up can introduce a second
// "drill into detail" IPC channel that streams the full shape if the
// need actually arises (mirrors the DBC `DbcSummary` decision at
// `parseDbcHandler.ts:8-16`).

/** Renderer-friendly projection of a single ODX `<DTC-DOP>`. */
export interface OdxDtcSummary {
  /** ODX DOP-DATA-OBJECT-PROP `ID` attribute (e.g. `"DTC_001"`). */
  readonly id: string;
  /** Localized DOP `SHORT-NAME` (e.g. `"DTC_EngineOverheat"`). */
  readonly shortName: string;
  /** Raw `<DTC TROUBLE-CODE="…">` value (e.g. `"0x123456"`). */
  readonly troubleCode: string;
  /** Human-friendly form: same hex digits, no `0x` prefix (e.g. `"123456"`). */
  readonly displayCode: string;
  /** Optional diagnostic text (e.g. `"Engine coolant temperature too high"`). */
  readonly text: string;
}

/** ODX `<DIAG-CODED-TYPE>` from a 0x22 REQUEST's DID-value PARAM. */
export interface OdxDidData {
  /** `BASE-DATA-TYPE` attribute (e.g. `"A_UINT32"`, `"A_ASCIISTRING"`). */
  readonly dataType: string;
  /** `BASE-TYPE-ENCODING` attribute (e.g. `"NONE"`, `"2C"`, `"IEEE-FLOAT32"`). */
  readonly encoding: string;
  /** Optional `<BIT-LENGTH>` child (e.g. `16` for 2-byte data). */
  readonly bitLength?: number;
}

/** Renderer-friendly projection of a single ODX `<DID-OBJECT>`. */
export interface OdxDidSummary {
  /** ODX `DID-OBJECT` `ID` attribute. */
  readonly id: string;
  /** ODX `DID-OBJECT` `SHORT-NAME`. */
  readonly shortName: string;
  /**
   * Optional DIAG-CODED-TYPE from the 0x22 REQUEST's DID-value PARAM
   * (v1.24.x PATCH). Absent for DIDs from `<DID-OBJECT>` (legacy spec
   * shape) or 0x22 REQUESTs without DIAG-CODED-TYPE.
   */
  readonly data?: OdxDidData;
}

/** Renderer-friendly projection of a single ODX `<REQUEST>` (Routine). */
export interface OdxRoutineSummary {
  /** ODX `REQUEST` `ID` attribute. */
  readonly id: string;
  /** ODX `REQUEST` `SHORT-NAME`. */
  readonly shortName: string;
}

/** Renderer-friendly summary of a parsed ODX-D BASE-VARIANT. */
export interface OdxSummary {
  /** Counts pre-derived so the viewer header does not re-compute. */
  readonly dtcCount: number;
  readonly didCount: number;
  readonly routineCount: number;
  /** Flat list of `<DTC-DOP>` entries (DTCs). */
  readonly dtcs: readonly OdxDtcSummary[];
  /** Flat list of `<DID-OBJECT>` entries (DIDs). */
  readonly dids: readonly OdxDidSummary[];
  /** Flat list of `<REQUEST>` entries (Routines). */
  readonly routines: readonly OdxRoutineSummary[];
}

/** Discriminated union for the ODX file-picker result (mirrors `OpenDbcResult`). */
export type OpenOdxResult =
  | { readonly kind: 'canceled' }
  | { readonly kind: 'opened'; readonly path: string; readonly content: string }
  | { readonly kind: 'read-failed'; readonly message: string };

/**
 * v1.33.0 MINOR T3 — `odx:open-with-default` IPC request.
 *
 * Additive on the wire — preserves the v1.22.0 `odx:open` IPC contract
 * (lesson additive-ipc-channels-over-extending-args). The original
 * `openOdx` channel remains unchanged; this new channel lets the
 * renderer pre-fill the OS dialog's starting directory (e.g. the open
 * project's manifest directory) so the user does not have to navigate
 * from `user-home` every time.
 */
export interface OpenOdxWithDefaultRequest {
  /** Absolute path the OS dialog should open at. Optional. */
  readonly defaultPath?: string;
  /** Optional override of the dialog file filters. Defaults to `.odx`. */
  readonly filters?: readonly {
    readonly name: string;
    readonly extensions: readonly string[];
  }[];
}

/**
 * v1.33.0 MINOR T3 — `odx:open-with-default` IPC result.
 *
 * Mirrors `OpenOdxResult` exactly — the renderer code path can reuse
 * the existing per-kind switch (canceled → cancel, opened → resolve,
 * read-failed → warn-and-cancel).
 */
export type OpenOdxWithDefaultResult =
  | { readonly kind: 'opened'; readonly path: string; readonly content: string }
  | { readonly kind: 'canceled' }
  | { readonly kind: 'read-failed'; readonly message: string };

/**
 * v1.33.0 MINOR T2 — `bswmd:pick` IPC result.
 *
 * Mirrors `OpenOdxResult` but collapses the read-failure case into
 * `canceled` because the handler already surfaces the read error via
 * `dialog.showMessageBox` (per CLAUDE.md "errors handled explicitly,
 * never silently swallowed" + the v1.32.0 PATCH `bswmd-unreadable` IPC
 * error class lesson). The renderer's picker treats both user-cancel
 * and OS read error as "no change" — the user already saw the message
 * box, so a second error banner would be noisy.
 */
export type BswmdPickResult =
  | { readonly kind: 'canceled' }
  | { readonly kind: 'opened'; readonly path: string; readonly content: string };

/** ODX parse request — content already in memory (mirrors `ParseDbcRequest`). */
export interface ParseOdxRequest {
  /** Optional — debug context for the handler; not used by the parser itself. */
  readonly path?: string;
  readonly content: string;
}

export type ParseOdxResponse =
  | { readonly ok: true; readonly value: OdxSummary }
  | {
      readonly ok: false;
      readonly error: {
        readonly kind: 'odx-malformed' | 'odx-too-large';
        readonly message: string;
      };
    };
