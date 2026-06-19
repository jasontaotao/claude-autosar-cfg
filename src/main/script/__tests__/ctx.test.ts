import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseArxml } from '../../../core/arxml/parser.js';
import { buildScriptCtx } from '../ctx.js';
import type { ScriptLog, ScriptViolation, ScriptMutation } from '../types.js';
import type { ArxmlDocument } from '../../../core/arxml/types.js';

const COM_PATH = resolve(__dirname, '../../../../tests/fixtures/arxml/Com_Com.arxml');

let project: ArxmlDocument;

beforeAll(() => {
  const xml = readFileSync(COM_PATH, 'utf8');
  const r = parseArxml(xml);
  if (!r.ok) throw new Error(`fixture parse failed: ${r.error}`);
  project = r.value;
});

function newRun() {
  const logs: ScriptLog[] = [];
  const violations: ScriptViolation[] = [];
  const mutations: ScriptMutation[] = [];
  const ctx = buildScriptCtx({
    project,
    onLog: (l) => logs.push(l),
    onViolation: (v) => violations.push(v),
    onMutation: (m) => mutations.push(m),
  });
  return { ctx, logs, violations, mutations };
}

// ---------------------------------------------------------------------------
// project.findContainers
// ---------------------------------------------------------------------------

describe('ctx.project.findContainers', () => {
  it('finds all ComTxIPdu containers by shortName match (def matches end-of-path)', () => {
    const { ctx } = newRun();
    // The Com_Com fixture has a Com module with CanConfigSet containing
    // many ComTxIPdu containers. The container def is the path inside
    // the doc tree (e.g. /EcucDefs/Com/CanConfigSet/.../ComTxIPdu).
    const ipdus = ctx.project.findContainers({ def: '/ComTxIPdu' });
    if (ipdus.length === 0) {
      // debug
      const idx = ctx.project.buildPathIndex();
      console.log('PATH INDEX size:', idx.size);
      for (const [k, v] of idx) {
        if (v.shortName === 'ComTxIPdu' || v.path.includes('ComTxIPdu')) {
          console.log('  CANDIDATE:', k, 'shortName=', v.shortName);
        }
      }
    }
    expect(ipdus.length).toBeGreaterThan(0);
    for (const c of ipdus) {
      expect(c.shortName).toBe('ComTxIPdu');
    }
  });

  it('returns empty when def not present', () => {
    const { ctx } = newRun();
    expect(ctx.project.findContainers({ def: '/No/Module/Path' })).toEqual([]);
  });

  it('respects predicate filter', () => {
    const { ctx } = newRun();
    const ipdus = ctx.project.findContainers({
      def: '/ComTxIPdu',
      predicate: (c) => {
        const p = c.getParam('ComTxIPduUnusedAreasDefault');
        return p !== null && p.asInteger() >= 0;
      },
    });
    expect(ipdus.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// getContainer + getParam
// ---------------------------------------------------------------------------

describe('ctx.getContainer + getParam', () => {
  it('reads ComTxIPduUnusedAreasDefault integer param on a ComTxIPdu', () => {
    const { ctx } = newRun();
    const ipdus = ctx.project.findContainers({ def: '/ComTxIPdu' });
    const first = ipdus[0]!;
    // Com_Com fixture's ComTxIPdu containers carry:
    //   ComMinimumDelayTime (float)
    //   ComTxIPduUnusedAreasDefault (integer)
    //   ComTxIPduClearUpdateBit (enum)
    // We use the integer one for setValue / type-mismatch checks.
    const p = first.getParam('ComTxIPduUnusedAreasDefault');
    if (p === null) {
      console.log('DEBUG first.shortName=', first.shortName, 'first.def=', first.def);
      console.log('DEBUG first.params=', first.params.map((x) => `${x.name}:${x.type}`).join(','));
    }
    expect(p).not.toBeNull();
    expect(p!.asInteger()).toBeGreaterThanOrEqual(0);
  });

  it('setValue records a set-param mutation', () => {
    const { ctx, mutations } = newRun();
    const ipdus = ctx.project.findContainers({ def: '/ComTxIPdu' });
    const first = ipdus[0]!;
    const p = first.getParam('ComTxIPduUnusedAreasDefault')!;
    p.setValue(999);
    expect(mutations).toHaveLength(1);
    expect(mutations[0]!.kind).toBe('set-param');
    if (mutations[0]!.kind === 'set-param') {
      expect(mutations[0]!.newValue).toBe(999);
      expect(mutations[0]!.paramName).toBe('ComTxIPduUnusedAreasDefault');
    }
  });

  it('setValue throws on type mismatch (integer param given a string)', () => {
    const { ctx } = newRun();
    const ipdus = ctx.project.findContainers({ def: '/ComTxIPdu' });
    const p = ipdus[0]!.getParam('ComTxIPduUnusedAreasDefault')!;
    expect(() => p.setValue('not-a-number' as never)).toThrow();
  });

  it('getContainer(path) returns null for unknown path', () => {
    const { ctx } = newRun();
    expect(ctx.project.getContainer('/__no_such__')).toBeNull();
  });

  it('addChild records add-child mutation and returns a wrapper', () => {
    const { ctx, mutations } = newRun();
    const ipdus = ctx.project.findContainers({ def: '/ComTxIPdu' });
    const first = ipdus[0]!;
    const newChild = first.addChild('newChild123');
    expect(newChild.shortName).toBe('newChild123');
    expect(mutations).toHaveLength(1);
    expect(mutations[0]!.kind).toBe('add-child');
  });

  it('removeChild records remove-child mutation', () => {
    const { ctx, mutations } = newRun();
    const ipdus = ctx.project.findContainers({ def: '/ComTxIPdu' });
    const first = ipdus[0]!;
    expect(first.removeChild('nope')).toBe(true);
    expect(mutations).toHaveLength(1);
    expect(mutations[0]!.kind).toBe('remove-child');
  });
});

// ---------------------------------------------------------------------------
// validator
// ---------------------------------------------------------------------------

describe('ctx.validator.addViolation', () => {
  it('records violation with script: prefix', () => {
    const { ctx, violations } = newRun();
    ctx.validator.addViolation({
      kind: 'script:pduid-duplicate',
      severity: 'error',
      containerPath: '/Com/ComConfig/ComIPdu[0]',
      message: 'duplicate',
    });
    expect(violations).toHaveLength(1);
    expect(violations[0]!.kind).toMatch(/^script:/);
  });

  it('rejects kind without script: prefix', () => {
    const { ctx } = newRun();
    expect(() =>
      ctx.validator.addViolation({
        kind: 'range' as never,
        severity: 'error',
        message: 'oops',
      }),
    ).toThrow(/script:/);
  });
});

// ---------------------------------------------------------------------------
// log
// ---------------------------------------------------------------------------

describe('ctx.log', () => {
  it('info/warn/error/debug all emit to onLog', () => {
    const { ctx, logs } = newRun();
    ctx.log.info('a');
    ctx.log.warn('b');
    ctx.log.error('c');
    ctx.log.debug('d');
    expect(logs.map((l) => l.level)).toEqual(['info', 'warn', 'error', 'debug']);
    expect(logs.map((l) => l.message)).toEqual(['a', 'b', 'c', 'd']);
    expect(typeof logs[0]!.ts).toBe('number');
  });

  it('non-string message throws (defensive)', () => {
    const { ctx } = newRun();
    expect(() => (ctx.log.info as unknown as (m: unknown) => void)(123)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// utils
// ---------------------------------------------------------------------------

describe('ctx.utils', () => {
  it('path.join composes paths', () => {
    const { ctx } = newRun();
    expect(ctx.utils.path.join('a', 'b', 'c')).toBe('a/b/c');
  });

  it('path.split / basename work', () => {
    const { ctx } = newRun();
    expect(ctx.utils.path.split('a/b/c')).toEqual(['a', 'b', 'c']);
    expect(ctx.utils.path.basename('a/b/c.arxml')).toBe('c.arxml');
  });

  it('now returns ISO string', () => {
    const { ctx } = newRun();
    expect(ctx.utils.now()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('assert throws on falsy with given message', () => {
    const { ctx } = newRun();
    expect(() => ctx.utils.assert(false, 'bad')).toThrow('bad');
    expect(() => ctx.utils.assert(true, 'ok')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// _import — internal hook (populated by vm-runner)
// ---------------------------------------------------------------------------

describe('ctx._import', () => {
  it('throws by default (not yet populated by vm-runner)', () => {
    const { ctx } = newRun();
    expect(() => ctx._import('./missing')).toThrow();
  });
});
