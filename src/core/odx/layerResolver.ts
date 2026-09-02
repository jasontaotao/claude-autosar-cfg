import type { OdxDocument, OdxRawElement } from './odxDocument.js';

export interface OdxResolverWarning {
  readonly code: string;
  readonly elementRef: string;
  readonly message: string;
}

export interface ResolvedLayer {
  readonly chain: readonly OdxRawElement[];
  readonly services: readonly OdxRawElement[];
  readonly warnings: readonly OdxResolverWarning[];
}

const VARIANTS = new Set(['BASE-VARIANT', 'ECU-VARIANT']);

function childFirst(element: OdxRawElement, tag: string): OdxRawElement | undefined {
  return element.children[tag]?.[0];
}

function descendants(element: OdxRawElement, tag: string): OdxRawElement[] {
  const direct = element.children[tag] ?? [];
  return [
    ...direct,
    ...Object.values(element.children)
      .flat()
      .flatMap((child) => descendants(child, tag)),
  ];
}

function shortName(element: OdxRawElement): string | undefined {
  return childFirst(element, 'SHORT-NAME')?.text;
}

function parentIds(layer: OdxRawElement): string[] {
  const refs = childFirst(layer, 'PARENT-REFS');
  return (refs?.children['PARENT-REF'] ?? [])
    .map((ref) => ref.attrs['ID-REF'])
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

function mergeServices(chain: readonly OdxRawElement[]): OdxRawElement[] {
  const byId = new Map<string, OdxRawElement>();
  const byShortName = new Map<string, OdxRawElement>();

  for (const layer of [...chain].reverse()) {
    for (const service of descendants(layer, 'DIAG-SERVICE')) {
      const id = service.attrs.ID;
      if (id) byId.set(id, service);
      const name = shortName(service);
      if (name) byShortName.set(name, service);
    }
  }

  return [...byId.values()];
}

export function resolveLayer(document: OdxDocument, variantId: string): ResolvedLayer {
  const target = document.idIndex.get(variantId);
  if (!target || !VARIANTS.has(target.tag)) {
    throw new Error(`odx-variant-not-found: ${variantId}`);
  }

  const chain: OdxRawElement[] = [target];
  const warnings: OdxResolverWarning[] = [];
  const visited = new Set([target.attrs.ID ?? variantId]);
  let current = target;

  while (current) {
    const parentId = parentIds(current)[0];
    if (!parentId) break;

    const parent = document.idIndex.get(parentId);
    if (!parent) {
      warnings.push({
        code: 'odx-unresolved-parent-ref',
        elementRef: parentId,
        message: `Unresolved ODX parent reference: ${parentId}`,
      });
      break;
    }

    const parentIdValue = parent.attrs.ID ?? parentId;
    if (visited.has(parentIdValue)) {
      throw new Error(`odx-inheritance-cycle: ${[...visited, parentIdValue].join(' -> ')}`);
    }

    visited.add(parentIdValue);
    chain.push(parent);
    current = parent;
  }

  const notInherited = new Set(
    chain.flatMap((layer) =>
      descendants(layer, 'NOT-INHERITED-DIAG-COMM').flatMap((entry) =>
        (entry.children['DIAG-COMM-SNREF'] ?? []).map((ref) => ref.text ?? ''),
      ),
    ),
  );

  const services = mergeServices(chain).filter((service) => {
    const name = shortName(service);
    return !name || !notInherited.has(name);
  });

  return { chain, services, warnings };
}
