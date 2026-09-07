import type { BswModuleDef, ContainerDef, ParamDef, ReferenceDef } from '../project/bswmd/types.js';

export interface BswmdDefIndex {
  readonly containerPath: ReadonlyMap<string, string>;
  readonly paramPath: ReadonlyMap<string, string>;
  readonly refPath: ReadonlyMap<string, string>;
  readonly paramDef: ReadonlyMap<string, ParamDef>;
  readonly referenceDef: ReadonlyMap<string, ReferenceDef>;
}

export function spineKey(modulePath: string, definitionPath: string): string {
  const normalizedModule = modulePath.replace(/^\/+|\/+$/g, '');
  const normalizedDefinition = definitionPath.replace(/^\/+|\/+$/g, '');
  if (normalizedDefinition === normalizedModule) return '';
  const prefix = `${normalizedModule}/`;
  return normalizedDefinition.startsWith(prefix)
    ? normalizedDefinition.slice(prefix.length)
    : normalizedDefinition;
}

function indexContainer(
  moduleDef: BswModuleDef,
  container: ContainerDef,
  containerPath: Map<string, string>,
  paramPath: Map<string, string>,
  refPath: Map<string, string>,
  paramDef: Map<string, ParamDef>,
  referenceDef: Map<string, ReferenceDef>,
): void {
  const containerKey = spineKey(moduleDef.path, container.path);
  if (containerKey) containerPath.set(containerKey, container.path);

  for (const parameter of container.parameters) {
    const key = `${containerKey}/${parameter.shortName}`;
    paramPath.set(key, parameter.path);
    paramDef.set(key, parameter);
  }

  for (const reference of container.references) {
    const key = `${containerKey}/${reference.shortName}`;
    refPath.set(key, reference.path);
    referenceDef.set(key, reference);
  }

  for (const child of container.subContainers) {
    indexContainer(moduleDef, child, containerPath, paramPath, refPath, paramDef, referenceDef);
  }
}

export function buildBswmdDefIndex(bswmds: ReadonlyMap<string, BswModuleDef>): BswmdDefIndex {
  const containerPath = new Map<string, string>();
  const paramPath = new Map<string, string>();
  const refPath = new Map<string, string>();
  const paramDef = new Map<string, ParamDef>();
  const referenceDef = new Map<string, ReferenceDef>();

  for (const moduleDef of bswmds.values()) {
    for (const container of moduleDef.containers) {
      indexContainer(
        moduleDef,
        container,
        containerPath,
        paramPath,
        refPath,
        paramDef,
        referenceDef,
      );
    }
  }

  return {
    containerPath,
    paramPath,
    refPath,
    paramDef,
    referenceDef,
  };
}
