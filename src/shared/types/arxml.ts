// --- F1 ARXML IO types -----------------------------------------------------

import type { ParseError } from '../../core/arxml/parser.js';
import type { ArxmlDocument, Result } from '../../core/arxml/types.js';

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
  readonly isExtended: boolean;
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
