// core/arxml/serializer.ts
// Reverse of parser.ts. Pure function: ArxmlDocument -> Result<string, SerializeError>.

import { XMLBuilder } from 'fast-xml-parser';

import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ArxmlPackage,
  ArxmlReference,
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
        doc.packages.length > 0
          ? // fast-xml-parser requires an explicit wrapper key for array-of-object
            // values; otherwise it serializes inner keys as direct children of
            // <AR-PACKAGES> instead of wrapping each in <AR-PACKAGE>.
            { 'AR-PACKAGE': doc.packages.map(renderPackage) }
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
 * standard for R4.4+; vendor tools (EB tresos) emit it alongside the
 * legacy `r4.0` namespace. The dashed form (`AUTOSAR_4-2-2.xsd`) is the
 * pre-R4.4 convention used by 4.2 / 4.4 / 4.6 / 4.7 / 5.0.
 *
 * Pairing:
 *   ArxmlVersion → { xmlns, xsd }
 *
 * The xmlns follows the file's declared namespace; for 5-digit literals
 * we mirror EB tresos's `r4.0` namespace convention.
 */
const SCHEMA_LOCATION: Record<ArxmlVersion, { readonly xmlns: string; readonly xsd: string }> = {
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
  return renderReference(elem);
}

function renderModule(m: ArxmlModule): Record<string, unknown> {
  const out: Record<string, unknown> = {
    'SHORT-NAME': m.shortName,
  };
  if (m.references.length > 0) {
    const ref = m.references[0]!;
    const [dest, ...rest] = ref.split(':');
    const value = rest.join(':') || ref;
    const defRef: Record<string, unknown> = { '#text': value };
    if (dest !== undefined) defRef['@_DEST'] = dest;
    out['DEFINITION-REF'] = defRef;
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
  return {
    [wrapperTag]: {
      'DEFINITION-REF': {
        '@_DEST': paramDefType,
        '#text': `/__synthesized__/${defName}`,
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
  return {
    'ECUC-REFERENCE-VALUE': {
      'DEFINITION-REF': {
        '@_DEST': 'ECUC-REFERENCE-DEF',
        '#text': `/__synthesized__/${defName}`,
      },
      'VALUE-REF': valueRef,
    },
  };
}
