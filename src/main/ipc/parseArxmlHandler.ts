// Sprint 13 Stage 5.D — `arxml:parse` IPC handler.
//
// `parseArxml` is a pure function over content already in memory (the
// renderer / preload bridge feeds `req.content` in). This handler is
// the thin wrapper that adds the size cap (matching `bswmd:parse` /
// `bswmd:read` at 32 MiB) and re-shapes the result into the IPC
// `ParseArxmlResponse` envelope.
//
// Shape: `{ ok: true, value: ArxmlDocument } | { ok: false, error: { kind, message } }`.
// On cap exceed we reuse the `xml-malformed` kind — same trick the
// BSWMD cap uses (register.ts:307) — so the renderer can surface a
// single error kind for "payload rejected before parse" without
// expanding the IPC envelope.
//
// Cap rationale: 32 MiB mirrors `BSWMD_MAX_BYTES`. Real ARXML fixtures
// (CanIf / EcuC / Pdu) are well under 1 MiB; the ceiling is
// defence-in-depth against a renderer (or a tampered preload bridge)
// OOMing the main process by feeding a multi-GB string. The cap is
// applied to `req.content.length` (UTF-16 code units, the size of the
// actual in-memory string) not the original on-disk bytes — the IPC
// payload has already been UTF-8 decoded by the time it reaches us.
//
// 32 MiB ≈ 33.5M code units. Fast-xml-parser's `XMLParser.parse` is
// happy with strings of this size; the 32 MiB ceiling is below the
// 50-100 MiB range where the default V8 string representation starts
// to consume noticeable heap. See `bswmdReadHandler.ts:32-40` for the
// matching rationale on the BSWMD side.

import { parseArxml } from '../../core/arxml/parser.js';
import type { ParseArxmlRequest, ParseArxmlResponse } from '../../shared/types.js';

/**
 * Hard cap on the ARXML payload the handler will parse. Mirrors
 * `BSWMD_MAX_BYTES` — same value, same 2.6× headroom over the
 * AUTOSAR standard master ECUC parameter definition file
 * (`AUTOSAR_MOD_ECUConfigurationParameters.arxml`, ~12 MiB at R4.2.2).
 *
 * The cap is inclusive: content of exactly `ARXML_MAX_BYTES` code
 * units is allowed; one byte over is rejected. Matches the boundary
 * convention in `bswmdReadHandler.ts`.
 */
export const ARXML_MAX_BYTES = 32 * 1024 * 1024;

export function parseArxmlHandler(req: ParseArxmlRequest): ParseArxmlResponse {
  // Reject null / non-string / missing content up-front. The renderer
  // should always send `{ content: string }`, but a tampered preload
  // bridge might send a number or `null`; we treat all non-strings as
  // cap-style rejections so the renderer gets a consistent error kind.
  if (typeof req.content !== 'string') {
    return {
      ok: false,
      error: {
        kind: 'xml-malformed',
        message: 'ARXML content is not a string',
      },
    };
  }
  if (req.content.length > ARXML_MAX_BYTES) {
    // Use raw byte counts in the error message — the renderer wraps this
    // with `app.error.parseArxmlFailed` (zh-CN: "解析 ARXML 失败: ...")
    // so the cap-exceeded case becomes "解析 ARXML 失败: 内容过大
    // (33.5 MiB),最大 32.0 MiB" in zh-CN. The MiB unit choice matches
    // `bswmdReadHandler.ts:71-75`.
    const sizeMiB = (req.content.length / (1024 * 1024)).toFixed(1);
    const capMiB = (ARXML_MAX_BYTES / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      error: {
        kind: 'xml-malformed',
        message: `ARXML content too large (${sizeMiB} MiB, max ${capMiB} MiB)`,
      },
    };
  }
  return parseArxml(req.content);
}
