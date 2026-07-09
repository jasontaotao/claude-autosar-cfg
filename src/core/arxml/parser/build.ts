// core/arxml/parser/build.ts
// Element-builder + param-extract helpers. Split from
// `src/core/arxml/parser.ts` as part of v1.41.x PATCH T4 (file-size
// backlog).
//
// Internal helpers: buildModule, buildContainer, buildReference,
// extractParamsAndRefs, extractReferenceParams, parseParamValue,
// CollisionCollector (private type).

import type {
  ArxmlContainer,
  ArxmlElement,
  ArxmlModule,
  ArxmlReference,
  ParamValue,
} from '../types.js';
import { asArray, readShortName, walkElements, CollisionCollector } from './walk.js';

export function buildModule(
  tagName: string,
  item: Record<string, unknown>,
  parentPath: string,
  collector: CollisionCollector,
): ArxmlModule | null {
  const shortName = readShortName(item);
  if (shortName === undefined) return null;
  const path = `${parentPath}/${shortName}`;
  const { params, references } = extractParamsAndRefs(item, path, collector);
  const containers = item['CONTAINERS'];
  const subContainers = item['SUB-CONTAINERS'];
  const children: ArxmlElement[] = [];
  if (typeof containers === 'object' && containers !== null) {
    for (const c of walkElements(containers as Record<string, unknown>, path, collector)) {
      children.push(c);
    }
  }
  if (typeof subContainers === 'object' && subContainers !== null) {
    for (const c of walkElements(subContainers as Record<string, unknown>, path, collector)) {
      children.push(c);
    }
  }
  return {
    kind: 'module',
    tagName,
    shortName,
    params,
    children,
    references,
  };
}

export function buildContainer(
  tagName: string,
  item: Record<string, unknown>,
  parentPath: string,
  collector: CollisionCollector,
): ArxmlContainer | null {
  const shortName = readShortName(item);
  if (shortName === undefined) return null;
  const path = `${parentPath}/${shortName}`;
  const { params } = extractParamsAndRefs(item, path, collector);
  // v1.9.0 Sprint X (HIGH #2) — read container-level <DEFINITION-REF>
  // so skeleton-emitted arxml survives save→reload→save. Mirrors the
  // module-level pattern in `extractParamsAndRefs` (parser.ts:500):
  //   - text-only `DEFINITION-REF` → string
  //   - attribute-bearing `DEFINITION-REF DEST="..."` → { @_DEST, #text }
  //   - multiple DEFINITION-REFs (rare but valid in some dialects) → first
  //     non-empty wins, matching the single-DEST serializer output.
  //   - DEST = ECUC-CHOICE-CONTAINER-DEF stamps `isChoiceContainer` so
  //     the UI choice marker (added in v1.7.1 S1) survives a
  //     save→reload→save round-trip. Without this, a saved choice shell
  //     would re-load as a plain container and lose its picker UI.
  const defRefRaw = item['DEFINITION-REF'];
  let definitionRef: string | undefined;
  let isChoiceContainer: boolean | undefined;
  if (defRefRaw !== undefined) {
    const first = (Array.isArray(defRefRaw) ? defRefRaw[0] : defRefRaw) as
      | string
      | Record<string, unknown>
      | undefined;
    if (typeof first === 'string') {
      definitionRef = first;
    } else if (typeof first === 'object' && first !== null) {
      const obj = first as Record<string, unknown>;
      const text = obj['#text'];
      if (typeof text === 'string') definitionRef = text;
      const dest = obj['@_DEST'];
      if (dest === 'ECUC-CHOICE-CONTAINER-DEF') isChoiceContainer = true;
    }
  }
  const subContainers = item['SUB-CONTAINERS'];
  const containers = item['CONTAINERS'];
  const children: ArxmlElement[] = [];
  // v1.23.0 T2 fix (HIGH #2) — read BOTH `<CONTAINERS>` and
  // `<SUB-CONTAINERS>` so children wrapped in either form surface as
  // siblings. Mirrors `buildModule` at lines 361-369 which already
  // reads both. Real OEM demo-ecu ARXMLs wrap sub-container children
  // inside `<CONTAINERS>`; prior code only read `<SUB-CONTAINERS>`,
  // leaving those containers with zero children and silently masking
  // idempotency dedup in the DBC→Com-Stack bridge.
  if (typeof containers === 'object' && containers !== null) {
    for (const c of walkElements(containers as Record<string, unknown>, path, collector)) {
      children.push(c);
    }
  }
  if (typeof subContainers === 'object' && subContainers !== null) {
    for (const c of walkElements(subContainers as Record<string, unknown>, path, collector)) {
      children.push(c);
    }
  }
  return {
    kind: 'container',
    tagName,
    shortName,
    params,
    children,
    ...(definitionRef !== undefined ? { definitionRef } : {}),
    ...(isChoiceContainer === true ? { isChoiceContainer } : {}),
  };
}

export function buildReference(tagName: string, item: Record<string, unknown>): ArxmlReference | null {
  const dest = typeof item['@_DEST'] === 'string' ? (item['@_DEST'] as string) : undefined;
  // value is the text content (or child path/short-name)
  let value: string | undefined;
  const text = item['#text'];
  if (typeof text === 'string') value = text;
  // For REFERENCE, child <SHORT-NAME> may carry the target
  if (value === undefined) {
    const sn = item['SHORT-NAME'];
    if (typeof sn === 'string') value = sn;
  }
  if (value === undefined) return null;
  const ref: ArxmlReference = {
    kind: 'reference',
    tagName,
    value,
    ...(dest !== undefined ? { dest } : {}),
  };
  return ref;
}

export function extractParamsAndRefs(
  item: Record<string, unknown>,
  containerPath: string,
  collector: CollisionCollector,
): {
  readonly params: Readonly<Record<string, ParamValue>>;
  readonly references: readonly string[];
} {
  const params: Record<string, ParamValue> = {};
  const references: string[] = [];
  const pv = item['PARAMETER-VALUES'];
  if (typeof pv === 'object' && pv !== null) {
    for (const [wrapperTag, raw] of Object.entries(pv as Record<string, unknown>)) {
      if (!wrapperTag.startsWith('ECUC-')) continue;
      for (const w of asArray<Record<string, unknown>>(raw)) {
        const defRef = w['DEFINITION-REF'];
        // <DEFINITION-REF> may be parsed as a plain string (text-only) or as an
        // object containing { @_DEST, #text } when attributes are present.
        let defPath: string | undefined;
        let defDest: string | undefined;
        if (typeof defRef === 'string') {
          defPath = defRef;
        } else if (typeof defRef === 'object' && defRef !== null) {
          const obj = defRef as Record<string, unknown>;
          const text = obj['#text'];
          if (typeof text === 'string') defPath = text;
          const dest = obj['@_DEST'];
          if (typeof dest === 'string') defDest = dest;
        }
        if (defPath === undefined || typeof defPath !== 'string') continue;

        // ECUC-REFERENCE-VALUE inside PARAMETER-VALUES: EcuC vendor dialect.
        // Has <VALUE-REF> child (not <VALUE>) — delegate to extractReferenceParams.
        if (wrapperTag === 'ECUC-REFERENCE-VALUE') {
          extractReferenceParams(w, defPath, params, containerPath, collector);
          continue;
        }

        const valueRaw = w['VALUE'];
        if (
          typeof valueRaw !== 'string' &&
          typeof valueRaw !== 'number' &&
          typeof valueRaw !== 'boolean'
        ) {
          // VALUE missing or wrong type — skip but don't fail
          continue;
        }
        const param = parseParamValue(wrapperTag, valueRaw, defDest);
        // Sprint 16c #2 follow-up — preserve the DEFINITION-REF path on
        // the in-memory model so reload-then-save keeps the real BSWMD
        // path (without this, the second serialize would fall back to
        // /__synthesized__/<shortName>).
        const stamped: ParamValue = { ...param, definitionRef: defPath };
        // Key = last path segment after '/'
        const key = defPath.split('/').pop() ?? defPath;
        // v1.38.0 MINOR T2 (H1) — collision check. A collision is when
        // two entries land on the same shortName key with DIFFERENT
        // DEFINITION-REF paths (vendor dialects / choice branches where
        // distinct BSWMD params share a shortName tail). Pre-T2 this
        // silently overwrote; T2 records the first such collision in
        // the collector so the top-level parser surfaces it as
        // `invalid-structure`.
        //
        // Same defPath re-emitted is NOT a collision: it is the same
        // logical param (or, for REFERENCE-VALUES, the multi-valued
        // reference pattern — see extractReferenceParams). Pre-T2 the
        // last write won; T2 preserves that contract for valid input.
        if (Object.prototype.hasOwnProperty.call(params, key)) {
          const first = params[key]!;
          const firstDefPath = first.definitionRef;
          if (
            firstDefPath !== undefined &&
            firstDefPath !== defPath &&
            collector.collision === undefined
          ) {
            collector.collision = {
              shortName: key,
              firstDefPath,
              secondDefPath: defPath,
              containerPath,
            };
          }
        }
        params[key] = stamped;
      }
    }
  }
  // Standard <REFERENCE-VALUES> wrapper (Com/PduR/WdgIf shape) — sibling of PARAMETER-VALUES.
  const rv = item['REFERENCE-VALUES'];
  if (typeof rv === 'object' && rv !== null) {
    for (const [wrapperTag, raw] of Object.entries(rv as Record<string, unknown>)) {
      if (wrapperTag !== 'ECUC-REFERENCE-VALUE') continue;
      for (const w of asArray<Record<string, unknown>>(raw)) {
        const defRef = w['DEFINITION-REF'];
        let defPath: string | undefined;
        if (typeof defRef === 'string') {
          defPath = defRef;
        } else if (typeof defRef === 'object' && defRef !== null) {
          const obj = defRef as Record<string, unknown>;
          const text = obj['#text'];
          if (typeof text === 'string') defPath = text;
        }
        if (defPath === undefined) continue;
        extractReferenceParams(w, defPath, params, containerPath, collector);
      }
    }
  }
  // Top-level DEFINITION-REFs (module/level). May be parsed as a plain string
  // (text-only element) or as an object carrying { @_DEST, #text } when the
  // element has attributes — mirror the wrapper branch at lines 480-489 so
  // string-form top-level refs land in `references` instead of being dropped
  // (v1.38.0 MINOR T5 M2).
  for (const ref of asArray<Record<string, unknown>>(item['DEFINITION-REF'])) {
    if (typeof ref === 'string') {
      references.push(ref);
      continue;
    }
    const dest = typeof ref['@_DEST'] === 'string' ? (ref['@_DEST'] as string) : undefined;
    const text = ref['#text'];
    if (typeof text === 'string') references.push(dest ? `${dest}:${text}` : text);
  }
  return { params, references };
}

/**
 * Parse a single ECUC-REFERENCE-VALUE element. Reads its <VALUE-REF> child
 * (path + DEST), skips unset placeholders (empty / trailing-slash), and
 * writes `{ type: 'reference', value, dest }` into `params` keyed by
 * `defPath`'s last segment.
 *
 * `dest` is optional because some vendors omit it on the VALUE-REF;
 * we surface whatever we have (undefined is preserved on the param shape).
 */
export function extractReferenceParams(
  wrapper: Record<string, unknown>,
  defPath: string,
  params: Record<string, ParamValue>,
  containerPath: string,
  collector: CollisionCollector,
): void {
  const valueRef = wrapper['VALUE-REF'];
  let refPath: string | undefined;
  let refDest: string | undefined;
  if (typeof valueRef === 'string') {
    refPath = valueRef;
  } else if (typeof valueRef === 'object' && valueRef !== null) {
    const obj = valueRef as Record<string, unknown>;
    const text = obj['#text'];
    if (typeof text === 'string') refPath = text;
    const dest = obj['@_DEST'];
    if (typeof dest === 'string') refDest = dest;
  }
  // Placeholder skip — unset / trailing-slash paths would generate false
  // positive cross-ref errors downstream (and are not user-meaningful data).
  if (refPath === undefined) return;
  if (refPath === '' || refPath.endsWith('/')) return;
  const key = defPath.split('/').pop() ?? defPath;
  // Sprint 16c #2 follow-up — same as the PARAMETER-VALUES path: stamp
  // the DEFINITION-REF path so reload-then-save preserves the real
  // BSWMD path on the in-memory reference ParamValue.
  const param: ParamValue =
    refDest !== undefined
      ? { type: 'reference', value: refPath, dest: refDest, definitionRef: defPath }
      : { type: 'reference', value: refPath, definitionRef: defPath };
  // v1.38.0 MINOR T2 (H1) — collision check (mirrors
  // extractParamsAndRefs). For REFERENCE-VALUES the multi-valued
  // reference pattern is legitimate: a single <DEFINITION-REF> path
  // (e.g. /EAS/Com/ComConfig/ComIPdu/ComIPduSignalRef) re-appears per
  // VALUE-REF, each entry pointing to a different signal target. The
  // existing single-record-per-shortName data shape cannot hold the
  // list, so pre-T2 the last value won silently. T2 preserves that
  // pre-existing behavior for the same-defPath case and only flags a
  // collision when the defPath is genuinely different.
  if (Object.prototype.hasOwnProperty.call(params, key)) {
    const first = params[key]!;
    const firstDefPath = first.definitionRef;
    if (
      firstDefPath !== undefined &&
      firstDefPath !== defPath &&
      collector.collision === undefined
    ) {
      collector.collision = {
        shortName: key,
        firstDefPath,
        secondDefPath: defPath,
        containerPath,
      };
    }
    // Same defPath (multi-valued reference) — keep the latest VALUE-REF
    // to preserve pre-T2 last-write-wins semantics. Pre-existing data
    // loss; T2 deliberately does NOT fix the data shape (would require
    // schema migration to a list-of-values record). Tracked as a
    // follow-up rather than blocking on a v1.38.0 MINOR.
    params[key] = param;
    return;
  }
  params[key] = param;
}

export function parseParamValue(
  wrapperTag: string,
  raw: string | number | boolean,
  dest?: string,
): ParamValue {
  // 1. DEST attribute is the authoritative type signal when present.
  //    EB tresos / Vector tools sometimes wrap BOOLEAN/STRING in NUMERICAL/TEXTUAL
  //    wrappers — only the DEST tells us the real schema type.
  if (dest === 'ECUC-BOOLEAN-PARAM-DEF') {
    if (typeof raw === 'boolean') return { type: 'boolean', value: raw };
    const s = String(raw).trim().toLowerCase();
    return { type: 'boolean', value: s === 'true' || s === '1' };
  }
  if (dest === 'ECUC-STRING-PARAM-DEF' || dest === 'ECUC-FUNCTION-NAME-DEF') {
    return { type: 'string', value: String(raw) };
  }
  if (dest === 'ECUC-ENUMERATION-PARAM-DEF') {
    return { type: 'enum', value: String(raw) };
  }
  if (dest === 'ECUC-INTEGER-PARAM-DEF') {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(n) && Number.isInteger(n)) {
      return { type: 'integer', value: n };
    }
    // v1.38.0 MINOR T3 (H2) — vendor misconfig: an INTEGER-PARAM-DEF field
    // can hold a finite float value (vendor BSWMD declared the param as
    // INTEGER but the EcucValues writer put a float). Pre-T3 the integer
    // branch silently coerced the float back to NaN via Number(String(raw))
    // and stuffed it into a `{ type: 'integer', value: NaN|float }`
    // ParamValue, violating the AUTOSAR schema on serialize. T3 falls
    // back to `{ type: 'float', value: n }` so the in-memory model
    // self-types the value, the serializer's float code path renders
    // <VALUE>n</VALUE> correctly, and we surface the schema-deficiency
    // up-stack rather than muting it. NaN / Infinity stay on the
    // number-coerce path below (defensive: raw=undefined / raw='' both
    // yield NaN, which is also non-integer, so the float fallback never
    // silently captures them — but coerce-the-string keeps the existing
    // pre-T3 contract for those edge cases).
    if (Number.isFinite(n)) {
      return { type: 'float', value: n };
    }
    return { type: 'integer', value: Number(String(raw)) };
  }
  if (dest === 'ECUC-FLOAT-PARAM-DEF') {
    const n = typeof raw === 'number' ? raw : Number(raw);
    return { type: 'float', value: n };
  }
  // ECUC-REFERENCE-DEF / ECUC-FOREIGN-REFERENCE-DEF: the wrapper itself
  // signals a reference; raw is the path string. Belt-and-suspenders for
  // any case where the caller routes through parseParamValue with a ref dest
  // (extractParamsAndRefs usually short-circuits via extractReferenceParams).
  if (dest === 'ECUC-REFERENCE-DEF' || dest === 'ECUC-FOREIGN-REFERENCE-DEF') {
    const path = String(raw);
    return path === '' || path.endsWith('/')
      ? { type: 'reference', value: path }
      : { type: 'reference', value: path, dest };
  }

  // 2. Fallback when DEST is missing — use wrapper tag + VALUE shape
  //    (back-compat for fixtures / vendors that omit DEST).
  if (wrapperTag.includes('NUMERICAL')) {
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isInteger(n) ? { type: 'integer', value: n } : { type: 'float', value: n };
  }
  if (wrapperTag.includes('TEXTUAL')) {
    // No DEST → conservative fallback to enum (TEXTUAL covers both
    // enum and string historically).
    return { type: 'enum', value: String(raw) };
  }
  if (wrapperTag.includes('BOOLEAN')) {
    return { type: 'boolean', value: raw === true || raw === 'true' };
  }
  // ECUC-REFERENCE-VALUE wrapper without a recognised DEST: treat the raw
  // value as a reference path string so cross-ref validation can flag it.
  if (wrapperTag === 'ECUC-REFERENCE-VALUE') {
    return { type: 'reference', value: String(raw) };
  }
  return { type: 'string', value: String(raw) };
}
