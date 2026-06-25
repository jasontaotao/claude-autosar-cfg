import { describe, it, expect } from 'vitest';

import { normalizeToTree } from '../normalize.js';
import type { BswmdModuleDefLite } from '../normalize.js';

// Loose local input shape — Task 16 (EcuCGenerator) will tighten.
interface EcucInput {
  readonly definitionRef?: string;
  readonly containers?: readonly unknown[];
  readonly parameters?: readonly unknown[];
  readonly references?: readonly {
    readonly path: string;
    readonly targetModule: string;
    readonly targetPath: string;
  }[];
}

const ecucDef: BswmdModuleDefLite = { shortName: 'EcuC' };

const ecucValues: EcucInput = {
  definitionRef: 'EcuC',
  containers: [],
  parameters: [],
  references: [],
};

describe('normalizeToTree', () => {
  it('builds a tree from BSWMD + ECUC values', () => {
    const tree = normalizeToTree(new Map([['EcuC', ecucDef]]), new Map([['EcuC', ecucValues]]));
    expect(tree.bswmdIndex.get('EcuC')).toBe(ecucDef);
    expect(tree.valuesByModule.get('EcuC')).toBe(ecucValues);
    expect(tree.references).toEqual([]);
  });

  it('collects cross-module references', () => {
    const values: EcucInput = {
      ...ecucValues,
      references: [{ path: 'RefToMcuClock', targetModule: 'Mcu', targetPath: 'ClockConfig_0' }],
    };
    const tree = normalizeToTree(
      new Map([
        ['EcuC', ecucDef],
        ['Mcu', { shortName: 'Mcu' }],
      ]),
      new Map([['EcuC', values]]),
    );
    expect(tree.references).toHaveLength(1);
    expect(tree.references[0]?.targetModule).toBe('Mcu');
  });

  it('warns when values reference an unloaded module', () => {
    const values: EcucInput = {
      ...ecucValues,
      references: [{ path: 'RefToMcuClock', targetModule: 'Mcu', targetPath: 'ClockConfig_0' }],
    };
    const tree = normalizeToTree(new Map([['EcuC', ecucDef]]), new Map([['EcuC', values]]));
    // Reference still recorded (target existence check happens in validateReferences)
    expect(tree.references).toHaveLength(1);
  });

  // v1.13.4 PATCH-B (M5) — bswmdParamIndex feeds the real BSWMD
  // shortName + paramConfigClass through the pipeline. Builder keys
  // by Module/Container/Param path so generators can lookup emission
  // metadata without walking nested arrays on every emit.
  it('builds bswmdParamIndex keyed by Module/Container/Param path', () => {
    const defWithContainers = {
      shortName: 'EcuC',
      containers: [
        {
          shortName: 'EcuCGeneral',
          parameters: [
            {
              kind: 'integer',
              shortName: 'ConfigConsistencyHash',
              paramConfigClasses: [
                { configClass: 'PRE-COMPILE', configVariant: 'VARIANT-PRE-COMPILE' },
                { configClass: 'POST-BUILD', configVariant: 'VARIANT-POST-BUILD' },
              ],
            },
          ],
        },
        {
          shortName: 'EcuCPartitionConfig',
          parameters: [
            {
              kind: 'integer',
              shortName: 'EcuC_PartitionConfigId',
              paramConfigClasses: [
                { configClass: 'PRE-COMPILE', configVariant: 'VARIANT-PRE-COMPILE' },
              ],
            },
          ],
        },
      ],
    } as BswmdModuleDefLite;
    const tree = normalizeToTree(
      new Map([['EcuC', defWithContainers]]),
      new Map([['EcuC', ecucValues]]),
    );
    expect(tree.bswmdParamIndex.size).toBe(2);
    expect(
      tree.bswmdParamIndex.get('EcuC/EcuCGeneral/ConfigConsistencyHash')?.shortName,
    ).toBe('ConfigConsistencyHash');
    expect(
      tree.bswmdParamIndex.get('EcuC/EcuCPartitionConfig/EcuC_PartitionConfigId')
        ?.paramConfigClasses,
    ).toEqual([
      { configClass: 'PRE-COMPILE', configVariant: 'VARIANT-PRE-COMPILE' },
    ]);
  });

  it('returns empty bswmdParamIndex when BSWMD has no containers', () => {
    const tree = normalizeToTree(new Map([['EcuC', ecucDef]]), new Map([['EcuC', ecucValues]]));
    expect(tree.bswmdParamIndex.size).toBe(0);
  });
});
