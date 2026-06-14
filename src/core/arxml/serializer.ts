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

function buildXmlns(v: ArxmlVersion): string {
  return `http://autosar.org/schema/r${v}`;
}

function buildSchemaLocation(v: ArxmlVersion): string {
  return `http://autosar.org/schema/r${v} AUTOSAR_${v.replace('.', '-')}.xsd`;
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
  const paramsArr = renderParams(m.params);
  const containersArr = m.children.filter((c): c is ArxmlContainer => c.kind === 'container');
  if (containersArr.length > 0) {
    out['CONTAINERS'] = { 'ECUC-CONTAINER-VALUE': containersArr.map(renderContainer) };
  }
  if (paramsArr.length > 0) {
    // Group by wrapper tag so fast-xml-parser emits one <PARAMETER-VALUES>
    // containing multiple same-tag siblings (parser expects this shape).
    out['PARAMETER-VALUES'] = groupByTagName(paramsArr);
  }
  return out;
}

function renderContainer(c: ArxmlContainer): Record<string, unknown> {
  const out: Record<string, unknown> = {
    'SHORT-NAME': c.shortName,
  };
  const paramsArr = renderParams(c.params);
  if (paramsArr.length > 0) {
    out['PARAMETER-VALUES'] = groupByTagName(paramsArr);
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

function renderParams(params: Readonly<Record<string, ParamValue>>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const [defName, value] of Object.entries(params)) {
    const wrapperTag = PARAM_TAG[value.type];
    const paramDefType =
      value.type === 'integer' || value.type === 'float'
        ? 'ECUC-INTEGER-PARAM-DEF'
        : value.type === 'boolean'
          ? 'ECUC-BOOLEAN-PARAM-DEF'
          : value.type === 'enum'
            ? 'ECUC-ENUMERATION-PARAM-DEF'
            : 'ECUC-STRING-PARAM-DEF';
    out.push({
      [wrapperTag]: {
        'DEFINITION-REF': {
          '@_DEST': paramDefType,
          '#text': `/__synthesized__/${defName}`,
        },
        'VALUE': value.value,
      },
    });
  }
  return out;
}