// v1.23.0 T1 — Extended DBC parser that retains signal-level detail.
//
// The existing `parseDbcHandler` returns a signal-summary-free
// `DbcSummary` (see the rationale block at `src/shared/types.ts:131-145`).
// For the Com-stack bridge we need per-signal metadata: `startBit`,
// `length`, `byteOrder`, `valueType`, `factor`, `offset`, `min`, `max`,
// `unit`, `receivers`. We re-parse via dbc-forge's full `Network` type
// and project to the renderer-friendly extended summary.
//
// IMPORTANT — dbc-forge field shapes (verified in
// `vendor/dbc-forge/packages/core/src/model/signal.ts`):
//   - `byteOrder` is the literal string `'little-endian' | 'big-endian'`
//     (NOT numeric 0/1 as the v0 plan assumed).
//   - `valueType` is the literal string
//     `'unsigned' | 'signed' | 'float' | 'double'` (NOT numeric 0/1,
//     and there are two more cases the v0 plan ignored).
//   - `transmitter` lives on `Message`, not on `Signal`.
//   - `receivers` is `readonly string[]` directly on `Signal`.

import { parseDbc, type Message, type Network, type Signal } from '@dbc-forge/core';

import type { Result } from '../../core/arxml/types.js';
import type { DbcMessageSummary, DbcSummary, ParseDbcRequest } from '../../shared/types.js';

/**
 * Hard cap on the DBC payload the handler will parse. Mirrors
 * `parseDbcHandler.DBC_MAX_BYTES` at 32 MiB — defence-in-depth against
 * a tampered preload bridge OOMing the main process.
 */
export const DBC_MAX_BYTES = 32 * 1024 * 1024;

/**
 * Renderer-friendly projection of a single DBC signal.
 * Field shapes are deliberately stable strings so downstream Com-stack
 * code-gen does not have to know about dbc-forge's internal types
 * (`'float' | 'double'` are mapped to `'unsigned'` since they are not
 * signed integers for AUTOSAR ComSignal purposes).
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

/** `DbcSummary` plus the flat per-signal projection the bridge needs. */
export type DbcSummaryWithSignals = DbcSummary & {
  readonly signals: readonly DbcSignalSummary[];
};

/** Stable bridge error discriminator — maps 1:1 to `ParseDbcResponse.error.kind`. */
export type DbcBridgeError = {
  readonly kind: 'dbc-malformed' | 'dbc-too-large';
  readonly message: string;
};

/**
 * Project a single dbc-forge `Signal` into the renderer-friendly
 * `DbcSignalSummary`.
 *
 * dbc-forge exposes `byteOrder` and `valueType` as strings (see file
 * header). We do NOT need to convert them; we only narrow `valueType`
 * because the AUTOSAR Com-signal universe has only `SIGNED` /
 * `UNSIGNED` (float/double are out of scope for the bridge).
 */
function projectSignal(sig: Signal, messageId: number): DbcSignalSummary {
  // SAFETY: dbc-forge constrains `valueType` to 'unsigned' | 'signed' |
  // 'float' | 'double'. The bridge contract only exposes 'signed' |
  // 'unsigned'; map float/double to 'unsigned' with a stable rule so
  // downstream codegen never produces an unhandled case. (Float/double
  // signals in DBC are exceedingly rare and not part of the v1.23.0
  // bridge scope — flagged for a later MINOR if a real fixture
  // exercises them.)
  const valueType: 'signed' | 'unsigned' = sig.valueType === 'signed' ? 'signed' : 'unsigned';
  return {
    messageId,
    name: sig.name,
    startBit: sig.startBit,
    length: sig.length,
    byteOrder: sig.byteOrder,
    valueType,
    factor: sig.factor,
    offset: sig.offset,
    min: sig.min,
    max: sig.max,
    unit: sig.unit,
    receivers: sig.receivers,
  };
}

/**
 * Project a dbc-forge `Message` into the renderer-friendly
 * `DbcMessageSummary` (same shape `parseDbcHandler` exposes for the
 * viewer; the bridge inherits it for consistency).
 */
function projectMessage(m: Message): DbcMessageSummary {
  return {
    id: m.id,
    name: m.name,
    dlc: m.dlc,
    transmitter: m.transmitter,
    signalCount: m.signals.length,
    isExtended: m.isExtended,
  };
}

/**
 * Project the full dbc-forge `Network` down to the bridge-friendly
 * `DbcSummaryWithSignals`. Messages are sorted by CAN ID ascending so
 * downstream codegen iterates deterministically regardless of parser
 * source order. Signals are emitted in declaration order (per
 * message), which preserves source semantics for the bridge.
 */
function projectNetwork(network: Network): DbcSummaryWithSignals {
  const nodes: readonly string[] = network.nodes.map((n) => n.name);
  const messages: readonly DbcMessageSummary[] = network.messages
    .map(projectMessage)
    .slice()
    .sort((a, b) => a.id - b.id);

  const signals: readonly DbcSignalSummary[] = network.messages.flatMap((m) =>
    m.signals.map((s) => projectSignal(s, m.id)),
  );

  return {
    version: network.version,
    nodeCount: nodes.length,
    messageCount: messages.length,
    nodes,
    messages,
    signals,
  };
}

/**
 * Parallel IPC handler that re-parses a DBC string and returns a
 * signal-level-extended summary. Caller (renderer) is expected to
 * supply `{ path, content }` where `content` is the raw UTF-8 string
 * already read from disk by `openDbcHandler` (the bridge handler does
 * NOT touch the filesystem).
 *
 * Failure modes:
 *   - `dbc-too-large`: `content.length > DBC_MAX_BYTES`. Mirrors
 *     `parseDbcHandler` cap policy (inclusive boundary at exactly
 *     `DBC_MAX_BYTES`).
 *   - `dbc-malformed`: content is not a string, parser threw, or
 *     content is empty (matches `parseDbcHandler` empty-input
 *     decision).
 */
export function dbcParseForBridgeHandler(
  req: ParseDbcRequest,
): Result<DbcSummaryWithSignals, DbcBridgeError> {
  // Defensive string guard — mirrors parseDbcHandler.ts:46-54.
  if (typeof req.content !== 'string') {
    return {
      ok: false,
      error: { kind: 'dbc-malformed', message: 'DBC content is not a string' },
    };
  }
  if (req.content.length > DBC_MAX_BYTES) {
    const sizeMiB = (req.content.length / (1024 * 1024)).toFixed(1);
    const capMiB = (DBC_MAX_BYTES / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      error: {
        kind: 'dbc-too-large',
        message: `DBC content too large (${sizeMiB} MiB, max ${capMiB} MiB)`,
      },
    };
  }
  if (req.content.length === 0) {
    return {
      ok: false,
      error: { kind: 'dbc-malformed', message: 'DBC content is empty' },
    };
  }
  let network: Network;
  try {
    network = parseDbc(req.content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: {
        kind: 'dbc-malformed',
        message: message.length > 0 ? message : 'DBC parse failed',
      },
    };
  }
  return { ok: true, value: projectNetwork(network) };
}
