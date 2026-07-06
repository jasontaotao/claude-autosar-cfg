import type { ParseError } from '../core/arxml/parser.js';
import type { SerializeError } from '../core/arxml/serializer.js';
import type { ArxmlDocument, ArxmlElement, ArxmlVersion, Result } from '../core/arxml/types.js';
import type { BswmdDocument, BswmdError } from '../core/project/bswmd.js';
import type {
  ScriptKind,
  ScriptLog,
  ScriptRunResult,
  ScriptSummary,
} from '../main/script/types.js';

import type { ProjectManifest } from './project.js';

export interface AppInfo {
  readonly name: string;
  readonly version: string;
  readonly coreVersion: string;
  readonly electronVersion: string;
  readonly nodeVersion: string;
  readonly platform: NodeJS.Platform;
}

export interface PingResponse {
  readonly ok: boolean;
  readonly ts: number;
}

// Result envelope is defined in core/arxml/types.ts and re-exported here
// to preserve the core → shared layer direction (shared consumes core, not vice versa).
export type { Result };

// --- F1 ARXML IO types -----------------------------------------------------

/**
 * Sprint 17b T7 — typed save-failure discriminator. Each value maps to
 * a specific NodeJS errno pattern (or a non-IO failure path) so the
 * renderer can dispatch a localized toast with the right copy. The
 * `write-failed` member is kept as a v1.1.0/v1.1.1 legacy alias: older
 * callers that predate the typed union still get a parseable
 * `kind` field; the renderer falls back to a generic "Save failed"
 * toast for it.
 */
export type SaveArxmlErrorKind =
  | 'permission-denied' // EACCES, EPERM
  | 'disk-full' // ENOSPC, EDQUOT
  | 'path-not-found' // ENOENT, ENOTDIR
  | 'serialize-failed' // serializeArxml returned ok:false (in-memory)
  | 'write-failed' // legacy alias — any unspecialised IO failure
  // Sprint 17b (H8) — defensive path-containment check. The renderer
  // (or a compromised preload bridge) could otherwise forge a path
  // like `../../etc/passwd` and the main process would happily write
  // to it. We reject any path containing a `..` parent-traversal
  // segment before touching the filesystem.
  | 'invalid-path'
  | 'unknown'; // unmapped errno (preserves the original code)

/**
 * Sprint 17b T7 — typed save-failure envelope. `code` carries the raw
 * NodeJS errno string (e.g. `'EACCES'`) when the kind is `unknown`,
 * the legacy `write-failed` alias, or a future errno we're not yet
 * mapping. For `serialize-failed` the field is omitted (no errno
 * applies). `message` is the human-readable cause — the renderer's
 * i18n template can interpolate it as `{message}`.
 */
export interface SaveArxmlError {
  readonly kind: SaveArxmlErrorKind;
  readonly code?: string;
  readonly message: string;
}

export type FileError =
  | { readonly kind: 'read-failed'; readonly message: string }
  | { readonly kind: 'write-failed'; readonly message: string }
  | { readonly kind: 'dialog-failed'; readonly message: string }
  // Sprint 17b T7 — typed save-failure variant. Replaces the previous
  // `write-failed` arm of the save flow; `read-failed` / `dialog-failed`
  // are unchanged because they don't have errno mapping paths.
  | SaveArxmlError;

export interface OpenArxmlResult {
  readonly canceled: boolean;
  readonly path?: string;
  readonly content?: string;
}

/**
 * Sprint 10 #2 — multi-file open result.
 *
 * The user picks N files (N ≥ 0) in a single dialog. The main process
 * reads each one and groups the outcome into a discriminated union so
 * the renderer can distinguish "user canceled" from "all opened" from
 * "some opened, some failed" from "OS-level read error".
 *
 * - `{ kind: 'canceled' }` — user dismissed the dialog (or selected 0 files)
 * - `{ kind: 'opened'; results: [{ path, content }, ...] }` — every
 *   selected file read successfully
 * - `{ kind: 'partial'; opened: [...]; failed: [{ path, message }, ...] }`
 *   — at least one read failed; the renderer can still consume `opened`
 *   and surface a per-file error for `failed`
 * - `{ kind: 'read-failed'; message: string }` — every read failed (or
 *   the dialog itself errored out); renderer surfaces a single error
 *
 * The shape replaces the silent "treat read-failure as cancel" pattern
 * flagged by the silent-failure-hunter in the Sprint 10 panel review.
 */
export type OpenArxmlMultiResult =
  | { readonly kind: 'canceled' }
  | {
      readonly kind: 'opened';
      readonly results: readonly { readonly path: string; readonly content: string }[];
    }
  | {
      readonly kind: 'partial';
      readonly opened: readonly { readonly path: string; readonly content: string }[];
      readonly failed: readonly { readonly path: string; readonly message: string }[];
    }
  | { readonly kind: 'read-failed'; readonly message: string };

export interface SaveArxmlResult {
  readonly canceled: boolean;
  readonly path?: string;
}

export interface ParseArxmlRequest {
  readonly path: string;
  readonly content: string;
}

export type ParseArxmlResponse = Result<ArxmlDocument, ParseError>;

// v1.21.0 Bug #5 — DBC parser wiring. The `@dbc-forge/core` package
// was installed in v1.7.0 Cluster 3 I and a smoke test confirmed the
// dependency boundary, but no IPC / UI was ever built — the parser
// has been "installed but not wired" (dead code) since v1.7.0. Bug #5
// exposes it through a minimal IPC + viewer surface; full ARXML↔DBC
// bridging remains a separate roadmap item.
//
// We do NOT re-export the full `@dbc-forge/core` `Network` shape
// across the IPC boundary. DBC networks can have hundreds of
// attributes / value tables / signal groups that the GUI does not
// render — streaming the full Network would inflate the IPC payload
// for no UX benefit. Instead the handler returns a renderer-friendly
// summary (counts + per-message identifiers + node list); a future
// "open in detail view" affordance can introduce a second channel that
// streams the full Network if needed.

/**
 * Lightweight summary of one DBC message — what the GUI's
 * `<DbcViewer />` shows in the messages table. NOT a 1:1 mirror of
 * `@dbc-forge/core`'s `Message` type; fields the GUI does not
 * display are omitted.
 */
export interface DbcMessageSummary {
  readonly id: number;
  readonly name: string;
  readonly dlc: number;
  readonly transmitter: string;
  readonly signalCount: number;
}

// v1.23.0 T1 — Extended DBC parser types.
// The existing `parseDbcHandler` returns a signal-summary-free
// `DbcSummary`; the Com-stack bridge (`dbcParseForBridgeHandler`)
// needs per-signal metadata (startBit, length, byteOrder, valueType,
// factor, offset, min, max, unit, receivers) to generate Com-signal
// mappings. We add an optional `signals` field on `DbcSummary` so the
// bridge can return the extended shape while the viewer continues to
// consume the signal-free shape (the field is omitted, not empty).
//
// `DbcSignalSummary` mirrors dbc-forge's `Signal` shape (verified in
// `vendor/dbc-forge/packages/core/src/model/signal.ts`): `byteOrder`
// is the literal string `'little-endian' | 'big-endian'` and
// `valueType` is narrowed to `'signed' | 'unsigned'` because the
// AUTOSAR Com-signal universe has only those two (dbc-forge's
// `'float' | 'double'` cases map to `'unsigned'` upstream and are out
// of scope for v1.23.0).

/**
 * Renderer-friendly projection of a single DBC signal. Populated by
 * `dbcParseForBridgeHandler`; omitted by `parseDbcHandler`.
 */
export interface DbcSignalSummary {
  readonly messageId: number;
  readonly name: string;
  readonly startBit: number;
  readonly length: number;
  readonly byteOrder: 'little-endian' | 'big-endian';
  readonly valueType: 'signed' | 'unsigned';
  readonly factor: number;
  readonly offset: number;
  readonly min: number;
  readonly max: number;
  readonly unit: string;
  readonly receivers: readonly string[];
}

/**
 * Renderer-friendly summary of a parsed DBC network.
 * `messageCount` / `nodeCount` are pre-computed so the viewer header
 * does not have to re-derive them on every render.
 */
export interface DbcSummary {
  readonly version: string;
  readonly nodeCount: number;
  readonly messageCount: number;
  readonly nodes: readonly string[];
  readonly messages: readonly DbcMessageSummary[];
  /**
   * Optional signal-level detail — populated by
   * `dbcParseForBridgeHandler`, omitted by the viewer-side
   * `parseDbcHandler`. Field is OPTIONAL (not always present) so the
   * existing `DbcSummary` consumers see no runtime shape change.
   */
  readonly signals?: readonly DbcSignalSummary[];
}

/** Discriminated union for the file-picker result (mirrors `OpenArxmlResult`). */
export type OpenDbcResult =
  | { readonly kind: 'canceled' }
  | { readonly kind: 'opened'; readonly path: string; readonly content: string }
  | { readonly kind: 'read-failed'; readonly message: string };

/** Parse request — content already in memory (mirrors `ParseArxmlRequest`). */
export interface ParseDbcRequest {
  readonly path: string;
  readonly content: string;
}

export type ParseDbcResponse =
  | { readonly ok: true; readonly value: DbcSummary }
  | {
      readonly ok: false;
      readonly error: {
        readonly kind: 'dbc-malformed' | 'dbc-too-large';
        readonly message: string;
      };
    };

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

// --- v1.23.0 T3 DBC→Com-Stack bridge types ---------------------------------
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

// ---------------------------------------------------------------------------
// v1.25.0 — Excel → Com-Stack ECUC batch import types
// ---------------------------------------------------------------------------

/**
 * One row of one sheet in the user's `.xlsx`. Rows are typed against the
 * SPEC's sheet name → ECUC parent path table (see design §Architecture).
 * `params` carries every `param:<NAME>=value` column as a flat record.
 */
export interface EcucInstanceRow {
  readonly sheet: 'ComIPdu' | 'ComSignal' | 'CanIfTxPdu' | 'CanIfRxPdu' | 'PduRRoutingPath';
  readonly shortName: string;
  readonly definitionRef?: string;
  readonly params: Readonly<Record<string, string | number | boolean | null>>;
}

// IPC #1: xlsx:parseBatch — parse `.xlsx` and report per-row collisions.
export interface XlsxParseBatchRequest {
  readonly projectManifestPath: string;
  readonly xlsxBytes: Uint8Array;
}
export type XlsxParseBatchResponse =
  | {
      readonly ok: true;
      readonly value: {
        readonly instances: readonly EcucInstanceRow[];
        /** Key format: `<sheet>:<shortName>` — matches `resolutions` map below. */
        readonly collisions: Readonly<Record<string, boolean>>;
      };
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly kind: 'read-failed' | 'parse-failed' | 'no-module-def';
        readonly message: string;
      };
    };

// IPC #2: xlsx:writeBatchTemplate — emit a per-project starter .xlsx.
export interface XlsxWriteBatchTemplateRequest {
  readonly projectManifestPath: string;
}
export type XlsxWriteBatchTemplateResponse =
  | { readonly ok: true; readonly value: { readonly xlsxBytes: Uint8Array } }
  | {
      readonly ok: false;
      readonly error: { readonly kind: 'read-failed' | 'parse-failed'; readonly message: string };
    };

// IPC #3: xlsx:commitBatch — apply patches + atomic 3-file write.
export interface XlsxCommitBatchRequest {
  readonly projectManifestPath: string;
  readonly instances: readonly EcucInstanceRow[];
  /** Per-collision-row decision. Key: `<sheet>:<shortName>` (same as ParseResponse.collisions). */
  readonly resolutions: Readonly<Record<string, 'overwrite' | 'skip'>>;
}
export type XlsxCommitBatchResponse =
  | {
      readonly ok: true;
      readonly value: {
        readonly added: number;
        readonly overwritten: number;
        readonly skipped: number;
        readonly perFile: Readonly<Record<'Com' | 'CanIf' | 'PduR', number>>;
      };
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly kind: 'read-failed' | 'parse-failed' | 'bridge-failed' | 'write-failed';
        readonly message: string;
      };
    };

export interface SaveArxmlRequest {
  readonly doc: ArxmlDocument;
  readonly defaultName?: string;
  /**
   * Sprint 16 — when present, the handler skips the OS save-as dialog
   * and writes directly to this path. Used by the renderer's "Save"
   * button after edit, where the document already has a known on-disk
   * location (loaded from project or generated via BSWMD-to-ECUC).
   * Empty string is treated as absent.
   */
  readonly currentPath?: string;
}

export type SaveArxmlResponse = Result<SaveArxmlResult, FileError>;

// --- Sprint 12 #1 — BSWMD parser IPC types ---------------------------------

/**
 * Request payload for `BSWMD_PARSE`. The renderer passes the raw XML
 * string (already read from disk by `project:open` — the handler does
 * NOT touch the filesystem). `path` is optional debug context.
 */
export interface ParseBswmdRequest {
  readonly content: string;
  readonly path?: string;
}

export type ParseBswmdResponse = Result<BswmdDocument, BswmdError>;

// --- Sprint 12 #2 — BSWMD file reader IPC types ----------------------------

/**
 * Request payload for `BSWMD_READ`. The renderer passes the absolute
 * path to a `.arxml` file (chosen via `dialog.showOpenDialog` upstream
 * in `useProjectActions.addBswmdFromDialog`); the main process reads
 * it and returns either the content or a single-line error message.
 *
 * The handler does NOT do any path-containment check — the renderer is
 * trusted to pass absolute paths the user explicitly picked, and the
 * file is read-only here. (Manifest-driven loads — where a tampered
 * manifest could point at `/etc/passwd` — go through `PROJECT_OPEN`,
 * which DOES enforce containment.)
 */
export interface ReadBswmdRequest {
  readonly path: string;
}

/**
 * Response payload for `BSWMD_READ`. Discriminated union:
 *   - `{ kind: 'ok', content }` — file read successfully; `content` is
 *     the raw UTF-8 string. An empty file is reported as `ok` with
 *     `content: ''` (the downstream `parseBswmd` will reject it later
 *     with `missing-root` / `xml-malformed`).
 *   - `{ kind: 'read-failed', message }` — file could not be read. The
 *     message is a single human-readable line suitable for surfacing
 *     in the renderer's error toast.
 */
export type ReadBswmdResponse =
  | { readonly kind: 'ok'; readonly content: string }
  | { readonly kind: 'read-failed'; readonly message: string };

/**
 * Response payload for `BSWMD_OPEN`. Discriminated union:
 *   - `{ kind: 'canceled }` — user dismissed the dialog (or selected 0 files)
 *   - `{ kind: 'ok', path }` — user picked a file; `path` is its
 *     absolute on-disk path. Renderer hands it straight to
 *     `BSWMD_READ` (`{ path }`).
 *
 * Mirrors the `OPEN_ARXML` single-file picker shape (just without the
 * `content` field — `BSWMD_OPEN` is dialog-only; the renderer asks the
 * main process to read the content in a second IPC call so the size cap
 * and read-failure handling stay consistent with `BSWMD_READ`).
 */
export type OpenBswmdResult =
  | { readonly kind: 'canceled' }
  | { readonly kind: 'ok'; readonly path: string };

// --- Sprint 12 #3 — `project:pickDir` IPC types ----------------------------

/**
 * Request payload for `PICK_DIR`. `defaultPath` is optional and is
 * forwarded to `dialog.showOpenDialog` as-is — when omitted, the OS
 * picks the default starting location.
 *
 * `locale` (Sprint 13+ Stage 4 M7) is the renderer's current i18n
 * locale; main uses it to render the dialog title via the shared
 * `t(locale, key)` helper. When omitted, main falls back to `'en'`
 * (the hard-coded English title) — this is a defensive default for
 * older callers and the IPC contract is backward-compatible.
 */
export interface PickDirRequest {
  readonly defaultPath?: string;
  readonly locale?: 'zh-CN' | 'en';
}

/**
 * Response payload for `PICK_DIR`. Discriminated union:
 *   - `{ kind: 'picked', dirPath }` — user picked a directory;
 *     `dirPath` is its absolute on-disk path. The renderer hands it
 *     straight to the NewProjectDialog form (and eventually
 *     `PROJECT_NEW.directory` in Phase 1 Task 4).
 *   - `{ kind: 'canceled' }` — user dismissed the dialog (or selected
 *     0 directories).
 *
 * We deliberately do NOT validate that `dirPath` is a directory here:
 * the dialog was opened with `properties: ['openDirectory']`, so a
 * real OS can never return a file. The renderer is the right place to
 * double-check before committing a project to the path.
 */
export type PickDirResult =
  | { readonly kind: 'picked'; readonly dirPath: string }
  | { readonly kind: 'canceled' };

// --- Sprint 13 #1 — built-in template IPC types ---------------------------

export interface TemplateListRequest {
  // No fields. Reserved for future filters (e.g. vendor dialect).
  readonly _placeholder?: never;
}

export interface TemplateListResponse {
  readonly templates: ReadonlyArray<{
    readonly id: string;
    readonly displayNameKey: string;
    readonly descriptionKey: string;
    readonly fileCount: number;
    /**
     * Sprint 13+ Stage 3.4 — absolute on-disk paths of schema-side
     * BSWMD files within the template's `bswmd/` subdirectory. The
     * renderer surfaces them as multi-select chips in
     * `NewProjectDialog` (Classic template). Empty for templates
     * without a `bswmd/` dir (e.g. `empty`, `clone`).
     *
     * Absolute paths are exposed because the renderer cannot
     * import `node:path` to resolve `process.resourcesPath`
     * itself, and the chip row needs the full path to thread
     * back to the `projectNew` IPC. The renderer treats them
     * as opaque strings (basename for display, full path for
     * IPC); it does not read, write, or evaluate the path.
     */
    readonly bswmdPaths: readonly string[];
  }>;
}

export interface TemplateCopyRequest {
  readonly templateId: string;
  /** Absolute path of the target directory. Main has already shown a
   *  directory picker; renderer forwards the chosen path verbatim. */
  readonly destDir: string;
}

export interface TemplateCopyResponse {
  readonly copiedValueArxml: readonly string[];
  readonly copiedBswmd: readonly string[];
}

// --- F1 Project manifest IO types (Sprint 11 Phase 1) ----------------------

/**
 * Request payload for `PROJECT_NEW` (Sprint 12 #3).
 *
 * The renderer (`NewProjectDialog`) is responsible for collecting both
 * the project name AND the target directory from the user, so the main
 * process no longer pops an OS `showSaveDialog` — it joins
 * `req.directory` with a sanitized filename (`<name>.autosarcfg.json`)
 * and writes directly. This unifies the two-step "prompt name → pick path"
 * flow into a single in-app dialog.
 *
 * - `name` — user-supplied project name. Pre-validated by
 *   `NewProjectDialog` (rejecting empty / path-unsafe chars / >64 chars);
 *   the main handler still applies a defensive sanitization and rejects
 *   names containing `/` or `\` outright.
 * - `directory` — absolute on-disk directory chosen by the user via the
 *   renderer-driven `project:pickDir` IPC. Main will not create the
 *   directory if it doesn't exist; it returns `write-failed` instead so
 *   the renderer can prompt the user to pick another location.
 */
export interface ProjectNewRequest {
  readonly name: string;
  readonly directory: string;
  /**
   * Sprint 13 #2 Stage 3.2 Task 2: when true, the main handler skips
   * the `fs.access` file-exists check and force-writes the manifest.
   * The renderer only sets this on a re-invocation after the user has
   * confirmed the overwrite via the ConfirmDialog (which translates
   * the `overwrite-confirm` IPC result into a "覆盖" / "重命名" choice).
   */
  readonly overwrite?: boolean;
  /**
   * Sprint 13+ Stage 3.4 — absolute paths of BSWMD files the user
   * pre-selected via `BswmdChipRow` in NewProjectDialog. Main writes
   * them into the new manifest's `bswmdPaths`. Empty array when
   * the user picked a template without BSWMDs (Empty / Clone) or
   * didn't select any chips.
   *
   * Paths are kept as-is — main does NOT validate that the files
   * exist on disk. Future work (Stage 3.5+) may copy the referenced
   * files into the project dir; this IPC just records the manifest
   * pointer. Renderer callers must read paths straight from the
   * `templates:list` IPC response.
   */
  readonly bswmdPaths?: readonly string[];
}

/**
 * Response payload for `PROJECT_NEW` (Sprint 12 #3).
 *
 * Discriminated union:
 *   - `{ kind: 'created', path, manifest }` — file written successfully.
 *   - `{ kind: 'overwrite-confirm', path }` — the target file already
 *     exists. The main handler does NOT overwrite; the renderer must
 *     confirm with the user (e.g. via `ConfirmDialog`) and re-invoke
 *     with an explicit overwrite flag (Phase 2) — for now Phase 1
 *     surfaces this as a renderer-side error so the user can pick a
 *     different directory or rename the project.
 *   - `{ kind: 'write-failed', message }` — write failed (directory
 *     missing, permission denied, EISDIR for a non-directory path, etc.).
 *   - `{ kind: 'invalid-name', message }` — defensive guard for names
 *     containing path separators (`/` / `\`). Pre-validated by the
 *     renderer; this is a safety net for a tampered preload bridge.
 *
 * The previous `'canceled'` kind is gone — there is no longer any
 * dialog for the user to cancel.
 */
export type ProjectNewResult =
  | { readonly kind: 'created'; readonly path: string; readonly manifest: ProjectManifest }
  | { readonly kind: 'overwrite-confirm'; readonly path: string }
  | { readonly kind: 'write-failed'; readonly message: string }
  | { readonly kind: 'invalid-name'; readonly message: string };

/**
 * Request payload for `PROJECT_OPEN`. No input — main shows the open
 * dialog. The response carries the manifest + the contents of every
 * referenced ARXML/BSWMD so the renderer can hydrate its store in one
 * round trip.
 *
 * Note: for Phase 1, BSWMDs are loaded but not yet parsed by the core
 * (Phase 2 wires the BSWMD parser into the store). They live in the
 * `bswmds` array so the renderer can hand them off later.
 */
export type ProjectOpenResult =
  | { readonly kind: 'canceled' }
  | {
      readonly kind: 'opened';
      readonly manifestPath: string;
      readonly manifest: ProjectManifest;
      /**
       * Each entry carries the manifest-relative path (`rel`) alongside
       * the absolute on-disk path (`path`) and the file content. The
       * renderer matches by `rel` to avoid basename collisions when
       * the same filename lives in two sub-directories of the project
       * (e.g. `subdir1/EcuC.arxml` and `subdir2/EcuC.arxml`).
       */
      readonly docs: readonly {
        readonly rel: string;
        readonly path: string;
        readonly content: string;
      }[];
      readonly bswmds: readonly {
        readonly rel: string;
        readonly path: string;
        readonly content: string;
      }[];
    }
  | {
      readonly kind: 'read-failed';
      readonly message: string;
    };

/**
 * Result envelope for `PROJECT_CLOSE` (v1.18.2 PATCH). Symmetric
 * counterpart to `ProjectOpenResult`. Currently single-kind — `closed`
 * is returned whether or not a project was open (idempotent close,
 * mirrors Unix `close(2)` semantics). Future failure modes (e.g.
 * cleanup threw) would add a `failed` kind.
 */
export type ProjectCloseResult = { readonly kind: 'closed' };

/**
 * v1.23.0 PATCH (HIGH-1) — `PROJECT_RELOAD` request payload. The
 * non-dialog counterpart to `PROJECT_OPEN`: takes an already-known
 * absolute manifest path and re-reads it + every referenced
 * value-side ARXML + BSWMD from disk. Used by the T4
 * `DBC→Com-Stack` apply handler so the user sees fresh ECUC values
 * immediately after a successful bridge — without popping the OS
 * file picker that `PROJECT_OPEN` requires.
 *
 * Mirrors the same shape as `PROJECT_OPEN`'s read-side payload, minus
 * the dialog-driven `path: string` (already supplied).
 */
export interface ProjectReloadRequest {
  readonly manifestPath: string;
}

/**
 * v1.23.0 PATCH (HIGH-1) — `PROJECT_RELOAD` response envelope.
 *
 * Success: `{ kind: 'ok', manifest, files }` — `manifest` is the
 * parsed `ProjectManifest`; `files` is a flat array of every ARXML +
 * BSWMD the manifest references, each carrying the absolute `path`
 * and the `content` string. The renderer's `useArxmlStore.openProject`
 * action reuses this bundle verbatim (splitting by kind is the
 * store's job).
 *
 * Failure: `{ kind: 'read-failed', message }` — IO error, JSON parse
 * error, path-containment violation, or a referenced file missing
 * from disk.
 */
export type ProjectReloadResponse =
  | {
      readonly kind: 'ok';
      readonly manifest: ProjectManifest;
      readonly files: ReadonlyArray<{
        readonly path: string;
        readonly content: string;
      }>;
    }
  | { readonly kind: 'read-failed'; readonly message: string };

/**
 * Request payload for `PROJECT_SAVE`. The renderer sends the current
 * manifest + any files whose content has changed since the last save.
 * `files` may be empty if only the manifest changed (e.g. added a path
 * without editing the doc).
 *
 * Main writes `files` first (each to its `path` field), then writes the
 * manifest JSON to `manifestPath`. A write failure rolls forward and
 * reports `write-failed`; partial state on disk is acceptable for Phase 1.
 */
export interface ProjectSaveRequest {
  readonly manifestPath: string;
  readonly manifest: ProjectManifest;
  readonly files: readonly { readonly path: string; readonly content: string }[];
}

export type ProjectSaveResult =
  | { readonly kind: 'saved'; readonly path: string }
  | { readonly kind: 'write-failed'; readonly message: string };

export type { ArxmlVersion, ArxmlDocument, ArxmlElement, ParseError, SerializeError };

// --- Sprint 14: BSWMD-to-ECUC skeleton IPC ---

export interface ProjectWriteArxmlBatchRequest {
  readonly files: readonly {
    readonly filePath: string;
    readonly content: string;
  }[];
}

export type ProjectWriteArxmlBatchResult =
  | { readonly kind: 'ok'; readonly written: readonly string[] }
  | {
      readonly kind: 'partial';
      readonly written: readonly string[];
      readonly failed: readonly { readonly filePath: string; readonly message: string }[];
    }
  | { readonly kind: 'write-failed'; readonly message: string }
  | { readonly kind: 'invalid-path'; readonly message: string };

export interface ProjectDeleteArxmlRequest {
  readonly filePath: string;
}

export type ProjectDeleteArxmlResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'write-failed'; readonly message: string }
  | { readonly kind: 'invalid-path'; readonly message: string };

// --- Sprint 17 P1 — `bswmd:delete` IPC types --------------------------------
//
// Mirrors `ProjectDeleteArxmlRequest/Result` for parity. The shape is
// identical (delete a file by absolute path, return
// ok / not-found / write-failed) but the names are kept distinct so
// the type system is honest about which channel the value flows
// through. Future divergence (e.g. a size cap or a path-containment
// check on BSWMD deletes) is easier to land in a non-shared type.

export interface ProjectDeleteBswmdRequest {
  readonly filePath: string;
}

export type ProjectDeleteBswmdResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'write-failed'; readonly message: string }
  | { readonly kind: 'invalid-path'; readonly message: string };

// --- Sprint 14 #1 — script engine IPC types --------------------------------
//
// The renderer drives script CRUD through 4 invoke channels and consumes
// one main→renderer push channel for live progress events. See
// `src/shared/ipc-contract.ts` for the channel names and direction.

/**
 * Request payload for `SCRIPT_LIST`. The main handler reads the project
 * manifest and returns lightweight summaries (no `source` field) so the
 * script library UI can render without paying the cost of shipping every
 * source string across the IPC boundary.
 */
export interface ScriptListRequest {
  readonly projectId: string;
}

/** Response payload for `SCRIPT_LIST`. */
export interface ScriptListResponse {
  readonly scripts: readonly ScriptSummary[];
}

/**
 * Request payload for `SCRIPT_SAVE`.
 *
 * - When `id` is omitted, the handler generates a new UUID and rejects
 *   duplicate `shortName` against existing entries.
 * - When `id` is provided, the handler overwrites the matching entry's
 *   `name` / `shortName` / `kind` / `source` / `imports` and bumps
 *   `updatedAt`.
 */
export interface ScriptSaveRequest {
  readonly projectId: string;
  /** Omit to create a new entry. */
  readonly id?: string;
  readonly name: string;
  readonly shortName: string;
  readonly kind: ScriptKind;
  readonly source: string;
}

/** Response payload for `SCRIPT_SAVE`. */
export interface ScriptSaveResponse {
  readonly id: string;
  readonly updatedAt: string;
}

/**
 * Request payload for `SCRIPT_DELETE`. The handler filters the entry
 * out of `manifest.scripts[]` and returns the (idempotent) success
 * marker. Missing-id is treated as a no-op success.
 */
export interface ScriptDeleteRequest {
  readonly projectId: string;
  readonly id: string;
}

/** Response payload for `SCRIPT_DELETE`. */
export interface ScriptDeleteResponse {
  readonly ok: true;
}

/**
 * Request payload for `SCRIPT_RUN`. `timeoutMs` is the post-hoc
 * timeout budget (spec § 8.2); when omitted the handler falls back to
 * the default (5000 ms in the vm-runner).
 */
export interface ScriptRunRequest {
  readonly projectId: string;
  readonly id: string;
  readonly timeoutMs?: number;
}

/** Response payload for `SCRIPT_RUN`. */
export type ScriptRunResponse = ScriptRunResult;

/**
 * Main → renderer progress event for `SCRIPT_PROGRESS`. Carries one log
 * line emitted by `ctx.log.*` during a run. The renderer appends each
 * event to the script output panel so the user sees progress before
 * the final `ScriptRunResult` lands.
 */
export interface ScriptProgressEvent {
  readonly runId: string;
  readonly level: ScriptLog['level'];
  readonly message: string;
  readonly ts: number;
}

// --- v1.30.0 MINOR — dcm:config IPC types ---------------------------------
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
      readonly error: {
        readonly message: string;
        readonly cause?: unknown;
      };
    };
