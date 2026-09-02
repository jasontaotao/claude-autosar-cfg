import { XMLParser, XMLValidator } from 'fast-xml-parser';

export interface OdxRawElement {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: Readonly<Record<string, readonly OdxRawElement[]>>;
}

export interface OdxVariantInfo {
  readonly kind: 'BASE-VARIANT' | 'ECU-VARIANT';
  readonly odxId: string;
}

export interface OdxDocument {
  readonly layers: readonly OdxRawElement[];
  readonly importableVariants: readonly OdxVariantInfo[];
  readonly idIndex: ReadonlyMap<string, OdxRawElement>;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  removeNSPrefix: false,
  processEntities: true,
  trimValues: false,
});

const LAYER_TAGS = new Set(['PROTOCOL', 'BASE-VARIANT', 'ECU-VARIANT', 'FUNCTIONAL-GROUP']);

type ParsedNode = Record<string, unknown>;

function isObject(value: unknown): value is ParsedNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeAttrs(value: ParsedNode): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [key, attrValue] of Object.entries(value)) {
    if (key.startsWith('@_')) attrs[key.slice(2)] = String(attrValue ?? '');
  }
  return attrs;
}

function toElement(
  tag: string,
  value: unknown,
  idIndex: Map<string, OdxRawElement>,
): OdxRawElement {
  const source = isObject(value) ? value : {};
  const attrs = normalizeAttrs(source);
  const children: Record<string, OdxRawElement[]> = {};

  for (const [childTag, childValue] of Object.entries(source)) {
    if (childTag.startsWith('@_') || childTag === '#text') continue;
    const values = Array.isArray(childValue) ? childValue : [childValue];
    children[childTag] = values.map((item) => toElement(childTag, item, idIndex));
  }

  const element: OdxRawElement = { tag, attrs, children };
  if (attrs.ID) idIndex.set(attrs.ID, element);
  return element;
}

function collectElements(value: unknown, output: Array<{ tag: string; value: ParsedNode }>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectElements(item, output);
    return;
  }
  if (!isObject(value)) return;

  for (const [tag, childValue] of Object.entries(value)) {
    if (tag.startsWith('@_') || tag === '#text' || tag.startsWith('?')) continue;
    const values = Array.isArray(childValue) ? childValue : [childValue];
    for (const item of values) {
      if (!isObject(item)) continue;
      output.push({ tag, value: item });
      collectElements(item, output);
    }
  }
}

export function parseOdxDocument(xml: string): OdxDocument {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new Error(`ODX parse failed: ${validation.err.msg}`);
  }

  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch (error) {
    throw new Error(`ODX parse failed: ${error instanceof Error ? error.message : 'XML'}`);
  }

  const idIndex = new Map<string, OdxRawElement>();
  const discovered: Array<{ tag: string; value: ParsedNode }> = [];
  collectElements(parsed, discovered);

  const layers = discovered
    .filter((item) => LAYER_TAGS.has(item.tag))
    .map((item) => toElement(item.tag, item.value, idIndex));

  const importableVariants = layers.flatMap((layer) => {
    if ((layer.tag !== 'BASE-VARIANT' && layer.tag !== 'ECU-VARIANT') || !layer.attrs.ID) return [];
    const kind: OdxVariantInfo['kind'] = layer.tag;
    return [{ kind, odxId: layer.attrs.ID }];
  });

  return { layers, importableVariants, idIndex };
}
