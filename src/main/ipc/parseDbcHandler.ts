// v1.21.0 Bug #5 — `dbc:parse` IPC handler.
//
// `@dbc-forge/core` was installed in v1.7.0 Cluster 3 I (smoke test
// in `src/__tests__/dbcForgeBridge.smoke.test.ts`) but never wired
// to the renderer. This handler is the smallest piece that closes
// the gap: take a DBC string already in memory, parse it, return a
// renderer-friendly summary.
//
// Why a summary (and not the full `Network`): DBC networks can carry
// hundreds of attributes, value tables, and signal groups that the
// GUI's `<DbcViewer />` does not render. Streaming the full Network
// across IPC would inflate every parse with no UX benefit. The
// summary carries only what the viewer's messages table + node chip
// row need; a future "drill into detail" affordance can introduce a
// second channel that streams the full Network if the need actually
// arises (YAGNI — see Bug #5 follow-ups in MEMORY.md).
//
// Cap rationale: mirrors `parseArxmlHandler.ts:42` at 32 MiB. Real
// DBC files are usually <100 KiB; the ceiling is defence-in-depth
// against a renderer (or tampered preload bridge) OOMing the main
// process by feeding a multi-GB string.

import { parseDbc } from '@dbc-forge/core';
import type { Network } from '@dbc-forge/core';

import type {
  DbcMessageSummary,
  DbcSummary,
  ParseDbcRequest,
  ParseDbcResponse,
} from '../../shared/types.js';

/**
 * Hard cap on the DBC payload the handler will parse. Mirrors
 * `ARXML_MAX_BYTES` / `BSWMD_MAX_BYTES`. Inclusive: content of
 * exactly `DBC_MAX_BYTES` code units is allowed; one over is
 * rejected.
 */
export const DBC_MAX_BYTES = 32 * 1024 * 1024;

export function parseDbcHandler(req: ParseDbcRequest): ParseDbcResponse {
  // Defensive: the renderer should always send `{ content: string }`,
  // but a tampered preload bridge might send a number or `null`. We
  // treat all non-strings as parse failures so the renderer gets a
  // consistent error kind. Mirrors `parseArxmlHandler.ts:49-57`.
  if (typeof req.content !== 'string') {
    return {
      ok: false,
      error: {
        kind: 'dbc-malformed',
        message: 'DBC content is not a string',
      },
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
  // `@dbc-forge/core` is lenient — an empty string parses to an
  // empty Network (0 nodes / 0 messages). The renderer would then
  // show "0 messages" for a file the user obviously did not mean to
  // open. Treat empty as a malformed input so the user sees a clear
  // "DBC is empty" error.
  if (req.content.length === 0) {
    return {
      ok: false,
      error: {
        kind: 'dbc-malformed',
        message: 'DBC content is empty',
      },
    };
  }
  let network: Network;
  try {
    network = parseDbc(req.content);
  } catch (err) {
    // @dbc-forge/core's parser throws `ParseError` on syntax issues;
    // we collapse every parse failure into the same `dbc-malformed`
    // kind so the renderer has a single error branch to handle
    // (matches the `xml-malformed` collapse in `parseArxmlHandler`).
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: {
        kind: 'dbc-malformed',
        // Prefix the underlying message so the user can see what the
        // parser was unhappy about (line / column info from the
        // parser's diagnostics). The renderer wraps this with a
        // localized "Parse DBC failed: …" prefix (zh-CN: "解析 DBC
        // 失败: …").
        message: message.length > 0 ? message : 'DBC parse failed',
      },
    };
  }
  return {
    ok: true,
    value: summarizeNetwork(network),
  };
}

/**
 * Project a full `@dbc-forge/core` `Network` down to the
 * renderer-friendly summary the IPC contract exposes. Pure
 * function; no IO.
 *
 * `nodes` is the list of ECU / network-node names (`@dbc-forge`
 * exposes them as objects; we extract just the `name` string for the
 * viewer's chip row).
 *
 * `messages` is sorted by CAN ID ascending so the viewer's table is
 * stable across parses (the parser's order is source-dependent).
 */
function summarizeNetwork(network: Network): DbcSummary {
  const nodes: string[] = network.nodes.map((n) => n.name);
  const messages: DbcMessageSummary[] = network.messages
    .map<DbcMessageSummary>((m) => ({
      id: m.id,
      name: m.name,
      dlc: m.dlc,
      // @dbc-forge core exposes the primary transmitter as a plain
      // string (`m.transmitter`); multi-transmitter messages have
      // `m.additionalTransmitters`. For the typical single-transmitter
      // DBC the primary is exactly what the viewer wants. Multi-tx
      // messages would need a separate column (Bug #5 follow-up).
      transmitter: m.transmitter,
      signalCount: m.signals.length,
    }))
    .sort((a, b) => a.id - b.id);
  return {
    version: network.version,
    nodeCount: nodes.length,
    messageCount: messages.length,
    nodes,
    messages,
  };
}
