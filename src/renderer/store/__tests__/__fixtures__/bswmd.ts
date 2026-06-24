// v1.11.4 PATCH-C — shared BSWMD fixture builders.
//
// These three helpers (makeBswModule, makeBswModuleWithSubContainer,
// makeBswmd) were previously duplicated across three test files
// (useArxmlStore.addparam.test.ts, useArxmlStore.deleteModule.test.ts,
// useArxmlStore.mutation.test.ts). Extracted here so future BSWMD
// fixtures have one place to extend — and so the duplicated
// ~30-line ContainerDef literals stay in sync when the BswModuleDef
// schema evolves.
//
// Two distinct shapes cover the current call sites:
//   - `makeBswModule` — single topContainer with one direct
//     parameter and no sub-containers (used by addParameter /
//     deleteModule tests, where the mutation targets the top
//     container directly).
//   - `makeBswModuleWithSubContainer` — topContainer with one
//     sub-container (upperMultiplicity: 'infinite') plus one
//     direct parameter (used by addContainer / nested-mutation
//     tests, where the mutation targets a sub-container path).
//
// `makeBswmd` wraps either BswModuleDef in a single-module
// BswmdDocument with the canonical 4.6 version and no warnings.

import type { BswmdDocument, BswModuleDef, ContainerDef, ParamDef } from '@core/project/bswmd.js';

/**
 * Build a BswModuleDef with a single top-level container carrying one
 * integer parameter. No sub-containers. The parameter's `path` is
 * supplied by the caller (it varies per test — some use the canonical
 * `/EAS/<module>/<container>/<param>`, some use a real BSWMD file
 * path).
 */
export function makeBswModule(
  moduleShortName: string,
  containerShortName: string,
  paramShortName: string,
  paramPath: string,
): BswModuleDef {
  const topContainer: ContainerDef = {
    shortName: containerShortName,
    path: `/EAS/${moduleShortName}/${containerShortName}`,
    lowerMultiplicity: 0,
    upperMultiplicity: 1,
    subContainers: [],
    parameters: [
      {
        shortName: paramShortName,
        path: paramPath,
        kind: 'integer',
        defaultValue: 0,
        minValue: 0,
        maxValue: 100,
        minLength: null,
        maxLength: null,
        enumerationLiterals: [],
      } satisfies ParamDef,
    ],
    references: [],
    choices: [],
  };
  return {
    shortName: moduleShortName,
    path: `/EAS/${moduleShortName}`,
    dialect: 'ecuc-module-def',
    moduleId: 0,
    containers: [topContainer],
    providedEntries: [],
    lowerMultiplicity: 0,
    upperMultiplicity: 1,
  };
}

/**
 * Build a BswModuleDef with a top container that has one
 * sub-container (upperMultiplicity: 'infinite') and one direct
 * integer parameter. The sub-container is empty (no parameters, no
 * nested sub-containers) — the picker / addContainer tests target
 * the sub-container path itself, not its children.
 */
export function makeBswModuleWithSubContainer(
  moduleShortName: string,
  topContainerShortName: string,
  subContainerShortName: string,
  paramShortName: string = 'TestParam',
): BswModuleDef {
  const subContainer: ContainerDef = {
    shortName: subContainerShortName,
    path: `/EAS/${moduleShortName}/${topContainerShortName}/${subContainerShortName}`,
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
    subContainers: [],
    parameters: [],
    references: [],
    choices: [],
  };
  const topContainer: ContainerDef = {
    shortName: topContainerShortName,
    path: `/EAS/${moduleShortName}/${topContainerShortName}`,
    lowerMultiplicity: 0,
    upperMultiplicity: 1,
    subContainers: [subContainer],
    parameters: [
      {
        shortName: paramShortName,
        path: `/EAS/${moduleShortName}/${topContainerShortName}/${paramShortName}`,
        kind: 'integer',
        defaultValue: 0,
        minValue: 0,
        maxValue: 100,
        minLength: null,
        maxLength: null,
        enumerationLiterals: [],
      } satisfies ParamDef,
    ],
    references: [],
    choices: [],
  };
  return {
    shortName: moduleShortName,
    path: `/EAS/${moduleShortName}`,
    dialect: 'ecuc-module-def',
    moduleId: 0,
    containers: [topContainer],
    providedEntries: [],
    lowerMultiplicity: 0,
    upperMultiplicity: 1,
  };
}

/**
 * Wrap a single BswModuleDef into a BswmdDocument for the store.
 * Version 4.6 matches the canonical fixture baseline (also used by
 * `skeleton.ts` for vendor-prefix emit).
 */
export function makeBswmd(mod: BswModuleDef): BswmdDocument {
  return { version: '4.6', modules: [mod], warnings: [] };
}
