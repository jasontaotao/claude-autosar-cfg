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
});
