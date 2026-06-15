// Unit tests for Sprint 8 #1 — `normalizePath` helper.
//
// Sprint 8 closes the cross-fixture VALUE-REF namespace mismatch
// surfaced in Sprint 7 (validate.ts:checkCrossRefs reported 1336
// false-positive cross-ref errors because VALUE-REF targets use
// `/EAS/...` while the path index is built from
// `${AR-PACKAGE > SHORT-NAME}` = `EcucDefs`, so targets become
// `/EcucDefs/...`).
//
// The helper is a pure rewrite of the definition-side prefix to
// the value-side prefix; pass-through for empty / trailing-slash /
// bare-typename / other-prefix inputs so callers (checkCrossRefs /
// isUnsetPlaceholder) keep full control over filtering semantics.

import { describe, it, expect } from 'vitest';

import { normalizePath } from '../index.js';

describe('normalizePath', () => {
  // 1. 主用例 —— /EAS/... → /EcucDefs/...
  it('rewrites /EAS/... to /EcucDefs/...', () => {
    expect(normalizePath('/EAS/Com/ComConfig/ComIPdu')).toBe('/EcucDefs/Com/ComConfig/ComIPdu');
  });

  // 2. idempotent —— 已归一化路径原样返回（防 double-rewrite）
  it('leaves /EcucDefs/... unchanged (idempotent)', () => {
    expect(normalizePath('/EcucDefs/Com/ComConfig/ComIPdu')).toBe(
      '/EcucDefs/Com/ComConfig/ComIPdu',
    );
  });

  // 3. 空字符串原样返回 —— 让 isUnsetPlaceholder 处理
  it('returns empty string unchanged', () => {
    expect(normalizePath('')).toBe('');
  });

  // 4. 其它前缀 + 末尾斜杠不归一化 —— 最小侵入
  it('leaves other-prefixed trailing-slash paths alone', () => {
    expect(normalizePath('/A/M/NotSet/')).toBe('/A/M/NotSet/');
  });

  // 5. 裸类型名（无前导 /）原样返回 —— 让 isUnsetPlaceholder 处理
  it('returns bare typename unchanged (no leading /)', () => {
    expect(normalizePath('PDU-TO-FRAME-MAPPING/')).toBe('PDU-TO-FRAME-MAPPING/');
  });

  // 6. 边界：仅 /EAS（无后续路径段）
  it('rewrites bare /EAS to /EcucDefs', () => {
    expect(normalizePath('/EAS')).toBe('/EcucDefs');
  });

  // 7. 边界：/EAS/ 前缀+斜杠
  it('rewrites /EAS/ to /EcucDefs/', () => {
    expect(normalizePath('/EAS/')).toBe('/EcucDefs/');
  });

  // 8. 防御性：/EASx/...（误用前缀）不改 —— 严格 /EAS 边界匹配
  it('does not match prefix /EASx (only exact /EAS boundary)', () => {
    expect(normalizePath('/EASx/Com/ComConfig/ComIPdu')).toBe('/EASx/Com/ComConfig/ComIPdu');
  });
});
