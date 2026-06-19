import { describe, it, expect } from 'vitest';

import { runInSandbox, mapErrorLine } from '../vm-runner.js';
import type { ScriptEntry, ScriptLog, ScriptMutation, ScriptViolation } from '../types.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArxml } from '../../../core/arxml/parser.js';
import type { ArxmlDocument } from '../../../core/arxml/types.js';

function entry(source: string, shortName = 'main'): ScriptEntry {
  return {
    id: 'id',
    name: shortName,
    shortName,
    kind: 'free',
    source,
    imports: [],
    updatedAt: '2026-06-18T00:00:00.000Z',
  };
}

function newCtx(project?: ArxmlDocument) {
  const logs: ScriptLog[] = [];
  const violations: ScriptViolation[] = [];
  const mutations: ScriptMutation[] = [];
  return {
    logs,
    violations,
    mutations,
    options: project !== undefined ? { timeoutMs: 200, project } : { timeoutMs: 200 },
  };
}

// A real project is required to feed the ctx builder.
const COM_PATH = resolve(__dirname, '../../../../tests/fixtures/arxml/Com_Com.arxml');
let project: ArxmlDocument;
{
  const xml = readFileSync(COM_PATH, 'utf8');
  const r = parseArxml(xml);
  if (!r.ok) throw new Error('fixture parse failed');
  project = r.value;
}

describe('runInSandbox', () => {
  it('runs a simple script and returns ok', () => {
    const c = newCtx(project);
    const r = runInSandbox(entry(`ctx.log.info('hi')`), c.logs, c.violations, c.mutations, c.options);
    expect(r.status).toBe('ok');
    expect(c.logs).toHaveLength(1);
    expect(c.logs[0]!.message).toBe('hi');
  });

  it('captures runtime error with line number', () => {
    const c = newCtx(project);
    const r = runInSandbox(entry(`throw new Error('boom')`), c.logs, c.violations, c.mutations, c.options);
    if (r.errorLine === undefined) {
      // Debug aid — V8 stack format may differ across Node versions
      console.log('DEBUG status=', r.status, 'msg=', r.errorMessage);
    }
    expect(r.status).toBe('runtime-error');
    expect(r.errorMessage).toMatch(/boom/);
    expect(r.errorLine).toBeGreaterThan(0);
  });

  it('captures syntax error from parse', () => {
    const c = newCtx(project);
    const r = runInSandbox(entry(`function ( {}`), c.logs, c.violations, c.mutations, c.options);
    expect(r.status).toBe('syntax-error');
    expect(r.errorLine).toBeGreaterThan(0);
  });

  it('marks timedOut when duration exceeds timeoutMs (post-hoc)', () => {
    const c = newCtx(project);
    // Post-hoc timeout: the script eventually returns / V8 hits its
    // own limit. We accept either 'timeout' (our post-hoc flag) or
    // 'runtime-error' (V8 internal interrupt).
    const r = runInSandbox(entry(`while(true){}`), c.logs, c.violations, c.mutations, {
      timeoutMs: 30,
      project,
    });
    expect(['timeout', 'runtime-error']).toContain(r.status);
  });

  it('blocks access to global process', () => {
    const c = newCtx(project);
    const r = runInSandbox(entry(`process.exit(0)`), c.logs, c.violations, c.mutations, c.options);
    expect(r.status).toBe('runtime-error');
  });

  it('blocks require()', () => {
    const c = newCtx(project);
    const r = runInSandbox(entry(`require('fs')`), c.logs, c.violations, c.mutations, c.options);
    expect(r.status).toBe('runtime-error');
  });

  it('blocks fetch()', () => {
    const c = newCtx(project);
    const r = runInSandbox(entry(`fetch('http://x')`), c.logs, c.violations, c.mutations, c.options);
    expect(r.status).toBe('runtime-error');
  });

  it('exposes ctx with whitelisted keys only (5 keys: _import, log, project, utils, validator)', () => {
    const c = newCtx(project);
    const r = runInSandbox(
      entry(`ctx.log.info(Object.keys(ctx).sort().join(','))`),
      c.logs,
      c.violations,
      c.mutations,
      c.options,
    );
    expect(r.status).toBe('ok');
    const log = c.logs[0]!.message;
    expect(log).toBe('_import,log,project,utils,validator');
  });

  it('ctx.log records ts as a number', () => {
    const c = newCtx(project);
    runInSandbox(entry(`ctx.log.info('ts')`), c.logs, c.violations, c.mutations, c.options);
    expect(typeof c.logs[0]!.ts).toBe('number');
  });

  it('runId is a unique, non-empty string', () => {
    const c1 = newCtx(project);
    const c2 = newCtx(project);
    const r1 = runInSandbox(entry(`1`), c1.logs, c1.violations, c1.mutations, c1.options);
    const r2 = runInSandbox(entry(`1`), c2.logs, c2.violations, c2.mutations, c2.options);
    expect(r1.runId).not.toBe(r2.runId);
    expect(r1.runId.length).toBeGreaterThan(0);
  });

  it('records a set-param mutation via ctx.getContainer().getParam().setValue()', () => {
    const c = newCtx(project);
    const src = `
      const c = ctx.project.findContainers({ def: '/ComTxIPdu' })[0];
      const p = c.getParam('ComTxIPduUnusedAreasDefault');
      p.setValue(7);
    `;
    const r = runInSandbox(entry(src), c.logs, c.violations, c.mutations, c.options);
    expect(r.status).toBe('ok');
    expect(c.mutations).toHaveLength(1);
    expect(c.mutations[0]!.kind).toBe('set-param');
  });

  it('validator.addViolation with non-script: kind throws', () => {
    const c = newCtx(project);
    const r = runInSandbox(
      entry(`ctx.validator.addViolation({ kind: 'range', severity: 'error', message: 'oops' })`),
      c.logs,
      c.violations,
      c.mutations,
      c.options,
    );
    expect(r.status).toBe('runtime-error');
  });
});

describe('mapErrorLine', () => {
  it('extracts <anonymous>:N:M from V8 stack', () => {
    const line = mapErrorLine('at script:1:7');
    expect(line).toBe(1);
  });

  it('extracts file:N:M from a file stack line', () => {
    const line = mapErrorLine('at Object.<anonymous> (/path/main.js:5:12)');
    expect(line).toBe(5);
  });

  it('returns undefined for unparseable stack', () => {
    expect(mapErrorLine('')).toBeUndefined();
    expect(mapErrorLine('garbage')).toBeUndefined();
  });
});
