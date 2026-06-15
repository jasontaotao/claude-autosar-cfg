// Unit tests for Sprint 9 #2 — `checkRefDests` target-side reference
// DEST validation.
//
// Complements the existing schema-side `'reference'` kind check at
// validate.ts:walkReference (which compares source's DEST against the
// schema entry's refDest). Sprint 9 #2 adds target-side validation:
// after a cross-ref resolves in pathIndex, the resolved entry's actual
// kind must match what the consumer's DEST attribute declares.
//
// DEST → expected kind mapping (validate.ts:DEST_KIND_MAP):
//   ECUC-CONTAINER-VALUE        → 'container' | 'module'
//   ECUC-REFERENCE-DEF          → 'reference'
//   ECUC-FOREIGN-REFERENCE-DEF  → 'reference'
//   other / undefined targetDest → no rule (skip silently)

import { describe, it, expect } from 'vitest';

import { checkRefDests } from '../index.js';
import type { PathIndexEntry, RefSite } from '../types.js';

// PathIndexEntry helper — sets only the fields checkRefDests reads.
function entry(kind: 'module' | 'container' | 'reference', path: string): PathIndexEntry {
  return { path, kind, shortName: path.split('/').pop() ?? path };
}

function site(overrides: Partial<RefSite> & { targetPath: string; sourcePath: string }): RefSite {
  // RefSite.targetDest is `string | undefined` via `?: string`; with
  // exactOptionalPropertyTypes we must omit the field rather than set
  // it to `undefined` when not provided. Default `tagName` only.
  return {
    tagName: 'TEST-REF',
    ...overrides,
  };
}

describe('checkRefDests', () => {
  // 1. 主用例：ECUC-CONTAINER-VALUE → container，pass
  it('passes when ECUC-CONTAINER-VALUE points at a container', () => {
    const index = new Map([['/P/X', entry('container', '/P/X')]]);
    const sites = [
      site({ sourcePath: '/P/A', targetPath: '/P/X', targetDest: 'ECUC-CONTAINER-VALUE' }),
    ];
    expect(checkRefDests(sites, index)).toEqual([]);
  });

  // 2. mismatch：ECUC-CONTAINER-VALUE → reference，fail
  it('emits ref-dest when ECUC-CONTAINER-VALUE points at a reference element', () => {
    const index = new Map([['/P/X', entry('reference', '/P/X')]]);
    const sites = [
      site({ sourcePath: '/P/A', targetPath: '/P/X', targetDest: 'ECUC-CONTAINER-VALUE' }),
    ];
    const errors = checkRefDests(sites, index);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.kind).toBe('ref-dest');
    expect(errors[0]?.expected).toBe('ECUC-CONTAINER-VALUE');
    expect(errors[0]?.actual).toBe('reference');
  });

  // 3. ECUC-CONTAINER-VALUE → module（保守放过，module 是顶层容器）
  it('passes when ECUC-CONTAINER-VALUE points at a module (container-like)', () => {
    const index = new Map([['/P/M', entry('module', '/P/M')]]);
    const sites = [
      site({ sourcePath: '/P/A', targetPath: '/P/M', targetDest: 'ECUC-CONTAINER-VALUE' }),
    ];
    expect(checkRefDests(sites, index)).toEqual([]);
  });

  // 4. ECUC-REFERENCE-DEF → reference，pass
  it('passes when ECUC-REFERENCE-DEF points at a reference', () => {
    const index = new Map([['/P/X', entry('reference', '/P/X')]]);
    const sites = [
      site({ sourcePath: '/P/A', targetPath: '/P/X', targetDest: 'ECUC-REFERENCE-DEF' }),
    ];
    expect(checkRefDests(sites, index)).toEqual([]);
  });

  // 5. ECUC-REFERENCE-DEF → container，fail
  it('emits ref-dest when ECUC-REFERENCE-DEF points at a container', () => {
    const index = new Map([['/P/X', entry('container', '/P/X')]]);
    const sites = [
      site({ sourcePath: '/P/A', targetPath: '/P/X', targetDest: 'ECUC-REFERENCE-DEF' }),
    ];
    const errors = checkRefDests(sites, index);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.kind).toBe('ref-dest');
  });

  // 6. targetDest undefined → skip
  it('skips sites with undefined targetDest (no rule to check)', () => {
    const index = new Map([['/P/X', entry('container', '/P/X')]]);
    const sites = [site({ sourcePath: '/P/A', targetPath: '/P/X' })]; // targetDest omitted
    expect(checkRefDests(sites, index)).toEqual([]);
  });

  // 7. 未解析 target → skip（checkCrossRefs 会报 cross-ref）
  it('skips unresolved targets (checkCrossRefs owns the cross-ref error)', () => {
    const index = new Map<string, PathIndexEntry>(); // empty
    const sites = [
      site({ sourcePath: '/P/A', targetPath: '/P/MISSING', targetDest: 'ECUC-CONTAINER-VALUE' }),
    ];
    expect(checkRefDests(sites, index)).toEqual([]);
  });

  // 8. 未知 dest 值 → skip（无规则不报错）
  it('skips sites with a dest value not in the mapping (no rule)', () => {
    const index = new Map([['/P/X', entry('container', '/P/X')]]);
    const sites = [
      site({ sourcePath: '/P/A', targetPath: '/P/X', targetDest: 'ECUC-INTEGER-PARAM-DEF' }),
    ];
    expect(checkRefDests(sites, index)).toEqual([]);
  });

  // 9. ECUC-FOREIGN-REFERENCE-DEF → reference，pass
  it('passes when ECUC-FOREIGN-REFERENCE-DEF points at a reference', () => {
    const index = new Map([['/P/X', entry('reference', '/P/X')]]);
    const sites = [
      site({ sourcePath: '/P/A', targetPath: '/P/X', targetDest: 'ECUC-FOREIGN-REFERENCE-DEF' }),
    ];
    expect(checkRefDests(sites, index)).toEqual([]);
  });

  // 10. ECUC-FOREIGN-REFERENCE-DEF → container，fail
  it('emits ref-dest when ECUC-FOREIGN-REFERENCE-DEF points at a container', () => {
    const index = new Map([['/P/X', entry('container', '/P/X')]]);
    const sites = [
      site({ sourcePath: '/P/A', targetPath: '/P/X', targetDest: 'ECUC-FOREIGN-REFERENCE-DEF' }),
    ];
    const errors = checkRefDests(sites, index);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.kind).toBe('ref-dest');
    expect(errors[0]?.expected).toBe('ECUC-FOREIGN-REFERENCE-DEF');
  });

  // 额外：error payload 字段完整性
  it('ref-dest error carries path, paramKey, message, expected, actual', () => {
    const index = new Map([['/P/X', entry('reference', '/P/X')]]);
    const sites = [
      site({
        sourcePath: '/P/A',
        targetPath: '/P/X',
        targetDest: 'ECUC-CONTAINER-VALUE',
        paramKey: 'MyRef',
        tagName: 'MY-REF-PARAM',
      }),
    ];
    const errors = checkRefDests(sites, index);
    expect(errors[0]).toMatchObject({
      kind: 'ref-dest',
      path: '/P/A',
      paramKey: 'MyRef',
      expected: 'ECUC-CONTAINER-VALUE',
      actual: 'reference',
    });
    expect(errors[0]?.message).toContain('ECUC-CONTAINER-VALUE');
    expect(errors[0]?.message).toContain('reference');
  });

  // 额外：paramKey 缺省时仍然出 error 但 paramKey 字段为 undefined
  it('omits paramKey on ref-dest error when site has no paramKey (ArxmlReference elements)', () => {
    const index = new Map([['/P/X', entry('reference', '/P/X')]]);
    const sites = [
      site({
        sourcePath: '/P/A',
        targetPath: '/P/X',
        targetDest: 'ECUC-CONTAINER-VALUE',
        tagName: 'MY-REF-ELEMENT',
      }),
    ];
    const errors = checkRefDests(sites, index);
    expect(errors[0]?.paramKey).toBeUndefined();
  });

  // 额外：placeholder 跳过
  it('skips trailing-slash placeholder targets (required check owns those)', () => {
    const index = new Map<string, PathIndexEntry>();
    const sites = [
      site({ sourcePath: '/P/A', targetPath: '/P/MISSING/', targetDest: 'ECUC-CONTAINER-VALUE' }),
    ];
    expect(checkRefDests(sites, index)).toEqual([]);
  });

  // 额外：path normalization 串联（type 段 / namespace）
  it('applies namespace + type-segment normalization when resolving the target', () => {
    // 路径在 pathIndex 中已 strip 掉 type 段，target 是 schema-side 形态
    const index = new Map([
      ['/EcucDefs/Com/ComConfig/X', entry('container', '/EcucDefs/Com/ComConfig/X')],
    ]);
    const sites = [
      site({
        sourcePath: '/EcucDefs/Com/CanConfigSet/Y',
        targetPath: '/EAS/Com/ComConfig/ComIPdu/X', // /EAS + ComIPdu 都需要归一化
        targetDest: 'ECUC-CONTAINER-VALUE',
      }),
    ];
    expect(checkRefDests(sites, index)).toEqual([]);
  });
});
