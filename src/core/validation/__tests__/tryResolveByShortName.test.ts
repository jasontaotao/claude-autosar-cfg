// Unit tests for Sprint 9 #4 — `tryResolveByShortName` fallback resolver.
//
// Cross-ref strict-lookup fallback used in `checkCrossRefs` after
// `pathIndex.has(resolveTargetPath(site.targetPath))` misses. Closes
// branch-mismatch cases like:
//   target: /EcucDefs/Com/ComConfig/ComIPduGroup/CAN_NetworkTx
//   actual: /EcucDefs/Com/CanConfigSet/CAN_NetworkTx
//   leaf:   CAN_NetworkTx
// If exactly 1 entry in pathIndex has the leaf shortName, the helper
// returns it (the caller's "found" path); if 0 or ≥2, returns undefined
// (caller still emits a cross-ref error).
//
// Helper contract:
//   pure / side-effect-free / immutable
//   input:  already-resolveTargetPath-ed path string + pathIndex map
//   output: PathIndexEntry | undefined
//   empty / 0-leaf paths → undefined
//   case-sensitive: 'CanX' ≠ 'canx'

import { describe, it, expect } from 'vitest';

import { buildShortNameIndex, tryResolveByShortName } from '../index.js';
import type { PathIndexEntry } from '../types.js';

function entry(kind: 'module' | 'container' | 'reference', path: string): PathIndexEntry {
  return { path, kind, shortName: path.split('/').pop() ?? path };
}

describe('tryResolveByShortName', () => {
  // 1. 主用例：leaf 在 pathIndex 中有 1 个匹配 → 返回该 entry
  it('resolves a path whose leaf shortName is unique in pathIndex', () => {
    const index = new Map<string, PathIndexEntry>([
      [
        '/EcucDefs/Com/CanConfigSet/CAN_NetworkTx',
        entry('container', '/EcucDefs/Com/CanConfigSet/CAN_NetworkTx'),
      ],
    ]);
    // 输入路径来自 fixture 原貌(branch 错),但 leaf shortName 唯一
    const result = tryResolveByShortName(
      '/EcucDefs/Com/ComConfig/ComIPduGroup/CAN_NetworkTx',
      index,
    );
    expect(result).toBeDefined();
    expect(result?.path).toBe('/EcucDefs/Com/CanConfigSet/CAN_NetworkTx');
    expect(result?.shortName).toBe('CAN_NetworkTx');
    expect(result?.kind).toBe('container');
  });

  // 2. leaf 0 匹配 → undefined
  it('returns undefined when the leaf shortName is not in pathIndex', () => {
    const index = new Map<string, PathIndexEntry>([
      [
        '/EcucDefs/Com/CanConfigSet/CAN_NetworkTx',
        entry('container', '/EcucDefs/Com/CanConfigSet/CAN_NetworkTx'),
      ],
    ]);
    expect(tryResolveByShortName('/EcucDefs/Com/ComConfig/Missing', index)).toBeUndefined();
  });

  // 3. leaf ≥2 匹配(ambiguous)→ undefined(避免误报)
  it('returns undefined when the leaf shortName is ambiguous (≥2 matches)', () => {
    const index = new Map<string, PathIndexEntry>([
      ['/P/A/Shared', entry('container', '/P/A/Shared')],
      ['/P/B/Shared', entry('container', '/P/B/Shared')],
    ]);
    expect(tryResolveByShortName('/P/C/Shared', index)).toBeUndefined();
  });

  // 4. leaf 3 匹配(深度 ambiguous)→ undefined
  it('returns undefined when the leaf shortName has 3+ matches', () => {
    const index = new Map<string, PathIndexEntry>([
      ['/P/A/X', entry('container', '/P/A/X')],
      ['/P/B/X', entry('container', '/P/B/X')],
      ['/P/C/X', entry('container', '/P/C/X')],
    ]);
    expect(tryResolveByShortName('/P/D/X', index)).toBeUndefined();
  });

  // 5. 空 path → undefined(placeholder 由 caller 处理,这里只兜底)
  it('returns undefined for empty path', () => {
    const index = new Map<string, PathIndexEntry>([['/P/A', entry('container', '/P/A')]]);
    expect(tryResolveByShortName('', index)).toBeUndefined();
  });

  // 6. 只有 1 段:split('/').filter(Boolean).pop() 仍返回该段
  // 1-segment path: split('/').filter(Boolean).pop() still returns that segment
  it('resolves a 1-segment path when the segment is in pathIndex', () => {
    const index = new Map<string, PathIndexEntry>([['/leaf', entry('container', '/leaf')]]);
    const result = tryResolveByShortName('/leaf', index);
    expect(result).toBeDefined();
    expect(result?.shortName).toBe('leaf');
  });

  // 7. trailing slash 形态 → leaf 段是 '' → 0 匹配
  it('returns undefined for trailing-slash path (empty leaf segment)', () => {
    const index = new Map<string, PathIndexEntry>([['/P/A', entry('container', '/P/A')]]);
    expect(tryResolveByShortName('/P/A/', index)).toBeUndefined();
  });

  // 8. case-sensitive: 'canX' ≠ 'CanX' → undefined
  it('is case-sensitive: "canX" does not match "CanX"', () => {
    const index = new Map<string, PathIndexEntry>([['/P/A/CanX', entry('container', '/P/A/CanX')]]);
    expect(tryResolveByShortName('/P/B/canX', index)).toBeUndefined();
  });

  // 9. 同一 prefix 下的不同分支(同 module / 不同 container)→ 1 匹配 → resolve
  it('resolves a sibling-branch target (same module, different container)', () => {
    const index = new Map<string, PathIndexEntry>([
      [
        '/EcucDefs/Com/CanConfigSet/CAN_NetworkTx',
        entry('container', '/EcucDefs/Com/CanConfigSet/CAN_NetworkTx'),
      ],
      ['/EcucDefs/Com/ComConfig/ComIPdu', entry('container', '/EcucDefs/Com/ComConfig/ComIPdu')],
    ]);
    const result = tryResolveByShortName(
      '/EcucDefs/Com/ComConfig/ComIPduGroup/CAN_NetworkTx',
      index,
    );
    expect(result?.path).toBe('/EcucDefs/Com/CanConfigSet/CAN_NetworkTx');
  });

  // 10. pathIndex 为空 → undefined
  it('returns undefined for an empty pathIndex', () => {
    expect(tryResolveByShortName('/P/A/X', new Map())).toBeUndefined();
  });

  // 11. path 中含数字 leaf → 正常匹配
  it('matches numeric-leaf shortNames like "Pdu_42"', () => {
    const index = new Map<string, PathIndexEntry>([
      ['/P/A/Pdu_42', entry('container', '/P/A/Pdu_42')],
    ]);
    const result = tryResolveByShortName('/P/B/Pdu_42', index);
    expect(result?.path).toBe('/P/A/Pdu_42');
  });

  // 12. 同一 shortName 在 2 个不同 kind 的 entry 中(混合 module+container)→ 仍 ambiguous
  it('treats mixed-kind duplicates as ambiguous (not auto-resolvable)', () => {
    const index = new Map<string, PathIndexEntry>([
      ['/P/A/Foo', entry('module', '/P/A/Foo')],
      ['/P/B/Foo', entry('container', '/P/B/Foo')],
    ]);
    expect(tryResolveByShortName('/P/C/Foo', index)).toBeUndefined();
  });

  // 13. 大 pathIndex perf sanity:1000 entries 全 unique,1 match 在末尾
  it('handles a 1000-entry pathIndex in O(n) build + O(1) lookup', () => {
    const index = new Map<string, PathIndexEntry>();
    for (let i = 0; i < 1000; i++) {
      const p = `/P/A/Entry_${i}`;
      index.set(p, entry('container', p));
    }
    const start = performance.now();
    const result = tryResolveByShortName('/P/B/Entry_999', index);
    const elapsed = performance.now() - start;
    expect(result?.path).toBe('/P/A/Entry_999');
    // Loose sanity: helper should be sub-millisecond even with 1000 entries.
    // (Actual time depends on machine; 50ms is a generous upper bound for the
    // single Map.get call after index build.)
    expect(elapsed).toBeLessThan(50);
  });

  // 14. leaf 命中,但 path 的 prefix 跟 entry 完全不同(跨 module)→ 仍 resolve
  it('resolves across modules when leaf shortName is unique globally', () => {
    const index = new Map<string, PathIndexEntry>([
      [
        '/EcucDefs/Det/DetGeneral/SomeFlag',
        entry('container', '/EcucDefs/Det/DetGeneral/SomeFlag'),
      ],
    ]);
    // target 在 Com module,actual 唯一存在于 Det module
    const result = tryResolveByShortName('/EcucDefs/Com/ComConfig/SomeFlag', index);
    expect(result?.path).toBe('/EcucDefs/Det/DetGeneral/SomeFlag');
  });

  // 15. 输入路径有连续斜杠(`/P//A`)→ filter Boolean 后只取非空段
  it('treats consecutive slashes as single-segment separators', () => {
    const index = new Map<string, PathIndexEntry>([['/P/A/X', entry('container', '/P/A/X')]]);
    const result = tryResolveByShortName('/P//A/X', index);
    expect(result?.path).toBe('/P/A/X');
  });
});

describe('buildShortNameIndex', () => {
  // Direct tests for the lower-level helper (Sprint 9 #4 review LOW-3):
  // pins the reverse-index contract that `tryResolveByShortName` /
  // `tryResolveByShortNameWithIndex` and `checkCrossRefs` rely on.

  it('returns an empty map for an empty pathIndex', () => {
    const result = buildShortNameIndex(new Map());
    expect(result.size).toBe(0);
  });

  it('groups entries by their shortName, preserving input insertion order', () => {
    const a = entry('container', '/P/A/X');
    const b = entry('container', '/P/B/X');
    const c = entry('container', '/P/C/Y');
    const index = new Map<string, PathIndexEntry>([
      ['/P/A/X', a],
      ['/P/B/X', b],
      ['/P/C/Y', c],
    ]);
    const result = buildShortNameIndex(index);
    expect(result.size).toBe(2);
    expect(result.get('X')).toEqual([a, b]);
    expect(result.get('Y')).toEqual([c]);
  });

  it('returns the same entry references (no defensive copy of PathIndexEntry)', () => {
    const a = entry('module', '/P/A/Foo');
    const index = new Map<string, PathIndexEntry>([['/P/A/Foo', a]]);
    const result = buildShortNameIndex(index);
    const arr = result.get('Foo');
    expect(arr).toBeDefined();
    expect(arr?.[0]).toBe(a); // same reference, not a clone
  });
});
