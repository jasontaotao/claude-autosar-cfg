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
          // v1.13.4 PATCH-B (M5) — real BSWMD shortName aligns the
          // generator's emission path with the value-paths in
          // ecucValuesPreCompile/Mixed/Refs. Without this the generator
          // fell back to a hardcoded 'Param' literal and produced two
          // duplicate-identifier declarations in any multi-param container.
          shortName: 'ConfigConsistencyHash',
          // v1.13.4 PATCH-B (L3) — paramConfigClass=PRE-COMPILE
          // means this stays in Cfg.c (never PBcfg.c).
          paramConfigClasses: [
            { configClass: 'PRE-COMPILE', configVariant: 'VARIANT-PRE-COMPILE' },
          ],
          min: 0,
          max: 4294967295,
        } satisfies BswmdParamDef,
        {
          kind: 'boolean',
          shortName: 'GenericParameter',
          paramConfigClasses: [
            { configClass: 'PRE-COMPILE', configVariant: 'VARIANT-PRE-COMPILE' },
          ],
        } satisfies BswmdParamDef,
        // v1.13.4 PATCH-B (L3) — third param exercises the
        // paramConfigClass-driven PostBuild routing. Before L3 the
        // heuristic /PostBuild/i.test(path) was over-broad; now only
        // params whose paramConfigClass matches POST-BUILD for the
        // active variant route to PBcfg.c.
        {
          kind: 'integer',
          shortName: 'PostBuildParam',
          // configClass=POST-BUILD under VARIANT-PRE-COMPILE — the
          // mixed-build case where the value is loaded post-build
          // even in a PreCompile variant. This is what triggers the
          // loader-entry emission in PBcfg.c.
          paramConfigClasses: [{ configClass: 'POST-BUILD', configVariant: 'VARIANT-PRE-COMPILE' }],
          min: 0,
          max: 4294967295,
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
