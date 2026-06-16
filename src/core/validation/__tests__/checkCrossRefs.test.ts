// Unit tests for `checkCrossRefs` after the Sprint 9 #4 fallback addition.
//
// Sprint 9 #4 added a `tryResolveByShortName` fallback that runs after
// `pathIndex.has(resolveTargetPath(site.targetPath))` misses. When the
// target's leaf shortName is unique in pathIndex, the site is treated as
// resolved and no error is emitted.
//
// This file locks:
//   1. exact match still works (legacy path)
//   2. shortName-uniqueness fallback resolves branch-mismatch targets
//   3. ambiguous shortName (>1 match) still emits cross-ref error
//   4. missing shortName (0 match) still emits cross-ref error
//   5. paramKey / sourcePath unchanged on the emitted error
//   6. placeholder filtering still happens BEFORE the fallback

import { describe, it, expect } from 'vitest';

import { checkCrossRefs } from '../index.js';
import type { PathIndexEntry, RefSite } from '../types.js';

function entry(kind: 'module' | 'container' | 'reference', path: string): PathIndexEntry {
  return { path, kind, shortName: path.split('/').pop() ?? path };
}

function site(overrides: Partial<RefSite> & { targetPath: string; sourcePath: string }): RefSite {
  return { tagName: 'TEST-REF', ...overrides };
}

describe('checkCrossRefs (Sprint 9 #4 fallback)', () => {
  // 1. exact match (legacy happy path) → no error
  it('passes when targetPath matches pathIndex exactly (no fallback needed)', () => {
    const index = new Map<string, PathIndexEntry>([['/P/X', entry('container', '/P/X')]]);
    const sites = [site({ sourcePath: '/P/A', targetPath: '/P/X' })];
    expect(checkCrossRefs(sites, index)).toEqual([]);
  });

  // 2. fuzzy resolve: leaf unique in pathIndex → no error
  it('resolves a branch-mismatch target whose leaf shortName is unique in pathIndex', () => {
    const index = new Map<string, PathIndexEntry>([
      [
        '/EcucDefs/Com/CanConfigSet/CAN_NetworkTx',
        entry('container', '/EcucDefs/Com/CanConfigSet/CAN_NetworkTx'),
      ],
    ]);
    // target 在 ComConfig/ComIPduGroup 分支(实际元素在 CanConfigSet 分支)
    const sites = [
      site({
        sourcePath: '/P/A',
        targetPath: '/EcucDefs/Com/ComConfig/ComIPduGroup/CAN_NetworkTx',
      }),
    ];
    expect(checkCrossRefs(sites, index)).toEqual([]);
  });

  // 3. ambiguous leaf (2 matches) → emit cross-ref error
  it('emits cross-ref when leaf shortName is ambiguous (2 matches in pathIndex)', () => {
    const index = new Map<string, PathIndexEntry>([
      ['/P/A/Shared', entry('container', '/P/A/Shared')],
      ['/P/B/Shared', entry('container', '/P/B/Shared')],
    ]);
    const sites = [site({ sourcePath: '/P/C', targetPath: '/P/C/Shared' })];
    const errors = checkCrossRefs(sites, index);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.kind).toBe('cross-ref');
    expect(errors[0]?.actual).toBe('/P/C/Shared');
  });

  // 4. missing leaf (0 matches) → emit cross-ref error
  it('emits cross-ref when leaf shortName is not in pathIndex at all', () => {
    const index = new Map<string, PathIndexEntry>([['/P/A/X', entry('container', '/P/A/X')]]);
    const sites = [site({ sourcePath: '/P/B', targetPath: '/P/B/Missing' })];
    const errors = checkCrossRefs(sites, index);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.kind).toBe('cross-ref');
  });

  // 5. emitted error payload unchanged (paramKey, sourcePath, actual = original)
  it('emits cross-ref errors with original targetPath in `actual` and paramKey preserved', () => {
    const index = new Map<string, PathIndexEntry>([['/P/A/X', entry('container', '/P/A/X')]]);
    const sites = [
      site({
        sourcePath: '/P/B/Y',
        targetPath: '/P/B/Missing',
        paramKey: 'MyRef',
      }),
    ];
    const errors = checkCrossRefs(sites, index);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe('/P/B/Y');
    expect(errors[0]?.paramKey).toBe('MyRef');
    expect(errors[0]?.actual).toBe('/P/B/Missing');
  });

  // 6. placeholder (empty / trailing-slash) → skip before fallback runs
  it('skips placeholder targets (empty / trailing-slash) before any lookup', () => {
    const index = new Map<string, PathIndexEntry>([['/P/A/X', entry('container', '/P/A/X')]]);
    const sites = [
      site({ sourcePath: '/P/A', targetPath: '' }),
      site({ sourcePath: '/P/A', targetPath: '/P/A/X/' }),
    ];
    expect(checkCrossRefs(sites, index)).toEqual([]);
  });

  // 7. mixed: exact + fuzzy + ambiguous all in one call → correct classification
  it('classifies exact-match, fuzzy-resolved, and ambiguous sites correctly in one call', () => {
    const index = new Map<string, PathIndexEntry>([
      ['/P/A/Exact', entry('container', '/P/A/Exact')],
      ['/P/A/Unique', entry('container', '/P/A/Unique')],
      ['/P/A/Ambig1', entry('container', '/P/A/Ambig1')],
      ['/P/B/Ambig1', entry('container', '/P/B/Ambig1')],
    ]);
    const sites = [
      site({ sourcePath: '/P/X', targetPath: '/P/A/Exact' }), // exact
      site({ sourcePath: '/P/Y', targetPath: '/P/B/Unique' }), // fuzzy (Unique is unique)
      site({ sourcePath: '/P/Z', targetPath: '/P/C/Ambig1' }), // ambiguous → error
    ];
    const errors = checkCrossRefs(sites, index);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.actual).toBe('/P/C/Ambig1');
  });
});
