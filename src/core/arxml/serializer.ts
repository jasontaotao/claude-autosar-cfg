// core/arxml/serializer.ts
// Reverse of parser.ts. Pure function: ArxmlDocument -> Result<string, SerializeError>.

import { XMLBuilder } from 'fast-xml-parser';

import { parseArxml } from './parser.js';
import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ArxmlPackage,
  ArxmlReference,
  ArxmlUnknown,
  ArxmlVersion,
  ParamValue,
  Result,
} from './types.js';

// -----------------------------------------------------------------------------
// Public surface
// -----------------------------------------------------------------------------

export interface SerializeOptions {
  readonly indent?: number;
  readonly xmlDeclaration?: boolean;
  readonly version?: ArxmlVersion;
  /**
   * v1.5.1 PR(2) — when provided, the serializer reorders packages,
   * elements, and child containers to match the SHORT-NAME order found
   * in the source XML. Newly-added items (absent from source) follow the
   * existing items in their original order. Tolerance rules (Q5 B):
   * namespace prefix order, whitespace, comments, and attribute order
   * are NOT preserved — only AR-PACKAGE / ELEMENT / MODULE container
   * order. When omitted, behavior is identical to v1.5.0.
   */
  readonly sourceArxml?: string;
}

export type SerializeError = {
  readonly kind: 'invalid-document';
  readonly path: string;
  readonly message: string;
};

const PARAM_TAG: Record<ParamValue['type'], string> = {
  integer: 'ECUC-NUMERICAL-PARAM-VALUE',
  float: 'ECUC-NUMERICAL-PARAM-VALUE',
  boolean: 'ECUC-NUMERICAL-PARAM-VALUE',
  string: 'ECUC-TEXTUAL-PARAM-VALUE',
  enum: 'ECUC-TEXTUAL-PARAM-VALUE',
  reference: 'ECUC-REFERENCE-VALUE',
};

export function serializeArxml(
  doc: ArxmlDocument,
  opts: SerializeOptions = {},
): Result<string, SerializeError> {
  // v1.5.1 PR(2) — when `sourceArxml` is supplied, reorder containers to
  // match the source XML's emission order. Parse source once to derive
  // the canonical SHORT-NAME sequence at each nesting level.
  const effectiveDoc =
    opts.sourceArxml !== undefined ? reorderBySource(doc, opts.sourceArxml) : doc;

  const indent = opts.indent ?? 2;
  const xmlDecl = opts.xmlDeclaration ?? true;
  const version = opts.version ?? doc.version;

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    indentBy: ' '.repeat(indent),
    suppressEmptyNode: true,
    processEntities: true,
  });

  const root = {
    '?xml': xmlDecl ? { '@_version': '1.0', '@_encoding': 'UTF-8' } : undefined,
    AUTOSAR: {
      '@_xmlns': buildXmlns(version),
      '@_xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
      '@_xsi:schemaLocation': buildSchemaLocation(version),
      'AR-PACKAGES':
        effectiveDoc.packages.length > 0
          ? // fast-xml-parser requires an explicit wrapper key for array-of-object
            // values; otherwise it serializes inner keys as direct children of
            // <AR-PACKAGES> instead of wrapping each in <AR-PACKAGE>.
            { 'AR-PACKAGE': effectiveDoc.packages.map(renderPackage) }
          : // Empty packages → emit <AR-PACKAGES></AR-PACKAGES> instead of letting
            // fast-xml-parser suppress the node entirely (suppressEmptyNode would
            // otherwise drop it). The #text empty marker yields a paired open/close.
            { '#text': '' },
    },
  };

  let xml: string;
  try {
    xml = builder.build(root) as string;
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: 'invalid-document',
        path: '/',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
  return { ok: true, value: xml };
}

// -----------------------------------------------------------------------------
// Internal helpers (private)
// -----------------------------------------------------------------------------

/**
 * Canonical schemaLocation descriptor for each supported AUTOSAR version.
 * The 5-digit form (`00046`, `00048`, `00049`, `00050`) is the AUTOSAR
 * standard from R4.6 onward; vendor tools (EB tresos) emit it alongside
 * the legacy `r4.0` namespace. The dashed form (`AUTOSAR_4-2-2.xsd`) is
 * the pre-R4.6 convention used by 4.2 / 4.4 / 4.6 / 4.7 / 5.0.
 *
 * Note: '00005' / '00006' are reserved for future AUTOSAR R5.0+ / R6.0+
 * releases. No vendor fixture yet validates the xsd naming for these
 * literals; round-trip is sound but no real-world emission matches.
 *
 * Pairing:
 *   ArxmlVersion → { xmlns, xsd }
 *
 * The xmlns follows the file's declared namespace; for 5-digit literals
 * we mirror EB tresos's `r4.0` namespace convention.
 */
const SCHEMA_LOCATION: Record<ArxmlVersion, { readonly xmlns: string; readonly xsd: string }> = {
  '4.0': { xmlns: 'http://autosar.org/schema/r4.0', xsd: 'AUTOSAR_4-0-3.xsd' },
  '4.2': { xmlns: 'http://autosar.org/schema/r4.2', xsd: 'AUTOSAR_4-2-2.xsd' },
  '4.4': { xmlns: 'http://autosar.org/schema/r4.4', xsd: 'AUTOSAR_4-4-0.xsd' },
  '4.6': { xmlns: 'http://autosar.org/schema/r4.6', xsd: 'AUTOSAR_4-6-0.xsd' },
  '4.7': { xmlns: 'http://autosar.org/schema/r4.7', xsd: 'AUTOSAR_4-7-0.xsd' },
  '5.0': { xmlns: 'http://autosar.org/schema/r5.0', xsd: 'AUTOSAR_5-0-0.xsd' },
  '00005': { xmlns: 'http://autosar.org/schema/r5.0', xsd: 'AUTOSAR_00005.xsd' },
  '00006': { xmlns: 'http://autosar.org/schema/r6.0', xsd: 'AUTOSAR_00006.xsd' },
  '00046': { xmlns: 'http://autosar.org/schema/r4.0', xsd: 'AUTOSAR_00046.xsd' },
  '00048': { xmlns: 'http://autosar.org/schema/r4.0', xsd: 'AUTOSAR_00048.xsd' },
  '00049': { xmlns: 'http://autosar.org/schema/r4.0', xsd: 'AUTOSAR_00049.xsd' },
  '00050': { xmlns: 'http://autosar.org/schema/r4.0', xsd: 'AUTOSAR_00050.xsd' },
  '00051': { xmlns: 'http://autosar.org/schema/r4.0', xsd: 'AUTOSAR_00051.xsd' },
};

function buildXmlns(v: ArxmlVersion): string {
  return SCHEMA_LOCATION[v].xmlns;
}

function buildSchemaLocation(v: ArxmlVersion): string {
  const loc = SCHEMA_LOCATION[v];
  return `${loc.xmlns} ${loc.xsd}`;
}

function renderPackage(pkg: ArxmlPackage): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  out['SHORT-NAME'] = pkg.shortName;
  if (pkg.longName !== undefined) {
    out['LONG-NAME'] = { 'L-4': pkg.longName };
  }
  if (pkg.elements.length > 0) {
    // Group mixed-kind children by tagName so fast-xml-parser wraps each group.
    out['ELEMENTS'] = groupByTagName(pkg.elements.map(renderElement));
  }
  // Sprint 9 #12: mirror nested <AR-PACKAGES> when the source document had a
  // recursive package hierarchy. Only emitted when nested packages exist so
  // the flat 5-fixture round-trip signature stays field-equal.
  if (pkg.packages !== undefined && pkg.packages.length > 0) {
    out['AR-PACKAGES'] = { 'AR-PACKAGE': pkg.packages.map(renderPackage) };
  }
  return out;
}

function renderElement(elem: ArxmlElement): Record<string, unknown> {
  if (elem.kind === 'module') return { [elem.tagName]: renderModule(elem) };
  if (elem.kind === 'container') return { [elem.tagName]: renderContainer(elem) };
  if (elem.kind === 'unknown') return renderUnknown(elem);
  return renderReference(elem);
}

/**
 * v1.4.0 trust sprint — 17c. Re-emit a captured fast-xml-parser node for
 * any element the parser did not classify. `XMLBuilder` accepts the same
 * shape the parser produces (attributes under `@_`, text under `#text`,
 * child elements as object keys), so no string re-parsing is needed.
 *
 * We widen the readonly `parsed` to a mutable record here because
 * `XMLBuilder.build` mutates object references in place when serialising
 * attribute keys (rare; the v1.4.0 fixtures have no attributes on the
 * unknown elements, but the contract should hold either way).
 */
function renderUnknown(elem: ArxmlUnknown): Record<string, unknown> {
  return { [elem.tagName]: { ...elem.parsed } };
}

function renderModule(m: ArxmlModule): Record<string, unknown> {
  const out: Record<string, unknown> = {
    'SHORT-NAME': m.shortName,
  };
  if (m.references.length > 0) {
    // v1.4.0 trust sprint — 17c. Emit every module-level DEFINITION-REF as
    // a top-level sibling. The pre-fix code only emitted `m.references[0]`,
    // silently dropping every additional DEFINITION-REF the parser had
    // captured. The parser reads top-level DEFINITION-REF via `asArray`
    // (parser.ts:500) so all siblings round-trip into `m.references` on
    // re-parse.
    const defRefs = m.references.map((ref) => {
      const [dest, ...rest] = ref.split(':');
      const value = rest.join(':') || ref;
      const defRef: Record<string, unknown> = { '#text': value };
      if (dest !== undefined) defRef['@_DEST'] = dest;
      return defRef;
    });
    out['DEFINITION-REF'] = defRefs.length === 1 ? defRefs[0] : defRefs;
  }
  const { regular: regularArr, refs: refsArr } = renderParamEntries(m.params);
  const containersArr = m.children.filter((c): c is ArxmlContainer => c.kind === 'container');
  if (containersArr.length > 0) {
    out['CONTAINERS'] = { 'ECUC-CONTAINER-VALUE': containersArr.map(renderContainer) };
  }
  if (regularArr.length > 0) {
    // Group by wrapper tag so fast-xml-parser emits one <PARAMETER-VALUES>
    // containing multiple same-tag siblings (parser expects this shape).
    out['PARAMETER-VALUES'] = groupByTagName(regularArr);
  }
  if (refsArr.length > 0) {
    // Standard AUTOSAR <REFERENCE-VALUES> wrapper — sibling of <PARAMETER-VALUES>.
    // The EcuC vendor dialect (ECUC-REFERENCE-VALUE inside PARAMETER-VALUES) is
    // intentionally normalised to the standard shape here; round-trip
    // parse→serialize→re-parse preserves the field-level contract (params dict
    // is unchanged) even though the XML serialisation shifts shape.
    out['REFERENCE-VALUES'] = groupByTagName(refsArr);
  }
  return out;
}

function renderContainer(c: ArxmlContainer): Record<string, unknown> {
  const out: Record<string, unknown> = {
    'SHORT-NAME': c.shortName,
  };
  // v1.9.0 Sprint X — emit <DEFINITION-REF> child pointing at the
  // BSWMD-side container definition path. Mirrors renderModule's
  // pattern (serializer.ts:211-218) for module-level references.
  // c.definitionRef is stamped by skeleton (`buildTopContainer` /
  // `buildSubContainerShell` / `buildChoiceShell`) and by mutation
  // (`addContainer`); when undefined (legacy in-memory docs that
  // pre-date the v1.9.0 stamping), the tag is omitted — the
  // parser is lenient about its absence so round-trip stays
  // field-equal for pre-fix fixtures.
  //
  // `DEST` distinguishes plain sub-containers from choice shells
  // so downstream tools can resolve the reference back to the
  // correct BSWMD element type.
  if (c.definitionRef !== undefined) {
    out['DEFINITION-REF'] = {
      '@_DEST': c.isChoiceContainer === true
        ? 'ECUC-CHOICE-CONTAINER-DEF'
        : 'ECUC-PARAM-CONF-CONTAINER-DEF',
      '#text': c.definitionRef,
    };
  }
  const { regular: regularArr, refs: refsArr } = renderParamEntries(c.params);
  if (regularArr.length > 0) {
    out['PARAMETER-VALUES'] = groupByTagName(regularArr);
  }
  if (refsArr.length > 0) {
    out['REFERENCE-VALUES'] = groupByTagName(refsArr);
  }
  if (c.children.length > 0) {
    out['SUB-CONTAINERS'] = groupByTagName(c.children.map(renderElement));
  }
  return out;
}

function renderReference(r: ArxmlReference): Record<string, unknown> {
  const out: Record<string, unknown> = { '#text': r.value };
  if (r.dest !== undefined) out['@_DEST'] = r.dest;
  return { [r.tagName]: out };
}

/**
 * Group array items by their single top-level key (the element tagName) so that
 * fast-xml-parser can serialize each group as repeated siblings of that tag.
 * Without this grouping, a mixed-kind list like
 *   [ { 'ECUC-MODULE-CONFIGURATION-VALUES': {...} }, { 'ECUC-CONTAINER-VALUE': {...} } ]
 * would lose the wrapper tags.
 */
function groupByTagName(items: Record<string, unknown>[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const item of items) {
    const keys = Object.keys(item);
    if (keys.length !== 1) continue;
    const tag = keys[0]!;
    if (!out[tag]) out[tag] = [];
    (out[tag] as Record<string, unknown>[]).push(item[tag] as Record<string, unknown>);
  }
  return out;
}

/**
 * Split a params record into two emission streams:
 * - `regular`: non-reference params (integer/float/boolean/string/enum), which
 *   share the standard <PARAMETER-VALUES> wrapper.
 * - `refs`: reference params, which go under the standard <REFERENCE-VALUES>
 *   wrapper using the <VALUE-REF DEST="..."> shape that parser.extractReferenceParams
 *   expects on re-parse.
 *
 * Keeping these streams separate avoids re-emitting reference params under
 * <PARAMETER-VALUES><ECUC-REFERENCE-VALUE> (the EcuC vendor dialect), which
 * would parse back but cross-mingle two emission shapes — and would also fail
 * the strict serializer/parser contract where the reference shape carries
 * <VALUE-REF> rather than <VALUE>.
 */
function renderParamEntries(params: Readonly<Record<string, ParamValue>>): {
  readonly regular: Record<string, unknown>[];
  readonly refs: Record<string, unknown>[];
} {
  const regular: Record<string, unknown>[] = [];
  const refs: Record<string, unknown>[] = [];
  for (const [defName, value] of Object.entries(params)) {
    if (value.type === 'reference') {
      refs.push(renderReferenceParam(defName, value));
      continue;
    }
    regular.push(renderRegularParam(defName, value));
  }
  return { regular, refs };
}

function renderRegularParam(defName: string, value: ParamValue): Record<string, unknown> {
  // renderParamEntries has already filtered out references, but TS narrowing
  // needs the explicit case-split. `wrapperTag` follows PARAM_TAG for integer/
  // float/boolean (NUMERICAL) and string/enum (TEXTUAL).
  if (value.type === 'reference') {
    // Unreachable; renderParamEntries short-circuits references before this path.
    throw new Error('renderRegularParam received a reference param');
  }
  const wrapperTag = PARAM_TAG[value.type];
  const paramDefType: string =
    value.type === 'integer'
      ? 'ECUC-INTEGER-PARAM-DEF'
      : value.type === 'float'
        ? 'ECUC-FLOAT-PARAM-DEF'
        : value.type === 'boolean'
          ? 'ECUC-BOOLEAN-PARAM-DEF'
          : value.type === 'enum'
            ? 'ECUC-ENUMERATION-PARAM-DEF'
            : 'ECUC-STRING-PARAM-DEF';
  // Sprint 16 — prefer the BSWMD-side definition path carried on the
  // value. Falls back to the legacy '/__synthesized__/<shortName>'
  // placeholder for manually-imported ARXML where no BSWMD is in scope.
  const refPath = value.definitionRef ?? `/__synthesized__/${defName}`;
  return {
    [wrapperTag]: {
      'DEFINITION-REF': {
        '@_DEST': paramDefType,
        '#text': refPath,
      },
      VALUE: value.value,
    },
  };
}

function renderReferenceParam(defName: string, value: ParamValue): Record<string, unknown> {
  if (value.type !== 'reference') {
    throw new Error('renderReferenceParam received a non-reference param');
  }
  // Standard <VALUE-REF> shape:
  //   <VALUE-REF DEST="ECUC-CONTAINER-VALUE">/path/to/target</VALUE-REF>
  // `dest` is optional — vendors sometimes omit it; parser preserves undefined.
  const valueRef: Record<string, unknown> = { '#text': value.value };
  if (value.dest !== undefined) valueRef['@_DEST'] = value.dest;
  // Sprint 16 — same definitionRef passthrough as renderRegularParam.
  const refPath = value.definitionRef ?? `/__synthesized__/${defName}`;
  return {
    'ECUC-REFERENCE-VALUE': {
      'DEFINITION-REF': {
        '@_DEST': 'ECUC-REFERENCE-DEF',
        '#text': refPath,
      },
      'VALUE-REF': valueRef,
    },
  };
}

// -----------------------------------------------------------------------------
// v1.5.1 PR(2) — preserveSourceOrder helpers
// -----------------------------------------------------------------------------
//
// Scope: reorder top-level AR-PACKAGE siblings and each AR-PACKAGE's
// direct ELEMENTS children to match the source XML emission order.
// Inner module/container children are NOT reordered — the parser
// already preserves source order for them, so re-serializing produces
// source-aligned output without intervention. We only need to override
// the in-memory order when the model was mutated (e.g. user reordered
// packages or added a new container at index 0).
//
// Matching key: container `shortName`. `ArxmlUnknown` siblings (no
// shortName — SERVICE-NEEDS, EAS-CUSTOM-DATA, /EAS/ namespaces) are
// treated as "not in source" and pinned to the tail of their parent
// in original in-memory order. The plan's Q5 B tolerance rules
// (namespace, whitespace, comments, attribute order are not preserved)
// apply here: only the order of named containers matters.

function reorderBySource(doc: ArxmlDocument, sourceArxml: string): ArxmlDocument {
  const parsed = parseArxml(sourceArxml);
  // Source couldn't be parsed — fall back to the in-memory order so the
  // caller still gets a usable result rather than a hard error. The
  // contract is "preserve order when source is available"; a malformed
  // source shouldn't block serialization.
  if (!parsed.ok) return doc;
  const sourceDoc = parsed.value;
  // Index source packages by shortName so lookups tolerate the in-memory
  // model missing packages that exist in source (e.g. user deleted one).
  // The previous positional `.map((pkg, i) => ...)` would mis-align when
  // counts diverged — C would be reordered against B's children. Map
  // lookup pins each in-memory package to its own source counterpart.
  const sourceByName = new Map(sourceDoc.packages.map((p) => [p.shortName, p]));
  return {
    ...doc,
    packages: stableSortByOrder(doc.packages, [...sourceByName.keys()], (p) => p.shortName).map(
      (pkg) => reorderPackageElements(pkg, sourceByName.get(pkg.shortName)),
    ),
  };
}

function reorderPackageElements(
  pkg: ArxmlPackage,
  sourcePkg: ArxmlPackage | undefined,
): ArxmlPackage {
  if (sourcePkg === undefined) return pkg;
  // Reorder ELEMENTS by the source's element order. `ArxmlUnknown`
  // elements can carry a SHORT-NAME inside `parsed` (e.g. EXCLUSIVE-AREA
  // has `<SHORT-NAME>DetExclusiveArea0</SHORT-NAME>`); fall back to that
  // when the top-level `shortName` field is undefined. Items without
  // any SHORT-NAME (SERVICE-NEEDS, EAS-CUSTOM-DATA) stay at the tail in
  // their original order.
  const elementOrder = sourcePkg.elements
    .map(elementShortName)
    .filter((n): n is string => n !== undefined);
  return {
    ...pkg,
    elements: stableSortByOrder(pkg.elements, elementOrder, elementShortName),
  };
}

/**
 * Resolve an element's identifying shortName. For known kinds
 * (`module`, `container`, `reference`) the typed field is authoritative
 * when defined. For `ArxmlUnknown` the parser does not promote the
 * SHORT-NAME — we fall back to `parsed['SHORT-NAME']` when present so
 * vendor elements that carry one (e.g. EXCLUSIVE-AREA) participate in
 * source-order matching.
 */
function elementShortName(el: ArxmlElement): string | undefined {
  if (el.kind !== 'unknown' && el.shortName !== undefined) return el.shortName;
  if (el.kind === 'unknown') {
    const sn = el.parsed['SHORT-NAME'];
    if (typeof sn === 'string') return sn;
  }
  return undefined;
}

/**
 * Stable sort: items whose key appears in `order` are placed at the
 * corresponding index (preserving source order). Items whose key is
 * absent (newly added, or unknown elements with no shortName) follow
 * in their original relative order at the tail.
 *
 * Implementation uses `.sort()` on a copy. JavaScript's
 * `Array.prototype.sort` is stable since ES2019 (Node ≥12); we rely on
 * that contract.
 */
function stableSortByOrder<T>(
  items: readonly T[],
  order: readonly string[],
  keyOf: (item: T) => string | undefined,
): T[] {
  const indexOf = new Map<string, number>();
  order.forEach((name, i) => {
    if (!indexOf.has(name)) indexOf.set(name, i);
  });
  return [...items].sort((a, b) => {
    const ak = keyOf(a);
    const bk = keyOf(b);
    const ai = ak !== undefined ? indexOf.get(ak) : undefined;
    const bi = bk !== undefined ? indexOf.get(bk) : undefined;
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return 0;
  });
}
