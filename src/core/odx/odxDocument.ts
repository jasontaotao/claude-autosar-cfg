import { XMLParser, XMLValidator } from 'fast-xml-parser';

export interface OdxRawElement {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: Readonly<Record<string, readonly OdxRawElement[]>>;
  readonly text?: string;
}

export interface OdxVariantInfo {
  readonly kind: 'BASE-VARIANT' | 'ECU-VARIANT';
  readonly odxId: string;
  readonly shortName: string;
}

export interface OdxDocument {
  readonly modelVersion: string;
  readonly adminRevision?: string;
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
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return { tag, attrs: {}, children: {}, text: String(value) };
  }

  const source = isObject(value) ? value : {};
  const attrs = normalizeAttrs(source);
  const children: Record<string, OdxRawElement[]> = {};
  const text = typeof source['#text'] === 'string' ? source['#text'] : undefined;

  for (const [childTag, childValue] of Object.entries(source)) {
    if (childTag.startsWith('@_') || childTag === '#text') continue;
    const values = Array.isArray(childValue) ? childValue : [childValue];
    children[childTag] = values.map((item) => toElement(childTag, item, idIndex));
  }

  const element: OdxRawElement = {
    tag,
    attrs,
    children,
    ...(text === undefined ? {} : { text }),
  };
  if (attrs.ID) idIndex.set(attrs.ID, element);
  return element;
}

function findFirstElement(value: unknown, tag: string): ParsedNode | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstElement(item, tag);
      if (found) return found;
    }
    return undefined;
  }
  if (!isObject(value)) return undefined;
  const direct = value[tag];
  if (Array.isArray(direct)) {
    const item = direct.find(isObject);
    if (item) return item;
  } else if (isObject(direct)) {
    return direct;
  }
  for (const childValue of Object.values(value)) {
    const found = findFirstElement(childValue, tag);
    if (found) return found;
  }
  return undefined;
}

function latestRevisionLabel(value: unknown): string | undefined {
  const revisions = findFirstElement(value, 'DOC-REVISIONS');
  if (!revisions) return undefined;
  const raw = revisions['DOC-REVISION'];
  const items = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  const candidates = items
    .filter(isObject)
    .map((revision) => ({
      date: typeof revision.DATE === 'string' ? revision.DATE : '',
      label:
        typeof revision['REVISION-LABEL'] === 'string' ? revision['REVISION-LABEL'] : undefined,
    }))
    .filter((revision): revision is { date: string; label: string } => revision.label !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
  return candidates.at(-1)?.label;
}

function shortNameOf(element: OdxRawElement): string {
  return element.children['SHORT-NAME']?.[0]?.text ?? element.attrs.ID ?? '';
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
  toElement('ODX', parsed, idIndex);

  const discovered: Array<{ tag: string; value: ParsedNode }> = [];
  collectElements(parsed, discovered);

  const layers = discovered
    .filter((item) => LAYER_TAGS.has(item.tag))
    .map((item) => toElement(item.tag, item.value, idIndex));

  const importableVariants = layers.flatMap((layer) => {
    if ((layer.tag !== 'BASE-VARIANT' && layer.tag !== 'ECU-VARIANT') || !layer.attrs.ID) return [];
    const kind: OdxVariantInfo['kind'] = layer.tag;
    return [{ kind, odxId: layer.attrs.ID, shortName: shortNameOf(layer) }];
  });

  const root = isObject(parsed) && isObject(parsed['ODX']) ? parsed['ODX'] : {};
  const modelVersion =
    typeof root['@_MODEL-VERSION'] === 'string' ? root['@_MODEL-VERSION'] : 'unknown';
  const adminRevision = latestRevisionLabel(parsed);

  return {
    modelVersion,
    ...(adminRevision === undefined ? {} : { adminRevision }),
    layers,
    importableVariants,
    idIndex,
  };
}
