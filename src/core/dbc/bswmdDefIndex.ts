import { spineKey } from '../odx/bswmdDefIndex.js';
import type { BswModuleDef, ContainerDef, ParamDef, ReferenceDef } from '../project/bswmd/types.js';

export type DbcImportModule = 'Com' | 'CanIf' | 'PduR';

export interface ModuleBswmdDefIndex {
  readonly moduleShortName: DbcImportModule;
  readonly containerPath: ReadonlyMap<string, string>;
  readonly paramPath: ReadonlyMap<string, string>;
  readonly refPath: ReadonlyMap<string, string>;
  readonly paramDef: ReadonlyMap<string, ParamDef>;
  readonly referenceDef: ReadonlyMap<string, ReferenceDef>;
}

export type DbcBswmdDefIndex = Readonly<Record<'Com' | 'CanIf' | 'PduR', ModuleBswmdDefIndex>>;

function indexContainer(
  container: ContainerDef,
  modulePath: string,
  containerPath: Map<string, string>,
  paramPath: Map<string, string>,
  refPath: Map<string, string>,
  paramDef: Map<string, ParamDef>,
  referenceDef: Map<string, ReferenceDef>,
): void {
  const containerKey = spineKey(modulePath, container.path);
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
    indexContainer(child, modulePath, containerPath, paramPath, refPath, paramDef, referenceDef);
  }
  for (const child of container.choices) {
    indexContainer(child, modulePath, containerPath, paramPath, refPath, paramDef, referenceDef);
  }
}

export function buildModuleBswmdDefIndex(moduleDef: BswModuleDef): ModuleBswmdDefIndex {
  const containerPath = new Map<string, string>();
  const paramPath = new Map<string, string>();
  const refPath = new Map<string, string>();
  const paramDef = new Map<string, ParamDef>();
  const referenceDef = new Map<string, ReferenceDef>();

  for (const container of moduleDef.containers) {
    indexContainer(
      container,
      moduleDef.path,
      containerPath,
      paramPath,
      refPath,
      paramDef,
      referenceDef,
    );
  }

  return {
    moduleShortName: moduleDef.shortName as DbcImportModule,
    containerPath,
    paramPath,
    refPath,
    paramDef,
    referenceDef,
  };
}

export function buildDbcBswmdDefIndex(bswmds: ReadonlyMap<string, BswModuleDef>): DbcBswmdDefIndex {
  const required: readonly DbcImportModule[] = ['Com', 'CanIf', 'PduR'];
  const missing = required.filter((module) => !bswmds.has(module));
  if (missing.length > 0) {
    throw new Error(`dbc-bswmd-not-loaded: missing ${missing.join(', ')}`);
  }

  return {
    Com: buildModuleBswmdDefIndex(bswmds.get('Com')!),
    CanIf: buildModuleBswmdDefIndex(bswmds.get('CanIf')!),
    PduR: buildModuleBswmdDefIndex(bswmds.get('PduR')!),
  };
}
