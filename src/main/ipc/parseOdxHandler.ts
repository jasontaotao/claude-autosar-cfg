// v1.22.0 T1 — `odx:parse` IPC handler.
//
// ODX-D (ISO 22901) is an XML-based diagnostic exchange format. The
// minimum surface the v1.22.0 viewer needs is three flat lists
// (DTCs, DIDs, Routines) extracted from the BASE-VARIANT
// DIAG-LAYER. This handler is the smallest piece that closes the
// v1.21.0 carry-over "ODX 完全没做" gap (devlog line 88) — a
// read-only summary, no cross-ref to ARXML, no DIAG-LAYER state
// chart, no functional-group enumeration.
//
// Why a summary (and not the full ODX-DOM): ODX-D files can carry
// thousands of state-chart transitions + env-data descriptors that
// the GUI's <OdxViewer /> does not render. Streaming the full
// DIAG-LAYER across IPC would inflate every parse with no UX
// benefit. The summary carries only what the viewer's 3 tabs need;
// a future "drill into detail" affordance can introduce a second
// channel that streams the full shape if the need actually arises
// (mirrors the `DbcSummary` decision at `parseDbcHandler.ts:8-16`).
//
// Parser choice: `fast-xml-parser` (already a dep for ARXML + BSWMD).
// Pure function, no IO; testable in isolation without an IPC
// round-trip — mirrors the `parseDbcHandler` / `parseArxmlHandler`
// extraction pattern.

import { XMLParser } from 'fast-xml-parser';

import type {
  OdxDidSummary,
  OdxDtcSummary,
  OdxRoutineSummary,
  OdxSummary,
  ParseOdxRequest,
  ParseOdxResponse,
} from '../../shared/types.js';

/**
 * Hard cap on the ODX payload the handler will parse. Mirrors
 * `DBC_MAX_BYTES` / `ARXML_MAX_BYTES` / `BSWMD_MAX_BYTES`. Inclusive:
 * content of exactly `ODX_MAX_BYTES` code units is allowed; one
 * over is rejected.
 */
export const ODX_MAX_BYTES = 32 * 1024 * 1024;

/** XMLParser config — identical to `parseArxml` minus namespace prefix
 *  stripping (ODX-D uses namespace prefixes throughout, so we keep
 *  them and project them away at extraction time). */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  removeNSPrefix: false,
  processEntities: true,
  trimValues: false,
});

export function parseOdxHandler(req: ParseOdxRequest): ParseOdxResponse {
  // Defensive: the renderer should always send `{ content: string }`,
  // but a tampered preload bridge might send a number or `null`. We
  // treat all non-strings as parse failures so the renderer gets a
  // consistent error kind. Mirrors `parseDbcHandler.ts:46-54`.
  if (typeof req.content !== 'string') {
    return {
      ok: false,
      error: {
        kind: 'odx-malformed',
        message: 'ODX content is not a string',
      },
    };
  }
  if (req.content.length > ODX_MAX_BYTES) {
    const sizeMiB = (req.content.length / (1024 * 1024)).toFixed(1);
    const capMiB = (ODX_MAX_BYTES / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      error: {
        kind: 'odx-too-large',
        message: `ODX content too large (${sizeMiB} MiB, max ${capMiB} MiB)`,
      },
    };
  }
  if (req.content.length === 0) {
    return {
      ok: false,
      error: {
        kind: 'odx-malformed',
        message: 'ODX content is empty',
      },
    };
  }
  let raw: unknown;
  try {
    raw = parser.parse(req.content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: {
        kind: 'odx-malformed',
        message: message.length > 0 ? message : 'ODX parse failed',
      },
    };
  }
  // Validate the ODX root. fast-xml-parser returns the root tag as
  // the top-level key (e.g. `ODX`); a non-ODX XML still parses but
  // has no `DTC-DOPS` / `DID-OBJECTS` / `REQUESTS` shape.
  const root = extractRoot(raw, 'ODX');
  if (root === null) {
    return {
      ok: false,
      error: {
        kind: 'odx-malformed',
        message: 'Missing <ODX> root element',
      },
    };
  }
  try {
    return {
      ok: true,
      value: summarizeOdx(root),
    };
  } catch (err) {
    // Defensive: a structure we did not expect (vendor extension
    // child element replacing a known one, etc.) — surface as a
    // parse failure rather than letting the renderer hang on a
    // half-extracted summary.
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: {
        kind: 'odx-malformed',
        message: `ODX shape extraction failed: ${message}`,
      },
    };
  }
}

/** Pull the named root element from the parsed XML. fast-xml-parser
 *  wraps everything in the root tag as a top-level key. Returns
 *  `null` when the root is absent or the parsed value is not an
 *  object (e.g. a bare scalar or array). */
function extractRoot(raw: unknown, name: string): Record<string, unknown> | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = (raw as Record<string, unknown>)[name];
  if (typeof candidate !== 'object' || candidate === null) return null;
  return candidate as Record<string, unknown>;
}

/** Project the parsed ODX root down to the renderer-friendly
 *  `OdxSummary`. Walks the standard ODX-D BASE-VARIANT shape:
 *    ODX > DIAG-LAYER-CONTAINER > DIAG-LAYER >
 *      DTC-DOPS > [DTC-DOP > DTC]
 *      DID-OBJECTS > [DID-OBJECT]
 *      REQUESTS > [REQUEST] (treated as Routine)
 *
 *  Vendor extensions (DIAG-LAYER child types other than the three
 *  above) are ignored — T1 ships the minimum viable surface. */
function summarizeOdx(odx: Record<string, unknown>): OdxSummary {
  const container = firstChild(odx, 'DIAG-LAYER-CONTAINER');
  const layer = container ? firstChild(container, 'DIAG-LAYER') : undefined;
  if (layer === undefined) {
    return { dtcCount: 0, didCount: 0, routineCount: 0, dtcs: [], dids: [], routines: [] };
  }
  const dtcs = extractDtcs(layer);
  const dids = extractDids(layer);
  const routines = extractRoutines(layer);
  return {
    dtcCount: dtcs.length,
    didCount: dids.length,
    routineCount: routines.length,
    dtcs,
    dids,
    routines,
  };
}

/** Get the first child element with the given tag name. fast-xml-parser
 *  normalises a single-child element to an object (not an array); we
 *  therefore unwrap arrays via `asArray` before reading. */
function firstChild(
  parent: Record<string, unknown>,
  name: string,
): Record<string, unknown> | undefined {
  const raw = parent[name];
  if (raw === undefined) return undefined;
  const arr = asArray(raw);
  const first = arr[0];
  if (typeof first !== 'object' || first === null) return undefined;
  return first as Record<string, unknown>;
}

/** Normalise a fast-xml-parser value to an array. Object → `[obj]`;
 *  array → itself; anything else → `[]`. */
function asArray(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'object' && value !== null) return [value];
  return [];
}

/** Read an attribute value from a parsed element. fast-xml-parser
 *  prefixes attribute names with `@_`. Returns the literal string
 *  (no parsing — `parseAttributeValue: false`). */
function attrOf(el: Record<string, unknown>, name: string): string {
  const v = el[`@_${name}`];
  return typeof v === 'string' ? v : '';
}

function extractDtcs(layer: Record<string, unknown>): readonly OdxDtcSummary[] {
  const container = firstChild(layer, 'DTC-DOPS');
  if (container === undefined) return [];
  const dtcs = asArray(container['DTC-DOP']);
  return dtcs.flatMap((raw): OdxDtcSummary[] => {
    if (typeof raw !== 'object' || raw === null) return [];
    const dtcEl = raw as Record<string, unknown>;
    const id = attrOf(dtcEl, 'ID');
    const shortName = attrOf(dtcEl, 'SHORT-NAME');
    // The `<DTC>` child carries the actual trouble code + display text.
    const dtcChild = firstChild(dtcEl, 'DTC');
    if (dtcChild === undefined) return [];
    const troubleCode = attrOf(dtcChild, 'TROUBLE-CODE');
    const text = attrOf(dtcChild, 'TEXT');
    return [
      {
        id,
        shortName,
        troubleCode,
        displayCode: stripHexPrefix(troubleCode),
        text,
      },
    ];
  });
}

function extractDids(layer: Record<string, unknown>): readonly OdxDidSummary[] {
  const container = firstChild(layer, 'DID-OBJECTS');
  if (container === undefined) return [];
  const dids = asArray(container['DID-OBJECT']);
  return dids.flatMap((raw): OdxDidSummary[] => {
    if (typeof raw !== 'object' || raw === null) return [];
    const el = raw as Record<string, unknown>;
    return [
      {
        id: attrOf(el, 'ID'),
        shortName: attrOf(el, 'SHORT-NAME'),
      },
    ];
  });
}

function extractRoutines(layer: Record<string, unknown>): readonly OdxRoutineSummary[] {
  // ODX-D models Routines as REQUEST + POS-RESPONSE pairs. The
  // viewer's "Routines" tab groups by REQUEST `SHORT-NAME`; the
  // POS-RESPONSE is optional and not surfaced in T1.
  const container = firstChild(layer, 'REQUESTS');
  if (container === undefined) return [];
  const requests = asArray(container['REQUEST']);
  return requests.flatMap((raw): OdxRoutineSummary[] => {
    if (typeof raw !== 'object' || raw === null) return [];
    const el = raw as Record<string, unknown>;
    return [
      {
        id: attrOf(el, 'ID'),
        shortName: attrOf(el, 'SHORT-NAME'),
      },
    ];
  });
}

/** Strip a `0x` or `0X` prefix from a hex string. Defensive against
 *  an ODX file that emits the code without a prefix — returns the
 *  input unchanged in that case. */
function stripHexPrefix(s: string): string {
  if (s.length >= 2 && s[0] === '0' && (s[1] === 'x' || s[1] === 'X')) {
    return s.slice(2);
  }
  return s;
}
