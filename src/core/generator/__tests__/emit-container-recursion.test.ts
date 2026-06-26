// core/generator/__tests__/emit-container-recursion.test.ts
//
// v1.14.0 MINOR S8 — depth-first pre-order container traversal
// (D-rev2 Senior S8). Real BSWMD nests 2-3 levels deep (e.g. EcuC
// PartitionConfig → PartitionBuffer → PartitionBufferHeader). The
// pre-v1.14.0 emit walk flattened one level and silently dropped the
// inner containers.

import { describe, it, expect } from 'vitest';

import {
  walkContainersWithAncestry,
  type ContainerLike,
} from '../emit/container.js';

describe('walkContainersWithAncestry (no ancestry, leaf-only use case)', () => {
  it('visits every container in pre-order (root → children → grandchildren)', () => {
    const visited: string[] = [];
    walkContainersWithAncestry(
      [
        {
          shortName: 'PartitionConfig',
          parameters: [],
          containers: [
            {
              shortName: 'PartitionBuffer',
              parameters: [],
              containers: [
                {
                  shortName: 'PartitionBufferHeader',
                  parameters: [],
                },
              ],
            },
          ],
        },
      ],
      '',
      (c, _ancestry) => {
        visited.push(c.shortName);
      },
    );
    expect(visited).toEqual([
      'PartitionConfig',
      'PartitionBuffer',
      'PartitionBufferHeader',
    ]);
  });

  it('does not visit siblings of the root', () => {
    const visited: string[] = [];
    walkContainersWithAncestry(
      [
        { shortName: 'A', parameters: [], containers: [] },
        { shortName: 'B', parameters: [], containers: [] },
      ],
      '',
      (c, _ancestry) => {
        visited.push(c.shortName);
      },
    );
    expect(visited).toEqual(['A', 'B']);
  });

  it('returns immediately on empty input', () => {
    const visited: string[] = [];
    walkContainersWithAncestry([], '', (c, _ancestry) => {
      visited.push(c.shortName);
    });
    expect(visited).toEqual([]);
  });

  it('tolerates containers without a containers[] field (flat BSWMD)', () => {
    // Backwards compat: BSWMD that doesn't model nesting (the existing
    // PreCompile/Mixed/Refs fixtures) has no nested containers. The
    // walker must handle missing containers[] gracefully.
    const visited: string[] = [];
    const flat = [
      { shortName: 'EcuCGeneral', parameters: [] },
      { shortName: 'McuClockSettingConfig', parameters: [] },
    ] as ContainerLike[];
    walkContainersWithAncestry(flat, '', (c, _ancestry) => {
      visited.push(c.shortName);
    });
    expect(visited).toEqual(['EcuCGeneral', 'McuClockSettingConfig']);
  });

  it('visits children of multiple branches in order', () => {
    const visited: string[] = [];
    walkContainersWithAncestry(
      [
        {
          shortName: 'A',
          parameters: [],
          containers: [
            { shortName: 'A1', parameters: [] },
            { shortName: 'A2', parameters: [], containers: [{ shortName: 'A2a', parameters: [] }] },
          ],
        },
        { shortName: 'B', parameters: [] },
      ],
      '',
      (c, _ancestry) => {
        visited.push(c.shortName);
      },
    );
    expect(visited).toEqual(['A', 'A1', 'A2', 'A2a', 'B']);
  });
});

describe('walkContainersWithAncestry (v1.14.1 PATCH-G G3)', () => {
  it('threads accumulated parentPath to the visit callback', () => {
    const seen: Array<{ name: string; ancestry: string }> = [];
    walkContainersWithAncestry(
      [
        {
          shortName: 'McuModuleConfiguration',
          parameters: [],
          containers: [
            {
              shortName: 'McuRamSection',
              parameters: [],
              containers: [
                { shortName: 'McuRamSectionBaseAddress', parameters: [] },
              ],
            },
          ],
        },
      ],
      'Mcu', // module shortName as initial parentPath
      (c, ancestry) => {
        seen.push({ name: c.shortName, ancestry });
      },
    );
    expect(seen).toEqual([
      { name: 'McuModuleConfiguration', ancestry: 'Mcu/McuModuleConfiguration' },
      { name: 'McuRamSection', ancestry: 'Mcu/McuModuleConfiguration/McuRamSection' },
      {
        name: 'McuRamSectionBaseAddress',
        ancestry:
          'Mcu/McuModuleConfiguration/McuRamSection/McuRamSectionBaseAddress',
      },
    ]);
  });

  it('returns immediately on empty input', () => {
    const seen: string[] = [];
    walkContainersWithAncestry([], '', (c) => {
      seen.push(c.shortName);
    });
    expect(seen).toEqual([]);
  });

  it('handles empty parentPath (no leading slash on root)', () => {
    const seen: string[] = [];
    walkContainersWithAncestry(
      [{ shortName: 'A', parameters: [] }],
      '',
      (_c, ancestry) => {
        seen.push(ancestry);
      },
    );
    expect(seen).toEqual(['A']);
  });
});