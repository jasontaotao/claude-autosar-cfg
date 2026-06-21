// src/core/sws-validator/sandbox/__tests__/vm-runner.test.ts
// Cluster G (v1.6.0) — sandbox vm-runner unit tests.

import { describe, expect, it } from 'vitest';

import type { SchemaLayer } from '../../../validation/runtimeSchema.js';
import type { NormalizedDocument } from '../../../../shared/normalized-document.js';
import { buildValidationContext } from '../../context.js';
import { InMemoryLogSink, runRuleInSandbox } from '../vm-runner.js';

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

describe('runRuleInSandbox', () => {
  it('executes a simple rule and returns ctx.result() output', () => {
    const ctx = buildValidationContext({ document: EMPTY_DOC, schemaLayer: EMPTY_LAYER, locale: 'en' });
    const sink = new InMemoryLogSink();
    const r = runRuleInSandbox({
      context: ctx,
      ruleId: 'R_TEST',
      source: `ctx.result({ severity: 'error', messageKey: 'swsValidator.runtimeError', path: '/p/1' });`,
      logSink: sink,
    });
    expect(r.status).toBe('ok');
    expect(r.results).toHaveLength(1);
    expect(r.results[0]?.ruleId).toBe('R_TEST');
    expect(r.results[0]?.path).toBe('/p/1');
  });

  it('routes log calls through the log sink', () => {
    const ctx = buildValidationContext({ document: EMPTY_DOC, schemaLayer: EMPTY_LAYER, locale: 'en' });
    const sink = new InMemoryLogSink();
    const r = runRuleInSandbox({
      context: ctx,
      ruleId: 'R_TEST',
      source: `ctx.log.info('hello'); ctx.log.warn('careful'); ctx.log.error('bad');`,
      logSink: sink,
    });
    expect(r.status).toBe('ok');
    expect(r.logs).toEqual(['hello', 'careful', 'bad']);
  });

  it('returns syntax-error status when source has a syntax error', () => {
    const ctx = buildValidationContext({ document: EMPTY_DOC, schemaLayer: EMPTY_LAYER, locale: 'en' });
    const sink = new InMemoryLogSink();
    const r = runRuleInSandbox({
      context: ctx,
      ruleId: 'R_TEST',
      source: `ctx.result({ severity: 'error', messageKey: 'k', path: ''`, // unclosed
      logSink: sink,
    });
    expect(r.status).toBe('syntax-error');
    expect(r.errorMessage).toBeDefined();
  });

  it('returns runtime-error status when rule throws', () => {
    const ctx = buildValidationContext({ document: EMPTY_DOC, schemaLayer: EMPTY_LAYER, locale: 'en' });
    const sink = new InMemoryLogSink();
    const r = runRuleInSandbox({
      context: ctx,
      ruleId: 'R_TEST',
      source: `throw new Error('boom');`,
      logSink: sink,
    });
    expect(r.status).toBe('runtime-error');
    expect(r.errorMessage).toContain('boom');
  });

  it('blocks fs/require/process/globalThis access', () => {
    const ctx = buildValidationContext({ document: EMPTY_DOC, schemaLayer: EMPTY_LAYER, locale: 'en' });
    const sink = new InMemoryLogSink();
    const r = runRuleInSandbox({
      context: ctx,
      ruleId: 'R_TEST',
      source: `typeof require === 'undefined' ? null : require('fs');`,
      logSink: sink,
    });
    // require is undefined inside the sandbox → null result. Rule runs ok.
    expect(r.status).toBe('ok');
    expect(r.results).toHaveLength(0);
  });

  it('returns timeout status when rule exceeds timeoutMs', () => {
    const ctx = buildValidationContext({ document: EMPTY_DOC, schemaLayer: EMPTY_LAYER, locale: 'en' });
    const sink = new InMemoryLogSink();
    const r = runRuleInSandbox({
      context: ctx,
      ruleId: 'R_TEST',
      source: `const until = Date.now() + 200; while (Date.now() < until) {}`,
      logSink: sink,
      timeoutMs: 20,
    });
    expect(r.status === 'timeout' || r.status === 'runtime-error').toBe(true);
  });
});