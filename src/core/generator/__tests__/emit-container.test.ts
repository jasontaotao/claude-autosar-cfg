import { describe, it, expect } from 'vitest';
import {
  sortByIndex,
  emitContainerDecl,
  type ContainerInstance,
} from '../emit/container.js';
import type { BswmdParamDef } from '../handlebars-helpers.js';

describe('sortByIndex', () => {
  it('sorts by INDEX attribute ascending', () => {
    const insts: ContainerInstance[] = [
      { shortName: 'b', index: 2 },
      { shortName: 'a', index: 1 },
      { shortName: 'c', index: 3 },
    ];
    const sorted = sortByIndex(insts);
    expect(sorted.map(i => i.shortName)).toEqual(['a', 'b', 'c']);
  });

  it('falls back to shortName lexical when INDEX absent', () => {
    const insts: ContainerInstance[] = [
      { shortName: 'b' },
      { shortName: 'a' },
      { shortName: 'c' },
    ];
    const sorted = sortByIndex(insts);
    expect(sorted.map(i => i.shortName)).toEqual(['a', 'b', 'c']);
  });

  it('handles mixed INDEX/no-INDEX: indexed first, then lexical', () => {
    const insts: ContainerInstance[] = [
      { shortName: 'no-index-1' },
      { shortName: 'indexed-2', index: 2 },
      { shortName: 'indexed-1', index: 1 },
      { shortName: 'no-index-2' },
    ];
    const sorted = sortByIndex(insts);
    // indexed-1, indexed-2 (by index), then no-index-1, no-index-2 (by shortName)
    expect(sorted.map(i => i.shortName)).toEqual([
      'indexed-1',
      'indexed-2',
      'no-index-1',
      'no-index-2',
    ]);
  });
});

describe('emitContainerDecl', () => {
  it('emits typedef struct with all params', () => {
    const def: BswmdParamDef[] = [
      { kind: 'integer', min: 0, max: 65535 } as BswmdParamDef,
      { kind: 'boolean' } as BswmdParamDef,
    ];
    const s = emitContainerDecl({
      typeName: 'EcuC_PartitionConfigType',
      paramDefs: def,
    });
    expect(s).toContain('typedef struct {');
    expect(s).toContain('uint16 EcuC_PartitionConfig_0;');
    expect(s).toContain('uint8 EcuC_PartitionConfig_1;');
    expect(s).toContain('} EcuC_PartitionConfigType;');
  });
});
