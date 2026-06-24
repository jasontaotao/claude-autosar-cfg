// core/generator/__tests__/test-fixtures/ecuc.ts
//
// Hand-typed TS constants that stand in for parsed EcuC BSWMD / BSWCFG
// shapes. Task 14 added ARXML fixtures under testdata/generator/; XML
// parsing is intentionally out of MVP scope per the Task 16 brief, so
// these fixtures mirror what the parser would produce and give the
// EcuCGenerator (Task 16) and downstream snapshot tests (Task 17) a
// stable input surface.
//
// Fixture matrix:
//   ecucDef             — minimal module def with one container + 2 params.
//   ecucValuesPreCompile — values resolved for PreCompile variant only.
//   ecucValuesMixed     — values spanning PreCompile + PostBuild.
//   ecucValuesRefs      — values that include a cross-module reference.

import type { BswmdParamDef } from '../../handlebars-helpers.js';

export interface BswmdContainerDef {
  readonly shortName: string;
  readonly lowerMultiplicity: number;
  readonly upperMultiplicity: number;
  readonly parameters: readonly BswmdParamDef[];
}

export interface BswmdModuleDef {
  readonly shortName: string;
  readonly postBuildVariantSupport: boolean;
  readonly containers: readonly BswmdContainerDef[];
}

export interface EcucParamValue {
  readonly path: string;
  readonly kind: BswmdParamDef['kind'];
  readonly value: unknown;
}

export interface EcucReferenceValue {
  readonly path: string;
  readonly targetModule: string;
  readonly targetPath: string;
}

export interface EcucModuleConfigurationValues {
  readonly definitionRef: string;
  readonly parameters: readonly EcucParamValue[];
  readonly references: readonly EcucReferenceValue[];
}

// ---------------------------------------------------------------------------
// BSWMD fixture — minimal EcuC module def.
// ---------------------------------------------------------------------------

export const ecucDef: BswmdModuleDef = {
  shortName: 'EcuC',
  postBuildVariantSupport: true,
  containers: [
    {
      shortName: 'EcuCGeneral',
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
      parameters: [
        {
          kind: 'integer',
          min: 0,
          max: 4294967295,
        } satisfies BswmdParamDef,
        {
          kind: 'boolean',
        } satisfies BswmdParamDef,
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// BSWCFG fixtures — values shaped per active variant.
// ---------------------------------------------------------------------------

export const ecucValuesPreCompile: EcucModuleConfigurationValues = {
  definitionRef: '/AUTOSAR/EcucDefs/EcuC',
  parameters: [
    {
      path: 'EcuC/EcuCGeneral/ConfigConsistencyHash',
      kind: 'integer',
      value: 305419896, // 0x12345678
    },
    {
      path: 'EcuC/EcuCGeneral/GenericParameter',
      kind: 'boolean',
      value: true,
    },
  ],
  references: [],
};

export const ecucValuesMixed: EcucModuleConfigurationValues = {
  definitionRef: '/AUTOSAR/EcucDefs/EcuC',
  parameters: [
    {
      path: 'EcuC/EcuCGeneral/ConfigConsistencyHash',
      kind: 'integer',
      value: 305419896,
    },
    {
      path: 'EcuC/EcuCGeneral/PostBuildParam',
      kind: 'integer',
      value: 42,
    },
  ],
  references: [],
};

export const ecucValuesRefs: EcucModuleConfigurationValues = {
  definitionRef: '/AUTOSAR/EcucDefs/EcuC',
  parameters: [
    {
      path: 'EcuC/EcuCGeneral/ConfigConsistencyHash',
      kind: 'integer',
      value: 305419896,
    },
  ],
  references: [
    {
      path: 'EcuC/EcuCGeneral/PartitionRef',
      targetModule: 'Os',
      targetPath: 'Os/OsCore/OsCore_0',
    },
  ],
};
