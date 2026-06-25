// core/generator/__tests__/emit-container-recursion.test.ts
//
// v1.14.0 MINOR S8 — depth-first pre-order container traversal
// (D-rev2 Senior S8). Real BSWMD nests 2-3 levels deep (e.g. EcuC
// PartitionConfig → PartitionBuffer → PartitionBufferHeader). The
// pre-v1.14.0 emit walk flattened one level and silently dropped the
// inner containers.

import { describe, it, expect } from 'vitest';

import { walkContainers, type ContainerLike } from '../emit/container.js';

describe('walkContainers (D-rev2 S8)', () => {
  it('visits every container in pre-order (root → children → grandchildren)', () => {
    const visited: string[] = [];
    walkContainers(
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
      (c) => {
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
    walkContainers(
      [
        { shortName: 'A', parameters: [], containers: [] },
        { shortName: 'B', parameters: [], containers: [] },
      ],
      (c) => {
        visited.push(c.shortName);
      },
    );
    expect(visited).toEqual(['A', 'B']);
  });

  it('returns immediately on empty input', () => {
    const visited: string[] = [];
    walkContainers([], (c) => {
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
    walkContainers(flat, (c) => {
      visited.push(c.shortName);
    });
    expect(visited).toEqual(['EcuCGeneral', 'McuClockSettingConfig']);
  });

  it('visits children of multiple branches in order', () => {
    const visited: string[] = [];
    walkContainers(
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
      (c) => {
        visited.push(c.shortName);
      },
    );
    expect(visited).toEqual(['A', 'A1', 'A2', 'A2a', 'B']);
  });
});