// core/generator/__tests__/ecuc.test.ts
//
// Happy-path tests for the EcuCGenerator (Task 16). Four scenarios:
//   1. moduleShortName is "EcuC"
//   2. PreCompile variant emits exactly 2 artifacts (Cfg.h + Cfg.c)
//   3. Mixed (PreCompile + PostBuild) variant emits 3 artifacts
//      (adds EcuC_PBcfg.c)
//   4. Throws when the BSWMD module def is undefined
//
// The fixtures live in `test-fixtures/ecuc.ts` and are hand-typed TS
// constants — ARXML parsing is out of MVP scope per the Task 16 brief.

import { describe, it, expect, beforeEach } from 'vitest';

import type { Diagnostic } from '../diagnostics.js';
import { EcuCGenerator } from '../modules/ecuc.js';
import { normalizeToTree, type BswmdModuleDefLite } from '../normalize.js';
import {
  _resetRegistryForTest,
  registerGenerator,
  getGenerator,
  type GenerationContext,
} from '../registry.js';

import {
  ecucDef,
  ecucValuesPreCompile,
  ecucValuesMixed,
  type BswmdModuleDef,
  type EcucModuleConfigurationValues,
} from './test-fixtures/ecuc.js';

function makeCtx(variant: 'PreCompile' | 'Link' | 'PostBuild'): GenerationContext {
  // v1.13.4 PATCH-B (L3) — build bswmdParamIndex via the production
  // normalizeToTree path so the L3 lookup matches the runtime wiring.
  const tree = normalizeToTree(
    new Map([[ecucDef.shortName, ecucDef as unknown as BswmdModuleDefLite]]),
    new Map(),
  );
  return {
    variant,
    bswmdIndex: new Map<string, unknown>(),
    implByModule: new Map<string, string>(),
    outDir: '/tmp',
    diagnostics: [] as Diagnostic[],
    bswmdParamIndex: tree.bswmdParamIndex,
  };
}

describe('EcuCGenerator', () => {
  beforeEach(() => {
    _resetRegistryForTest();
  });

  it('is registered with moduleShortName "EcuC"', () => {
    const g = new EcuCGenerator();
    expect(g.moduleShortName).toBe('EcuC');
  });

  it('emits 2 artifacts (Cfg.c, Cfg.h) for PreCompile variant', () => {
    registerGenerator(new EcuCGenerator());
    const g = getGenerator('EcuC');
    if (!g) throw new Error('generator not registered');

    const out = g.emit(
      ecucDef as unknown as BswmdModuleDef,
      ecucValuesPreCompile as unknown as EcucModuleConfigurationValues,
      makeCtx('PreCompile'),
    );
    const paths = out.map((a) => a.path).sort();
    expect(paths).toEqual(['EcuC/EcuC_Cfg.c', 'EcuC/EcuC_Cfg.h']);
  });

  it('emits 3 artifacts including PBcfg.c when any PostBuild element', () => {
    registerGenerator(new EcuCGenerator());
    const g = getGenerator('EcuC');
    if (!g) throw new Error('generator not registered');

    const out = g.emit(
      ecucDef as unknown as BswmdModuleDef,
      ecucValuesMixed as unknown as EcucModuleConfigurationValues,
      makeCtx('PreCompile'),
    );
    const paths = out.map((a) => a.path).sort();
    expect(paths).toEqual(['EcuC/EcuC_Cfg.c', 'EcuC/EcuC_Cfg.h', 'EcuC/EcuC_PBcfg.c']);
  });

  it('throws on undefined module def (sanity)', () => {
    const g = new EcuCGenerator();
    expect(() =>
      g.emit(
        undefined as never,
        ecucValuesPreCompile as unknown as EcucModuleConfigurationValues,
        makeCtx('PreCompile'),
      ),
    ).toThrow();
  });

  // v1.13.4 PATCH-B (M5) — multi-param container regression. Before the
  // fix, `shortNameFromDef` returned the hardcoded literal `'Param'`,
  // so the 2-param `EcuCGeneral` container emitted two declarations of
  // the same identifier `EcuC_EcuCGeneral_Param` with different C types
  // (uint32 + uint8) — invalid C, guaranteed compile failure.
  it('emits distinct idents for multi-param containers (M5 regression)', () => {
    registerGenerator(new EcuCGenerator());
    const g = getGenerator('EcuC');
    if (!g) throw new Error('generator not registered');

    const out = g.emit(
      ecucDef as unknown as BswmdModuleDef,
      ecucValuesPreCompile as unknown as EcucModuleConfigurationValues,
      makeCtx('PreCompile'),
    );
    const cfgC = out.find((a) => a.path === 'EcuC/EcuC_Cfg.c');
    if (!cfgC) throw new Error('EcuC_Cfg.c missing');
    expect(cfgC.content).toContain('EcuC_EcuCGeneral_ConfigConsistencyHash');
    expect(cfgC.content).toContain('EcuC_EcuCGeneral_GenericParameter');
  });

  // v1.13.4 PATCH-B (L3) — PostBuild routing driven by BSWMD
  // paramConfigClass instead of the /PostBuild/i.test(path) regex
  // substring heuristic. Before the fix, ANY path containing the
  // substring "PostBuild" would trigger PBcfg.c emission (over-broad,
  // false positives on real BSWMD paths). After the fix, only params
  // with paramConfigClass=POST-BUILD for the active variant route to
  // PBcfg.c.
  it('routes POST-BUILD configClass params to PBcfg.c (L3 structured lookup)', () => {
    registerGenerator(new EcuCGenerator());
    const g = getGenerator('EcuC');
    if (!g) throw new Error('generator not registered');

    const out = g.emit(
      ecucDef as unknown as BswmdModuleDef,
      ecucValuesMixed as unknown as EcucModuleConfigurationValues,
      makeCtx('PreCompile'),
    );
    const pbcfg = out.find((a) => a.path === 'EcuC/EcuC_PBcfg.c');
    if (!pbcfg) throw new Error('EcuC_PBcfg.c missing — POST-BUILD routing failed');
    // PostBuildParam has paramConfigClass=POST-BUILD for VARIANT-PRE-COMPILE
    // → should appear in PBcfg.c as a loader entry.
    expect(pbcfg.content).toContain('EcuC_EcuCGeneral_PostBuildParam');
    // ConfigConsistencyHash has configClass=PRE-COMPILE → should NOT
    // appear in PBcfg.c.
    expect(pbcfg.content).not.toContain('EcuC_EcuCGeneral_ConfigConsistencyHash');
  });

  // v1.14.2 PATCH-H (H3) — EcuC ancestry-aware walk parity with Mcu.
  // The existing EcuC fixture is 1-level (one container, no nested
  // sub-containers), so we hand-roll a 2-level nested fixture here
  // to exercise the ancestry path. The v1.14.1 ecuc.ts:234-240
  // comment explicitly tracked this as a v1.14.2 follow-up: EcuC
  // used leaf-only `walkContainers` while Mcu used
  // `walkContainersWithAncestry` since v1.14.1 PATCH-G G3.
  it('v1.14.2 H3 — nested container emits param with full ancestry path', () => {
    const nestedDef = {
      shortName: 'EcuC',
      postBuildVariantSupport: false,
      containers: [
        {
          shortName: 'PartitionConfig',
          lowerMultiplicity: 0,
          upperMultiplicity: 'infinite' as const,
          parameters: [
            {
              kind: 'integer',
              shortName: 'PartitionId',
              paramConfigClasses: [
                { configClass: 'PRE-COMPILE', configVariant: 'VARIANT-PRE-COMPILE' },
              ],
              min: 0,
              max: 65535,
            },
          ],
          containers: [
            {
              shortName: 'PartitionBuffer',
              lowerMultiplicity: 0,
              upperMultiplicity: 1,
              parameters: [
                {
                  kind: 'integer',
                  shortName: 'BufferLength',
                  paramConfigClasses: [
                    { configClass: 'PRE-COMPILE', configVariant: 'VARIANT-PRE-COMPILE' },
                  ],
                  min: 0,
                  max: 65535,
                },
              ],
              references: [],
              choices: [],
              containers: [],
            },
          ],
        },
      ],
    } as unknown as BswmdModuleDef;
    const nestedValues = {
      definitionRef: '/AUTOSAR/EcucDefs/EcuC',
      parameters: [
        {
          path: 'EcuC/PartitionConfig/PartitionBuffer/BufferLength',
          kind: 'integer',
          value: 256,
        },
      ],
      references: [],
    } as unknown as EcucModuleConfigurationValues;

    registerGenerator(new EcuCGenerator());
    const g = getGenerator('EcuC');
    if (!g) throw new Error('generator not registered');

    const out = g.emit(nestedDef, nestedValues, makeCtx('PreCompile'));
    const cfgC = out.find((a) => a.path === 'EcuC/EcuC_Cfg.c');
    if (!cfgC) throw new Error('EcuC_Cfg.c missing');

    // Nested param must use the full ancestry path in the C ident.
    // Pre-H3 (leaf-only): cIdent was based on
    //   `${moduleShort}/${leafContainer}/${paramShortName}` = EcuC/PartitionBuffer/BufferLength
    //   which would render as `EcuC_PartitionBuffer_BufferLength` —
    //   silently colliding with the parent container's
    //   `PartitionId` from a different sub-container in larger BSWMDs.
    // Post-H3 (ancestry-aware): cIdent is
    //   `${ancestry}/${paramShortName}` = EcuC/PartitionConfig/PartitionBuffer/BufferLength
    //   → `EcuC_PartitionConfig_PartitionBuffer_BufferLength`.
    expect(cfgC.content).toContain('EcuC_PartitionConfig_PartitionBuffer_BufferLength');
  });

  it('v1.14.2 H3 — leaf-only container emits same as before (no regression)', () => {
    // The existing 1-level EcuC fixture must still produce the
    // pre-H3 cIdent (EcuC_EcuCGeneral_<Param>) — the ancestry path
    // for a 1-level walk is identical to the leaf-only path, so
    // existing snapshot tests are unaffected.
    registerGenerator(new EcuCGenerator());
    const g = getGenerator('EcuC');
    if (!g) throw new Error('generator not registered');

    const out = g.emit(
      ecucDef as unknown as BswmdModuleDef,
      ecucValuesPreCompile as unknown as EcucModuleConfigurationValues,
      makeCtx('PreCompile'),
    );
    const cfgC = out.find((a) => a.path === 'EcuC/EcuC_Cfg.c');
    if (!cfgC) throw new Error('EcuC_Cfg.c missing');
    expect(cfgC.content).toContain('EcuC_EcuCGeneral_ConfigConsistencyHash');
  });
});
