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
  OdxDidData,
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

/** XMLParser config — identical to `parseArxml` plus `parseTagValue:
 *  false` (T4 real-fixture fix). fast-xml-parser defaults to
 *  parsing numeric text content (`<TROUBLE-CODE>687361</TROUBLE-CODE>`
 *  becomes the JS number `687361`); we need the raw string for
 *  the ODX summary. The `parseAttributeValue: false` flag covers
 *  attributes but NOT child element text. */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
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
 *  `OdxSummary`.
 *
 *  T1 originally assumed the spec-canonical shape:
 *    ODX > DIAG-LAYER-CONTAINER > DIAG-LAYER >
 *      DTC-DOPS > [DTC-DOP > DTC]
 *      DID-OBJECTS > [DID-OBJECT]
 *      REQUESTS > [REQUEST] (treated as Routine)
 *
 *  T4 real-OEM validation (Vector CANdelaStudio .odx-d export)
 *  surfaced two vendor-shape deviations that the spec hand-crafted
 *  fixture did not cover:
 *    1. DTC-DOPS live inside `ECU-SHARED-DATAS > ECU-SHARED-DATA
 *       > DIAG-DATA-DICTIONARY-SPEC` (NOT directly under the
 *       DIAG-LAYER). Real Vector files wrap shared diagnostic
 *       data outside any specific BASE-VARIANT.
 *    2. Each `<DTC-DOP>` contains a `<DTCS>` (plural) wrapper
 *       around the actual `<DTC>` children — the spec allows both
 *       shapes, but Vector's exporter always wraps.
 *    3. REQUESTS live inside `BASE-VARIANTS > BASE-VARIANT`
 *       (NOT directly under DIAG-LAYER).
 *
 *  T4 fixes the parser to walk BOTH the canonical and the Vector
 *  shape (whichever is present). The fixes are M2 from the T1
 *  code-review deferred MEDIUMs (vendor-extension shape catch).
 */
function summarizeOdx(odx: Record<string, unknown>): OdxSummary {
  const container = firstChild(odx, 'DIAG-LAYER-CONTAINER');
  if (container === undefined) {
    return { dtcCount: 0, didCount: 0, routineCount: 0, dtcs: [], dids: [], routines: [] };
  }
  const layer = firstChild(container, 'DIAG-LAYER');

  // DTCs may live in (a) DIAG-LAYER direct children, OR (b) the
  // ECU-SHARED-DATAS > ECU-SHARED-DATA > DIAG-DATA-DICTIONARY-SPEC
  // subtree. Walk both.
  const dtcHost = layer ?? container;
  const dtcs = extractDtcs(dtcHost, container);

  // DIDs (optional in ODX-D — only present when the file models
  // data identifiers). Look in both locations, same as DTCs.
  // v1.24.0 T4 real-OEM fix: also walk REQUESTS and pick out
  // SERVICE-ID = 0x22 (ReadDataByIdentifier) — Vector .odx-d
  // files model DIDs that way.
  const dids = extractDids(dtcHost, container, layer, container);

  // Routines (REQUEST) live in BASE-VARIANTS > BASE-VARIANT in
  // Vector's shape, OR directly under DIAG-LAYER in the spec
  // shape. Walk both.
  const routines = extractRoutines(layer, container);

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

/** Read a value from a parsed element. fast-xml-parser prefixes
 *  attribute names with `@_`; child elements are read by their tag
 *  name. T1 hand-crafted fixtures used `TROUBLE-CODE` as an XML
 *  attribute on the `<DTC>` element; the ODX-D spec (and every
 *  real Vector export) models it as a CHILD element. Read attribute
 *  first, then fall back to the first child element by tag name,
 *  so both shapes are supported. */
function attrOf(el: Record<string, unknown>, name: string): string {
  const attrVal = el[`@_${name}`];
  if (typeof attrVal === 'string') return attrVal;
  // Child-element fallback. fast-xml-parser unwraps a single child
  // into an object (not an array); an array stays an array. With
  // `parseTagValue: false` the text content is always a string.
  const childRaw = el[name];
  if (typeof childRaw === 'string') return childRaw;
  if (typeof childRaw === 'number' || typeof childRaw === 'boolean') return String(childRaw);
  if (typeof childRaw === 'object' && childRaw !== null) {
    const arr = asArray(childRaw);
    if (arr.length === 0) return '';
    const first = arr[0];
    if (typeof first === 'string') return first;
    if (typeof first === 'number' || typeof first === 'boolean') return String(first);
    if (typeof first === 'object' && first !== null) {
      const text = (first as Record<string, unknown>)['#text'];
      if (typeof text === 'string') return text;
    }
  }
  return '';
}

function extractDtcs(
  primary: Record<string, unknown>,
  secondary: Record<string, unknown>,
): readonly OdxDtcSummary[] {
  // Walk every DTC-DOPS container reachable from either root, in
  // document order. The two roots handle the spec shape
  // (DIAG-LAYER > DTC-DOPS) and the Vector shape
  // (DIAG-LAYER-CONTAINER > ECU-SHARED-DATAS > ... > DTC-DOPS).
  const out: OdxDtcSummary[] = [];
  const seen = new Set<string>();
  for (const root of [primary, secondary]) {
    collectDtcContainers(root).forEach((dtcDopsContainer) => {
      const dtcDops = asArray(dtcDopsContainer['DTC-DOP']);
      for (const raw of dtcDops) {
        if (typeof raw !== 'object' || raw === null) continue;
        const dtcEl = raw as Record<string, unknown>;
        const id = attrOf(dtcEl, 'ID');
        // Each DTC-DOP can carry multiple `<DTC>` children, either
        // directly (spec shape) or wrapped in a `<DTCS>` element
        // (Vector shape). Walk the children of both: any `<DTC>`
        // we find is a real DTC entry. Dedup by id so a file that
        // declares the same DTC twice (rare but legal) does not
        // double the count.
        const dtcChildren = collectDtcChildren(dtcEl);
        for (let dtcIndex = 0; dtcIndex < dtcChildren.length; dtcIndex++) {
          const dtcChild = dtcChildren[dtcIndex];
          // `dtcChildren[dtcIndex]` is `Record<string, unknown> |
          // undefined` under `noUncheckedIndexedAccess`; we just
          // bounds-checked above so the unwrap is safe.
          if (dtcChild === undefined) continue;
          // Real Vector files give every <DTC> its own ID. The
          // hand-crafted T1 fixture (and rare ODX-D extensions)
          // may omit it; fall back to `${parentId}#${index}` so
          // a DTC-DOP with multiple ID-less children is deduped
          // per-child instead of having all but the first
          // silently dropped.
          const childId = attrOf(dtcChild, 'ID');
          const dtcId = childId.length > 0 ? childId : `${id}#${dtcIndex}`;
          if (dtcId.length === 0) continue;
          const key = dtcId;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            id: dtcId,
            // SHORT-NAME preference: the DTC's own SHORT-NAME
            // (e.g. "DTC0A7D01") is the canonical display; fall
            // back to the DTC-DOP's SHORT-NAME if the DTC has
            // none.
            shortName:
              attrOf(dtcChild, 'SHORT-NAME').length > 0
                ? attrOf(dtcChild, 'SHORT-NAME')
                : attrOf(dtcEl, 'SHORT-NAME'),
            // `troubleCode` is the raw wire-format numeric
            // (decimal per Vector export; the spec is decimal).
            // `displayCode` is the SAE J2012 form
            // (`<DISPLAY-TROUBLE-CODE>`, e.g. "P0A7D01") — the
            // form a diagnostic engineer actually reads. Older
            // hand-crafted fixtures modelled `0x...` hex strings
            // as `TROUBLE-CODE`; real Vector files put hex/decimal
            // in `TROUBLE-CODE` and the J2012 form in
            // `DISPLAY-TROUBLE-CODE`. We map the column to the
            // J2012 form (empty when the file omits it).
            troubleCode: attrOf(dtcChild, 'TROUBLE-CODE'),
            displayCode: attrOf(dtcChild, 'DISPLAY-TROUBLE-CODE'),
            text: buildDtcText(dtcChild),
          });
        }
      }
    });
  }
  return out;
}

/** Collect every `<DTC-DOPS>` wrapper reachable from `root`,
 *  descending through `ECU-SHARED-DATAS` and
 *  `DIAG-DATA-DICTIONARY-SPEC` to handle the Vector export
 *  shape. Spec-shape files (DTC-DOPS directly under
 *  DIAG-LAYER) are also covered. */
function collectDtcContainers(root: Record<string, unknown>): readonly Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  // Direct DTC-DOPS at this root (spec shape).
  for (const el of asArray(root['DTC-DOPS'])) {
    if (typeof el === 'object' && el !== null) out.push(el as Record<string, unknown>);
  }
  // Vector shape: ECU-SHARED-DATAS > ECU-SHARED-DATA >
  // DIAG-DATA-DICTIONARY-SPEC > DTC-DOPS.
  for (const esdWrapper of asArray(root['ECU-SHARED-DATAS'])) {
    if (typeof esdWrapper !== 'object' || esdWrapper === null) continue;
    for (const esd of asArray((esdWrapper as Record<string, unknown>)['ECU-SHARED-DATA'])) {
      if (typeof esd !== 'object' || esd === null) continue;
      const spec = firstChild(esd as Record<string, unknown>, 'DIAG-DATA-DICTIONARY-SPEC');
      if (spec === undefined) continue;
      for (const el of asArray(spec['DTC-DOPS'])) {
        if (typeof el === 'object' && el !== null) out.push(el as Record<string, unknown>);
      }
    }
  }
  return out;
}

/** Collect the actual `<DTC>` child elements of a `<DTC-DOP>`,
 *  unwrapping the `<DTCS>` plural wrapper when present. */
function collectDtcChildren(dtcDop: Record<string, unknown>): readonly Record<string, unknown>[] {
  // Spec shape: <DTC-DOP> contains <DTC> children directly. We
  // also handle plural <DTC-DOP> siblings (rare but legal) by
  // checking the `DTC` key on the wrapper itself.
  const direct = asArray(dtcDop['DTC']).filter(
    (e): e is Record<string, unknown> => typeof e === 'object' && e !== null,
  );
  if (direct.length > 0) return direct;
  // Vector shape: <DTC-DOP> > <DTCS> > <DTC> (plural).
  const dtcWrapper = firstChild(dtcDop, 'DTCS');
  if (dtcWrapper === undefined) return [];
  return asArray(dtcWrapper['DTC']).filter(
    (e): e is Record<string, unknown> => typeof e === 'object' && e !== null,
  );
}

/** Build the text column for a DTC row. Prefers the
 *  `DISPLAY-TROUBLE-CODE` (SAE J2012 form) when present (the
 *  diagnostic engineer cares about P-codes more than the wire
 *  hex), falls back to the `TEXT` element, or is empty when
 *  neither is set. */
function buildDtcText(dtc: Record<string, unknown>): string {
  const display = attrOf(dtc, 'DISPLAY-TROUBLE-CODE');
  const text = attrOf(dtc, 'TEXT');
  if (display.length > 0 && text.length > 0) return `${display} — ${text}`;
  if (display.length > 0) return display;
  return text;
}

function extractDids(
  primary: Record<string, unknown>,
  secondary: Record<string, unknown>,
  layer: Record<string, unknown> | undefined,
  container: Record<string, unknown>,
): readonly OdxDidSummary[] {
  const out: OdxDidSummary[] = [];
  const seen = new Set<string>();
  for (const root of [primary, secondary]) {
    // Direct DID-OBJECTS at this root.
    for (const wrapper of asArray(root['DID-OBJECTS'])) {
      if (typeof wrapper !== 'object' || wrapper === null) continue;
      for (const raw of asArray((wrapper as Record<string, unknown>)['DID-OBJECT'])) {
        if (typeof raw !== 'object' || raw === null) continue;
        const el = raw as Record<string, unknown>;
        const id = attrOf(el, 'ID');
        if (id.length === 0 || seen.has(id)) continue;
        seen.add(id);
        out.push({ id, shortName: attrOf(el, 'SHORT-NAME') });
      }
    }
    // Vector shape: ECU-SHARED-DATAS > ... > DIAG-DATA-DICTIONARY-SPEC > DID-OBJECTS.
    for (const esdWrapper of asArray(root['ECU-SHARED-DATAS'])) {
      if (typeof esdWrapper !== 'object' || esdWrapper === null) continue;
      for (const esd of asArray((esdWrapper as Record<string, unknown>)['ECU-SHARED-DATA'])) {
        if (typeof esd !== 'object' || esd === null) continue;
        const spec = firstChild(esd as Record<string, unknown>, 'DIAG-DATA-DICTIONARY-SPEC');
        if (spec === undefined) continue;
        for (const wrapper of asArray(spec['DID-OBJECTS'])) {
          if (typeof wrapper !== 'object' || wrapper === null) continue;
          for (const raw of asArray((wrapper as Record<string, unknown>)['DID-OBJECT'])) {
            if (typeof raw !== 'object' || raw === null) continue;
            const el = raw as Record<string, unknown>;
            const id = attrOf(el, 'ID');
            if (id.length === 0 || seen.has(id)) continue;
            seen.add(id);
            out.push({ id, shortName: attrOf(el, 'SHORT-NAME') });
          }
        }
      }
    }
  }
  // v1.24.0 T4 real-OEM fix: Vector .odx-d files model DIDs as
  // REQUEST entries with `SERVICE-ID` CODED-VALUE = 0x22
  // (ReadDataByIdentifier), NOT as standalone `<DID-OBJECT>`
  // elements. Walk REQUESTS alongside the standalone-DID walk
  // and pick out the 0x22 ones. Dedup by REQUEST `ID` so a
  // declaration that appears both as a `<DID-OBJECT>` and a
  // REQUEST (rare but legal) does not double the count.
  const seenReqs = new Set<string>();
  const collectDidsFrom = (root: Record<string, unknown>): void => {
    for (const wrapper of asArray(root['REQUESTS'])) {
      if (typeof wrapper !== 'object' || wrapper === null) continue;
      for (const raw of asArray((wrapper as Record<string, unknown>)['REQUEST'])) {
        if (typeof raw !== 'object' || raw === null) continue;
        const el = raw as Record<string, unknown>;
        const id = attrOf(el, 'ID');
        if (id.length === 0 || seenReqs.has(id)) continue;
        seenReqs.add(id);
        const sid = serviceIdOf(el);
        // 0x22 = ReadDataByIdentifier (UDS SID 0x22 = decimal 34).
        // 0x2E (0x2E = 46, DynamicDefineDataIdentifier) is
        // intentionally NOT a Diagnostic Extract DID — it
        // defines a DID at runtime. Skip.
        if (sid !== 0x22) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        // v1.24.x PATCH: capture DIAG-CODED-TYPE from the 0x22
        // REQUEST's DID-value PARAM (the PARAM whose SEMANTIC
        // is neither SERVICE-ID nor SUBFUNCTION). The legacy
        // hand-crafted fixtures model DIDs without this data,
        // so the `data` field is OPTIONAL — the helper returns
        // `null` when no DIAG-CODED-TYPE is found.
        const data = extractDidDataFromRequestParams(el['PARAMS']);
        if (data !== null) {
          out.push({ id, shortName: attrOf(el, 'SHORT-NAME'), data });
        } else {
          out.push({ id, shortName: attrOf(el, 'SHORT-NAME') });
        }
      }
    }
  };
  if (layer !== undefined) collectDidsFrom(layer);
  // Vector shape: BASE-VARIANTS > BASE-VARIANT > REQUESTS.
  for (const bvWrapper of asArray(container['BASE-VARIANTS'])) {
    if (typeof bvWrapper !== 'object' || bvWrapper === null) continue;
    for (const bv of asArray((bvWrapper as Record<string, unknown>)['BASE-VARIANT'])) {
      if (typeof bv !== 'object' || bv === null) continue;
      collectDidsFrom(bv as Record<string, unknown>);
    }
  }
  return out;
}

/**
 * v1.24.x PATCH — Extract DIAG-CODED-TYPE from a 0x22 REQUEST's
 * DID-value PARAM. The DID-value PARAM is the one whose SEMANTIC
 * attribute is NOT 'SERVICE-ID' and NOT 'SUBFUNCTION'.
 *
 * Returns null if no DIAG-CODED-TYPE is found (legacy hand-crafted
 * fixtures have DIDs without this data; the field is OPTIONAL).
 *
 * The caller passes `REQUEST.PARAMS` (the object containing the
 * `PARAM` array). The fast-xml-parser wraps the PARAMs under a
 * `PARAMS` object with a `PARAM` child, so we descend one level.
 */
function extractDidDataFromRequestParams(params: unknown): OdxDidData | null {
  if (typeof params !== 'object' || params === null) return null;
  const paramsObj = params as Record<string, unknown>;
  const paramList = asArray(paramsObj['PARAM']);
  for (const param of paramList) {
    if (typeof param !== 'object' || param === null) continue;
    const p = param as Record<string, unknown>;
    // Skip SERVICE-ID and SUBFUNCTION PARAMs.
    if (p['@_SEMANTIC'] === 'SERVICE-ID' || p['@_SEMANTIC'] === 'SUBFUNCTION') continue;
    // Found the DID-value PARAM. Extract its DIAG-CODED-TYPE.
    const dct = p['DIAG-CODED-TYPE'];
    if (typeof dct !== 'object' || dct === null) continue;
    const dctObj = dct as Record<string, unknown>;
    const dataType = dctObj['@_BASE-DATA-TYPE'];
    const encoding = dctObj['@_BASE-TYPE-ENCODING'];
    if (typeof dataType !== 'string') continue;
    // BIT-LENGTH may come back as a number or string depending on
    // parser config; coerce defensively.
    let bitLength: number | undefined;
    const rawBitLength = dctObj['BIT-LENGTH'];
    if (typeof rawBitLength === 'number') {
      bitLength = rawBitLength;
    } else if (typeof rawBitLength === 'string' && rawBitLength.length > 0) {
      const parsed = Number(rawBitLength);
      if (Number.isFinite(parsed)) bitLength = parsed;
    }
    return {
      dataType,
      encoding: typeof encoding === 'string' ? encoding : 'NONE',
      ...(bitLength !== undefined ? { bitLength } : {}),
    };
  }
  return null;
}

function extractRoutines(
  layer: Record<string, unknown> | undefined,
  container: Record<string, unknown>,
): readonly OdxRoutineSummary[] {
  // ODX-D models Routines as REQUEST + POS-RESPONSE pairs. The
  // viewer's "Routines" tab groups by REQUEST `SHORT-NAME`; the
  // POS-RESPONSE is optional and not surfaced in T1.
  //
  // Spec shape: REQUESTS directly under DIAG-LAYER.
  // Vector shape: REQUESTS inside BASE-VARIANTS > BASE-VARIANT
  // (we also walk any other BASE-VARIANT siblings — multiple
  // variants per file are legal in ODX-D).
  //
  // v1.24.0 T4 real-OEM fix: a Vector .odx-d file declares ALL
  // UDS services (ReadDataByIdentifier, ReadDTCInformation,
  // SecurityAccess, …) as REQUEST entries — not just Routines.
  // The hand-crafted T1 fixture used a REQUEST with no SERVICE-ID
  // param (the legacy interpretation was "every REQUEST is a
  // Routine"). Real OEM files distinguish them via the first
  // `<PARAM SEMANTIC="SERVICE-ID"><CODED-VALUE>` child:
  //   - 0x22 (34, ReadDataByIdentifier)  → DID-shaped request
  //   - 0x31 (49, RoutineControl)        → Routine
  //   - any other / missing              → ignored (not a
  //     Diagnostic Extract candidate)
  //
  // Backward compat: a REQUEST with no SERVICE-ID param keeps
  // the T1 behavior of being classified as a Routine. This
  // preserves the hand-crafted fixture (1 REQUEST → 1 routine)
  // without forcing a fixture rewrite.
  const out: OdxRoutineSummary[] = [];
  const seen = new Set<string>();
  const collectFrom = (root: Record<string, unknown>): void => {
    for (const wrapper of asArray(root['REQUESTS'])) {
      if (typeof wrapper !== 'object' || wrapper === null) continue;
      for (const raw of asArray((wrapper as Record<string, unknown>)['REQUEST'])) {
        if (typeof raw !== 'object' || raw === null) continue;
        const el = raw as Record<string, unknown>;
        const id = attrOf(el, 'ID');
        if (id.length === 0 || seen.has(id)) continue;
        const sid = serviceIdOf(el);
        // 0x31 = RoutineControl: a real Routine.
        // missing/0x00 = legacy shape; treat as Routine (T1 fixture).
        // 0x22 = ReadDataByIdentifier: this is a DID-shaped request,
        // surfaced through `extractDids` instead — do NOT emit it
        // from the routine walk.
        // 0x2E (DynamicDefineDataIdentifier) is intentionally not
        // emitted; the Diagnostic Extract bridge does not model it.
        if (sid !== null && sid !== 0x31 && sid !== 0x00) continue;
        seen.add(id);
        out.push({ id, shortName: attrOf(el, 'SHORT-NAME') });
      }
    }
  };
  if (layer !== undefined) collectFrom(layer);
  // Vector shape: BASE-VARIANTS > BASE-VARIANT > REQUESTS.
  for (const bvWrapper of asArray(container['BASE-VARIANTS'])) {
    if (typeof bvWrapper !== 'object' || bvWrapper === null) continue;
    for (const bv of asArray((bvWrapper as Record<string, unknown>)['BASE-VARIANT'])) {
      if (typeof bv !== 'object' || bv === null) continue;
      collectFrom(bv as Record<string, unknown>);
    }
  }
  return out;
}

/** UDS SERVICE-ID (the first byte of every UDS request). Read
 *  from the first `<PARAM SEMANTIC="SERVICE-ID">` child's
 *  `<CODED-VALUE>`. Returns `null` when the REQUEST has no
 *  SERVICE-ID param, or when the value cannot be parsed as a
 *  non-negative integer. */
function serviceIdOf(request: Record<string, unknown>): number | null {
  // The fast-xml-parser shape is:
  //   REQUEST > PARAMS > PARAM (array of records)
  // `PARAMS` is itself an object with a `PARAM` child. Descend
  // into the PARAM array before searching for SERVICE-ID.
  const paramsObj = request['PARAMS'];
  if (typeof paramsObj !== 'object' || paramsObj === null) return null;
  const params = asArray((paramsObj as Record<string, unknown>)['PARAM']);
  for (const p of params) {
    if (typeof p !== 'object' || p === null) continue;
    const pRec = p as Record<string, unknown>;
    const semantic = pRec['@_SEMANTIC'];
    if (semantic !== 'SERVICE-ID') continue;
    const coded = attrOf(pRec, 'CODED-VALUE');
    if (coded.length === 0) return null;
    const n = Number.parseInt(coded, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Strip a `0x` or `0X` prefix from a hex string. Defensive against
 *  an ODX file that emits the code without a prefix — returns the
 *  input unchanged in that case.
 *
 *  T4 fix: no longer called from `extractDtcs` (we map `displayCode`
 *  to `DISPLAY-TROUBLE-CODE` directly). Kept for any future caller
 *  that wants a hex-stripped wire value; exported to satisfy
 *  tooling that detects unused-exports. */
export function stripHexPrefix(s: string): string {
  if (s.length >= 2 && s[0] === '0' && (s[1] === 'x' || s[1] === 'X')) {
    return s.slice(2);
  }
  return s;
}
