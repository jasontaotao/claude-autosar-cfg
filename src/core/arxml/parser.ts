// core/arxml/parser.ts
// AUTOSAR ARXML r4.6 (ECUC subset) parser. Zero react/electron/fs deps.
// Input: XML string. Output: Result<ArxmlDocument, ParseError>.
//
// Recognized ECUC tag patterns:
//   <AUTOSAR><AR-PACKAGES><AR-PACKAGE><SHORT-NAME> + <ELEMENTS>...</ELEMENTS></AR-PACKAGE>...
//   <ECUC-MODULE-CONFIGURATION-VALUES>: kind='module'
//   <ECUC-CONTAINER-VALUE>: kind='container'
//   <DEFINITION-REF DEST="X">: kind='reference' with dest
//   <ECUC-NUMERICAL-PARAM-VALUE> / <ECUC-TEXTUAL-PARAM-VALUE>: param wrapper with VALUE child
//   <REFERENCE-VALUES><ECUC-REFERENCE-VALUE><VALUE-REF>: ref param (Com/PduR shape)
//   <PARAMETER-VALUES><ECUC-REFERENCE-VALUE>: vendor dialect (EcuC shape)

import { XMLParser, XMLValidator } from 'fast-xml-parser';

import type {
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ArxmlContainer,
  ArxmlPackage,
  ArxmlReference,
  ArxmlVersion,
  ParamValue,
  Result,
} from './types.js';
import { SUPPORTED_ARXML_VERSIONS } from './types.js';

// -----------------------------------------------------------------------------
// Public surface
// -----------------------------------------------------------------------------

export interface ParseOptions {
  readonly version?: ArxmlVersion;
  readonly strict?: boolean;
}

export type ParseError =
  | { readonly kind: 'xml-malformed'; readonly message: string }
  | { readonly kind: 'missing-root'; readonly message: string }
  | { readonly kind: 'unsupported-version'; readonly version: string }
  | { readonly kind: 'invalid-structure'; readonly path: string; readonly message: string };

const NS_PATTERN = /\/schema\/(r\d+\.\d+|\d{5,6})/;
const XSD_PATTERN = /AUTOSAR_(\d)-(\d)-(\d)\.xsd/;

export function parseArxml(
  xml: string,
  opts: ParseOptions = {},
): Result<ArxmlDocument, ParseError> {
  // Explicit XML well-formedness check — fast-xml-parser's parser is lenient and
  // would otherwise turn unclosed tags into a partially-populated object,
  // producing 'unsupported-version' instead of 'xml-malformed' for invalid input.
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    const message =
      typeof validation === 'object' && validation !== null && 'err' in validation
        ? (validation as { err: { msg: string; line?: number; col?: number } }).err.msg
        : 'XML is not well-formed';
    return {
      ok: false,
      error: {
        kind: 'xml-malformed',
        message,
      },
    };
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    removeNSPrefix: false,
    processEntities: true,
    trimValues: false,
  });

  let raw: unknown;
  try {
    raw = parser.parse(xml);
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: 'xml-malformed',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  if (typeof raw !== 'object' || raw === null) {
    return {
      ok: false,
      error: { kind: 'missing-root', message: 'parsed result is not an object' },
    };
  }

  const root = raw as Record<string, unknown>;
  const autosar = root['AUTOSAR'];
  if (typeof autosar !== 'object' || autosar === null) {
    return { ok: false, error: { kind: 'missing-root', message: '<AUTOSAR> root not found' } };
  }

  const version = opts.version ?? detectVersion(autosar as Record<string, unknown>);
  if (version === null) {
    return { ok: false, error: { kind: 'unsupported-version', version: 'unknown' } };
  }

  const arPackages = (autosar as Record<string, unknown>)['AR-PACKAGES'];
  if (typeof arPackages !== 'object' || arPackages === null) {
    return { ok: false, error: { kind: 'missing-root', message: '<AR-PACKAGES> not found' } };
  }

  const packages = walkPackages(arPackages as Record<string, unknown>, '');
  if (!Array.isArray(packages)) {
    return {
      ok: false,
      error: { kind: 'invalid-structure', path: '/', message: 'packages not array' },
    };
  }

  return {
    ok: true,
    value: {
      path: '',
      version,
      packages,
    },
  };
}

// -----------------------------------------------------------------------------
// Internal helpers (private)
// -----------------------------------------------------------------------------

function detectVersion(autosar: Record<string, unknown>): ArxmlVersion | null {
  const xmlns = typeof autosar['@_xmlns'] === 'string' ? (autosar['@_xmlns'] as string) : '';
  const xsi = autosar['@_xsi:schemaLocation'];
  const loc = typeof xsi === 'string' ? xsi : xmlns;
  const m = NS_PATTERN.exec(loc);
  let candidate: ArxmlVersion | null = null;
  if (m) {
    const raw = m[1];
    if (raw !== undefined) {
      // Map schema r4.6 → "4.6"; 00005/00006 → those literals
      if (raw.startsWith('r')) candidate = raw.slice(1) as ArxmlVersion;
      else if (raw === '00005' || raw === '00006') candidate = raw;
    }
  }
  // AUTOSAR 4.0/4.1 namespace only distinguishes at schemaLocation (e.g.
  // `AUTOSAR_4-2-2.xsd`). If the namespace hint is r4.0 and SUPPORTED list
  // does not include '4.0', fall back to the schemaLocation's MAJOR.MINOR.
  if (candidate === null || !SUPPORTED_ARXML_VERSIONS.includes(candidate)) {
    if (typeof xsi === 'string') {
      const xm = XSD_PATTERN.exec(xsi);
      if (xm && xm[1] !== undefined && xm[2] !== undefined) {
        candidate = `${xm[1]}.${xm[2]}` as ArxmlVersion;
      }
    }
  }
  if (candidate === null) return null;
  return SUPPORTED_ARXML_VERSIONS.includes(candidate) ? candidate : null;
}

function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v === undefined || v === null) return [];
  return [v as T];
}

function readShortName(elem: Record<string, unknown>): string | undefined {
  const sn = elem['SHORT-NAME'];
  if (typeof sn === 'string') return sn;
  if (typeof sn === 'object' && sn !== null) {
    const t = (sn as Record<string, unknown>)['#text'];
    if (typeof t === 'string') return t;
  }
  return undefined;
}

function readLongName(elem: Record<string, unknown>): string | undefined {
  const ln = elem['LONG-NAME'];
  if (typeof ln === 'string') return ln;
  if (typeof ln === 'object' && ln !== null) {
    const l4 = (ln as Record<string, unknown>)['L-4'];
    if (typeof l4 === 'string') return l4;
  }
  return undefined;
}

function walkPackages(node: Record<string, unknown>, parentPath: string): ArxmlPackage[] {
  const arr = asArray<Record<string, unknown>>(node['AR-PACKAGE']);
  return arr.map((pkg, idx) => {
    const shortName = readShortName(pkg) ?? `<unnamed-${idx}>`;
    const path = `${parentPath}/${shortName}`;
    const elementsRaw = pkg['ELEMENTS'];
    const elements = walkElements(
      typeof elementsRaw === 'object' && elementsRaw !== null
        ? (elementsRaw as Record<string, unknown>)
        : {},
      path,
    );
    return {
      shortName,
      ...(readLongName(pkg) !== undefined ? { longName: readLongName(pkg) as string } : {}),
      path,
      elements,
    };
  });
}

function walkElements(node: Record<string, unknown>, parentPath: string): ArxmlElement[] {
  const out: ArxmlElement[] = [];
  for (const [tagName, raw] of Object.entries(node)) {
    if (tagName.startsWith('@_') || tagName === '#text') continue;
    for (const item of asArray<Record<string, unknown>>(raw)) {
      const elem = classifyElement(tagName, item, parentPath);
      if (elem) out.push(elem);
    }
  }
  return out;
}

function classifyElement(
  tagName: string,
  item: Record<string, unknown>,
  parentPath: string,
): ArxmlElement | null {
  if (tagName === 'ECUC-MODULE-CONFIGURATION-VALUES') {
    return buildModule(tagName, item, parentPath);
  }
  if (tagName === 'ECUC-CONTAINER-VALUE') {
    return buildContainer(tagName, item, parentPath);
  }
  // Generic containers (any other ECUC-* tag) treated as container if has SHORT-NAME
  if (tagName.startsWith('ECUC-')) {
    if (readShortName(item) !== undefined) {
      return buildContainer(tagName, item, parentPath);
    }
    return null;
  }
  // Skip TEXTUAL-DEF-CONDITION etc. (not needed for F1)
  if (tagName === 'DEFINITION-REF' || tagName === 'REFERENCE' || tagName === 'VALUE-REF') {
    return buildReference(tagName, item);
  }
  return null;
}

function buildModule(
  tagName: string,
  item: Record<string, unknown>,
  parentPath: string,
): ArxmlModule | null {
  const shortName = readShortName(item);
  if (shortName === undefined) return null;
  const path = `${parentPath}/${shortName}`;
  const { params, references } = extractParamsAndRefs(item);
  const containers = item['CONTAINERS'];
  const subContainers = item['SUB-CONTAINERS'];
  const children: ArxmlElement[] = [];
  if (typeof containers === 'object' && containers !== null) {
    for (const c of walkElements(containers as Record<string, unknown>, path)) children.push(c);
  }
  if (typeof subContainers === 'object' && subContainers !== null) {
    for (const c of walkElements(subContainers as Record<string, unknown>, path)) children.push(c);
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

function buildContainer(
  tagName: string,
  item: Record<string, unknown>,
  parentPath: string,
): ArxmlContainer | null {
  const shortName = readShortName(item);
  if (shortName === undefined) return null;
  const path = `${parentPath}/${shortName}`;
  const { params } = extractParamsAndRefs(item);
  const subContainers = item['SUB-CONTAINERS'];
  const children: ArxmlElement[] = [];
  if (typeof subContainers === 'object' && subContainers !== null) {
    for (const c of walkElements(subContainers as Record<string, unknown>, path)) children.push(c);
  }
  return {
    kind: 'container',
    tagName,
    shortName,
    params,
    children,
  };
}

function buildReference(tagName: string, item: Record<string, unknown>): ArxmlReference | null {
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

function extractParamsAndRefs(item: Record<string, unknown>): {
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
          extractReferenceParams(w, defPath, params);
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
        // Key = last path segment after '/'
        const key = defPath.split('/').pop() ?? defPath;
        params[key] = param;
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
        extractReferenceParams(w, defPath, params);
      }
    }
  }
  // Top-level DEFINITION-REFs (module/level)
  for (const ref of asArray<Record<string, unknown>>(item['DEFINITION-REF'])) {
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
function extractReferenceParams(
  wrapper: Record<string, unknown>,
  defPath: string,
  params: Record<string, ParamValue>,
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
  const param: ParamValue =
    refDest !== undefined
      ? { type: 'reference', value: refPath, dest: refDest }
      : { type: 'reference', value: refPath };
  params[key] = param;
}

function parseParamValue(
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
    return Number.isFinite(n) && Number.isInteger(n)
      ? { type: 'integer', value: n }
      : { type: 'integer', value: Number(String(raw)) };
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
