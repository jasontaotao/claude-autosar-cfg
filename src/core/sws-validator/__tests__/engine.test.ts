// src/core/sws-validator/__tests__/engine.test.ts
// Cluster G (v1.6.0) — Engine unit tests.
//
// Covers:
//   - empty registry returns empty results
//   - single rule invocation
//   - multi-rule aggregation + sort by severity
//   - severity floor filtering
//   - tour-pause silent skip (G spec §3.9)
//   - rule that throws → synthetic error result
//   - timeout post-hoc marker

import { describe, expect, it } from 'vitest';

import type { NormalizedDocument } from '../../../shared/normalized-document.js';
import type { SchemaLayer } from '../../validation/runtimeSchema.js';
import { RuleRegistry } from '../RuleRegistry.js';
import { runValidation } from '../engine.js';
import type { InternalValidatorResult, RunInput, ValidatorRule } from '../types.js';

const EMPTY_DOC: NormalizedDocument = {
  version: '4.2',
  packages: [],
  modules: [],
  references: [],
  sourceOrder: [],
  origin: 'dom',
};

const EMPTY_LAYER: SchemaLayer = {
  params: new Map(),
  containers: new Map(),
  sourcePaths: new Set(),
  moduleRoots: [],
};

function fakeRule(
  id: string,
  results: readonly InternalValidatorResult[] = [],
  opts?: { throw?: Error; slow?: boolean },
): ValidatorRule {
  return {
    id,
    defaultSeverity: 'error',
    messageKey: `swsValidator.${id}.short`,
    check: () => {
      if (opts?.throw) throw opts.throw;
      if (opts?.slow) {
        const until = Date.now() + 100;
        while (Date.now() < until) {
          /* busy-wait */
        }
      }
      return results;
    },
  };
}

const RUN_INPUT: RunInput = { document: EMPTY_DOC, schemaLayer: EMPTY_LAYER };

describe('runValidation', () => {
  it('returns empty results when registry has no rules', async () => {
    const reg = new RuleRegistry();
    const r = await runValidation(reg, RUN_INPUT);
    expect(r.results).toEqual([]);
    expect(r.rulesRun).toBe(0);
    expect(r.rulesSkipped).toBe(0);
    expect(r.timedOut).toEqual([]);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('invokes a single rule and returns its results', async () => {
    const reg = new RuleRegistry();
    reg.register(
      fakeRule('R1', [
        { ruleId: 'R1', severity: 'error', messageKey: 'swsValidator.runtimeError', path: '/p/1' },
      ]),
    );
    const r = await runValidation(reg, RUN_INPUT);
    expect(r.results).toHaveLength(1);
    expect(r.results[0]?.ruleId).toBe('R1');
    expect(r.rulesRun).toBe(1);
  });

  it('aggregates multiple rules and sorts by severity then path', async () => {
    const reg = new RuleRegistry();
    reg.register(
      fakeRule('R1', [
        { ruleId: 'R1', severity: 'warning', messageKey: 'swsValidator.runtimeError', path: '/b' },
      ]),
    );
    reg.register(
      fakeRule('R2', [
        { ruleId: 'R2', severity: 'error', messageKey: 'swsValidator.runtimeError', path: '/a' },
        { ruleId: 'R2', severity: 'info', messageKey: 'swsValidator.runtimeError', path: '/c' },
      ]),
    );
    const r = await runValidation(reg, RUN_INPUT);
    // Sort: errors first, then warnings, then info. Within same severity, by path.
    expect(r.results.map((x) => `${x.severity}:${x.path}`)).toEqual([
      'error:/a',
      'warning:/b',
      'info:/c',
    ]);
  });

  it('filters by severity floor (warning excludes info)', async () => {
    const reg = new RuleRegistry();
    reg.register(
      fakeRule('R1', [
        { ruleId: 'R1', severity: 'error', messageKey: 'swsValidator.runtimeError', path: '/e' },
        { ruleId: 'R1', severity: 'warning', messageKey: 'swsValidator.runtimeError', path: '/w' },
        { ruleId: 'R1', severity: 'info', messageKey: 'swsValidator.runtimeError', path: '/i' },
      ]),
    );
    const r = await runValidation(reg, RUN_INPUT, { severityFloor: 'warning' });
    expect(r.results.map((x) => x.severity)).toEqual(['error', 'warning']);
  });

  it('skips rules not in ruleIds filter and counts them as skipped', async () => {
    const reg = new RuleRegistry();
    reg.register(fakeRule('R1'));
    reg.register(fakeRule('R2'));
    const r = await runValidation(reg, RUN_INPUT, { ruleIds: ['R1'] });
    expect(r.rulesRun).toBe(1);
    expect(r.rulesSkipped).toBe(1);
  });

  it('silently returns [] when tourState.validationPaused === true (G spec §3.9)', async () => {
    const reg = new RuleRegistry();
    reg.register(
      fakeRule('R1', [{ ruleId: 'R1', severity: 'error', messageKey: 'k', path: '/p' }]),
    );
    const r = await runValidation(reg, RUN_INPUT, {
      tourState: { validationPaused: true },
    });
    expect(r.results).toEqual([]);
    expect(r.rulesRun).toBe(0);
    expect(r.rulesSkipped).toBe(1);
  });

  it('emits a synthetic error result when a rule throws (G spec §7.1)', async () => {
    const reg = new RuleRegistry();
    reg.register(fakeRule('R1', [], { throw: new Error('boom') }));
    const r = await runValidation(reg, RUN_INPUT);
    expect(r.results).toHaveLength(1);
    expect(r.results[0]?.ruleId).toBe('R1');
    expect(r.results[0]?.severity).toBe('error');
    expect(r.results[0]?.messageKey).toBe('swsValidator.runtimeError');
    expect(r.results[0]?.messageVars?.['message']).toBe('boom');
  });

  it('marks a slow rule as timed out when it exceeds timeoutMsPerRule', async () => {
    const reg = new RuleRegistry();
    reg.register(fakeRule('R1', [], { slow: true }));
    const r = await runValidation(reg, RUN_INPUT, { timeoutMsPerRule: 10 });
    expect(r.timedOut).toContain('R1');
  });
});
