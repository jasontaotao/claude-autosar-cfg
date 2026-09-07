import { describe, expect, it } from 'vitest';

import { normalizeCanId } from '../canId.js';

describe('normalizeCanId', () => {
  it('passes through standard-frame ids unchanged', () => {
    expect(normalizeCanId(0x100)).toBe(0x100);
    expect(normalizeCanId(0x7ff)).toBe(0x7ff);
  });

  it('passes through plain 29-bit ids unchanged', () => {
    expect(normalizeCanId(0x1234)).toBe(0x1234);
    expect(normalizeCanId(0x1fffffff)).toBe(0x1fffffff);
  });

  it('strips the Vector bit-31 extended-frame flag', () => {
    expect(normalizeCanId(0x80000123)).toBe(0x123);
    expect(normalizeCanId(0x80000000)).toBe(0);
    expect(normalizeCanId(0x9fffffff)).toBe(0x1fffffff);
  });

  it('leaves a no-flag out-of-range id untouched (caller judges invalid)', () => {
    // 0x20000000 无 bit-31，但超出 29-bit 上界；归一化不吞掉它。
    expect(normalizeCanId(0x20000000)).toBe(0x20000000);
  });

  it('passes negatives through so the caller can flag them invalid', () => {
    // JS 的 & 是有符号 32-bit：负数 bit-31 必置位，剥离会掩成合法 id。
    expect(normalizeCanId(-1)).toBe(-1);
    expect(normalizeCanId(-536870912)).toBe(-536870912);
  });
});
