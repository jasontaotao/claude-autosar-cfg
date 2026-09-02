// Post-generation definition-ref guard for bridge mappers.
//
// The resolver fixes generated refs at construction time; this helper
// validates the final text against the same BSWMD set in tests so an
// invented prefix or renamed container cannot pass unnoticed.

import type { BswModuleDef, ContainerDef } from '../project/bswmd/types.js';

const DEFINITION_REF_PATTERN = /<DEFINITION-REF\b[^>]*>([^<]+)<\/DEFINITION-REF>/g;

function collectContainerPaths(
  containers: readonly ContainerDef[],
  knownPaths: Set<string>,
): void {
  for (const container of containers) {
    knownPaths.add(container.path);
    for (const parameter of container.parameters) knownPaths.add(parameter.path);
    for (const reference of container.references) knownPaths.add(reference.path);
    collectContainerPaths(container.subContainers, knownPaths);
    collectContainerPaths(container.choices, knownPaths);
  }
}

export function assertDefinitionRefsResolve(
  xml: string,
  bswmds: ReadonlyMap<string, BswModuleDef>,
): readonly string[] {
  const knownPaths = new Set<string>();
  for (const moduleDef of bswmds.values()) {
    knownPaths.add(moduleDef.path);
    for (const parameter of moduleDef.parameters ?? []) knownPaths.add(parameter.path);
    for (const reference of moduleDef.references ?? []) knownPaths.add(reference.path);
    collectContainerPaths(moduleDef.containers, knownPaths);
  }

  const unresolved = new Set<string>();
  for (const match of xml.matchAll(DEFINITION_REF_PATTERN)) {
    const ref = match[1]?.trim() ?? '';
    if (ref !== '' && !knownPaths.has(ref)) unresolved.add(ref);
  }
  return [...unresolved];
}
