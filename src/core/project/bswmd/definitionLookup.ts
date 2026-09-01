import type { BswmdDocument, BswModuleDef, ContainerDef } from './types.js';

export interface DefinitionLookupResult {
  readonly moduleDef: BswModuleDef;
  readonly containerDef: ContainerDef;
}

/**
 * Resolve a container definition by its schema-side `DEFINITION-REF`.
 *
 * ECUC value-side `SHORT-NAME`s are instance names and may be renamed or
 * auto-suffixed. They must never be the primary key for schema lookup.
 * This helper deliberately compares the full `ContainerDef.path` and does
 * not apply any short-name suffix heuristics.
 */
export function findContainerDefInModuleByDefinitionRef(
  moduleDef: BswModuleDef,
  definitionRef: string,
): ContainerDef | null {
  const normalized = `/${definitionRef.split('/').filter(Boolean).join('/')}`;
  if (normalized === '/') return null;
  return findContainerDefInTree(moduleDef.containers, normalized);
}

export function findContainerDefByDefinitionRef(
  schemas: readonly BswmdDocument[],
  definitionRef: string,
): DefinitionLookupResult | null {
  const normalized = `/${definitionRef.split('/').filter(Boolean).join('/')}`;
  if (normalized === '/') return null;

  for (const schema of schemas) {
    for (const moduleDef of schema.modules) {
      const containerDef = findContainerDefInTree(moduleDef.containers, normalized);
      if (containerDef !== null) return { moduleDef, containerDef };
    }
  }
  return null;
}

function findContainerDefInTree(
  candidates: readonly ContainerDef[],
  definitionRef: string,
): ContainerDef | null {
  for (const candidate of candidates) {
    if (candidate.path === definitionRef) return candidate;
    const nested = findContainerDefInTree(
      [...candidate.subContainers, ...candidate.choices],
      definitionRef,
    );
    if (nested !== null) return nested;
  }
  return null;
}
