// src/core/sws-validator/__tests__/RuleRegistry.test.ts
// Cluster G (v1.6.0) — RuleRegistry unit tests.

import { describe, expect, it } from 'vitest';

import { RuleRegistry } from '../RuleRegistry.js';
import type { ValidatorRule } from '../types.js';

function fakeRule(id: string): ValidatorRule {
  return {
    id,
    defaultSeverity: 'error',
    messageKey: `swsValidator.${id}.short`,
    check: () => [],
  };
}

describe('RuleRegistry', () => {
  it('registers and returns all rules', () => {
    const reg = new RuleRegistry();
    reg.register(fakeRule('SWS_A'));
    reg.register(fakeRule('SWS_B'));
    expect(reg.size).toBe(2);
    const all = reg.getAll();
    expect(all.map((r) => r.id)).toEqual(['SWS_A', 'SWS_B']);
  });

  it('looks up by id', () => {
    const reg = new RuleRegistry();
    reg.register(fakeRule('SWS_A'));
    expect(reg.getById('SWS_A')?.id).toBe('SWS_A');
    expect(reg.getById('MISSING')).toBeUndefined();
  });

  it('rejects duplicate id with thrown error (per G spec §11 R10)', () => {
    const reg = new RuleRegistry();
    reg.register(fakeRule('SWS_A'));
    expect(() => reg.register(fakeRule('SWS_A'))).toThrow(/duplicate rule id/);
  });

  it('getAll returns a frozen snapshot', () => {
    const reg = new RuleRegistry();
    reg.register(fakeRule('SWS_A'));
    const snap = reg.getAll();
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it('filter returns only rules in the id list, preserving the input order', () => {
    const reg = new RuleRegistry();
    reg.register(fakeRule('SWS_A'));
    reg.register(fakeRule('SWS_B'));
    reg.register(fakeRule('SWS_C'));
    const filtered = reg.filter(['SWS_C', 'SWS_A']);
    expect(filtered.map((r) => r.id)).toEqual(['SWS_C', 'SWS_A']);
  });

  it('filter skips unknown ids silently', () => {
    const reg = new RuleRegistry();
    reg.register(fakeRule('SWS_A'));
    expect(reg.filter(['SWS_A', 'MISSING']).map((r) => r.id)).toEqual(['SWS_A']);
  });
});
