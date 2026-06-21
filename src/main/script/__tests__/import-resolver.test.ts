import { describe, it, expect } from 'vitest';

import { classScriptError, ScriptError } from '../errors.js';
import { resolveImports, parseImports, detectCycles, hasExport } from '../import-resolver.js';
import type { ScriptEntry } from '../types.js';

function entry(
  shortName: string,
  source: string,
  imports: ScriptEntry['imports'] = [],
): ScriptEntry {
  return {
    id: `id-${shortName}`,
    name: shortName,
    shortName,
    kind: 'free',
    source,
    imports,
    updatedAt: '2026-06-18T00:00:00.000Z',
  };
}

// ---------------------------------------------------------------------------
// parseImports
// ---------------------------------------------------------------------------

describe('parseImports', () => {
  it('extracts single named import', () => {
    expect(parseImports(`import { foo } from './a'`)).toEqual([{ from: 'a', names: ['foo'] }]);
  });

  it('extracts multiple named imports with aliases (alias is collapsed to the local name)', () => {
    expect(parseImports(`import { a, b as c } from './lib'`)).toEqual([
      { from: 'lib', names: ['a', 'b'] },
    ]);
  });

  it('returns empty for source with no imports', () => {
    expect(parseImports('const x = 1;')).toEqual([]);
  });

  it('handles multiple import lines', () => {
    const src = `import { a } from './a';\nimport { b, c } from './b';`;
    expect(parseImports(src)).toEqual([
      { from: 'a', names: ['a'] },
      { from: 'b', names: ['b', 'c'] },
    ]);
  });

  it('strips // and /* */ comments before matching', () => {
    const src = `// import { ignored } from './x'\n/* import { also } from './y' */\nimport { real } from './z'`;
    expect(parseImports(src)).toEqual([{ from: 'z', names: ['real'] }]);
  });

  it('rejects default import (import x from) with unsupported-import error', () => {
    expect(() => parseImports(`import x from './a'`)).toThrowError(ScriptError);
    expect(() => parseImports(`import x from './a'`)).toThrow(/default/);
  });

  it('rejects bare module specifier (no ./ or ../)', () => {
    expect(() => parseImports(`import { x } from 'lodash'`)).toThrowError(ScriptError);
    expect(() => parseImports(`import { x } from 'lodash'`)).toThrow(/bare/);
  });

  it('rejects namespace import (import *)', () => {
    expect(() => parseImports(`import * as ns from './a'`)).toThrowError(ScriptError);
  });

  it('rejects dynamic import()', () => {
    expect(() => parseImports(`import('./a')`)).toThrowError(ScriptError);
  });
});

// ---------------------------------------------------------------------------
// hasExport (heuristic)
// ---------------------------------------------------------------------------

describe('hasExport', () => {
  it('detects const/let/var declarations', () => {
    expect(hasExport('const foo = 1;', 'foo')).toBe(true);
    expect(hasExport('let bar = 1;', 'bar')).toBe(true);
    expect(hasExport('var baz = 1;', 'baz')).toBe(true);
    expect(hasExport('export const qux = 1;', 'qux')).toBe(true);
  });

  it('detects function declarations', () => {
    expect(hasExport('function myFn() {}', 'myFn')).toBe(true);
    expect(hasExport('export function myFn2() {}', 'myFn2')).toBe(true);
  });

  it('returns false for missing names', () => {
    expect(hasExport('const foo = 1;', 'bar')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveImports — dependency ordering, error cases
// ---------------------------------------------------------------------------

describe('resolveImports', () => {
  it('orders dependency before dependent (single)', () => {
    const lib = entry('lib', 'export const foo = 1;', []);
    const main = entry('main', `import { foo } from './lib'`, [{ from: 'lib', names: ['foo'] }]);
    const order = resolveImports(main, [main, lib]);
    expect(order.map((e) => e.shortName)).toEqual(['lib', 'main']);
  });

  it('orders a 3-level chain (root → mid → leaf)', () => {
    // Each level exports its own symbol; the chain is real: c depends
    // on b (and transitively on a), not just a re-import of a's symbol.
    const a = entry('a', 'export const aSym = 1;', []);
    const b = entry('b', `import { aSym } from './a'\nexport const bSym = aSym + 1;`, [
      { from: 'a', names: ['aSym'] },
    ]);
    const c = entry('c', `import { bSym } from './b'\nexport const cSym = bSym + 1;`, [
      { from: 'b', names: ['bSym'] },
    ]);
    const order = resolveImports(c, [a, b, c]);
    expect(order.map((e) => e.shortName)).toEqual(['a', 'b', 'c']);
  });

  it('orders a diamond (entry depends on two siblings sharing a parent)', () => {
    const root = entry('root', 'export const shared = 1;', []);
    // a and b both re-export `shared` from `root`; main imports from both.
    const a = entry('a', `import { shared } from './root'\nexport const aShared = shared;`, [
      { from: 'root', names: ['shared'] },
    ]);
    const b = entry('b', `import { shared } from './root'\nexport const bShared = shared;`, [
      { from: 'root', names: ['shared'] },
    ]);
    const main = entry(
      'main',
      `import { aShared } from './a'\nimport { bShared } from './b'\nexport const m = aShared + bShared;`,
      [
        { from: 'a', names: ['aShared'] },
        { from: 'b', names: ['bShared'] },
      ],
    );
    const order = resolveImports(main, [root, a, b, main]);
    // root first, then a + b (any order), then main last
    expect(order[0]?.shortName).toBe('root');
    expect(order[3]?.shortName).toBe('main');
    expect(['a', 'b']).toContain(order[1]?.shortName);
    expect(['a', 'b']).toContain(order[2]?.shortName);
  });

  it('throws unknown-module when target missing', () => {
    const orphan = entry('orphan', `import { x } from './missing'`, []);
    expect(() => resolveImports(orphan, [orphan])).toThrowError(ScriptError);
    expect(() => resolveImports(orphan, [orphan])).toThrow(/not found/);
  });

  it('throws unknown-export when named export missing', () => {
    const a = entry('a', 'const foo = 1;', []);
    const b = entry('b', `import { bar } from './a'`, [{ from: 'a', names: ['bar'] }]);
    expect(() => resolveImports(b, [a, b])).toThrowError(ScriptError);
    expect(() => resolveImports(b, [a, b])).toThrow(/not exported/);
  });

  it('throws circular-import on a 2-node cycle', () => {
    // a imports y from b; b imports x from a. Both sources are
    // self-referential, so the cycle detector must fire BEFORE the
    // export check (or the export check passes vacuously and the
    // cycle is detected by stack tracking).
    const a = entry('a', `import { y } from './b'\nexport const x = 1;`, [
      { from: 'b', names: ['y'] },
    ]);
    const b = entry('b', `import { x } from './a'\nexport const y = 2;`, [
      { from: 'a', names: ['x'] },
    ]);
    expect(() => resolveImports(a, [a, b])).toThrowError(ScriptError);
    expect(() => resolveImports(a, [a, b])).toThrow(/circular/);
  });

  it('throws circular-import on a 3-node cycle', () => {
    // a imports `bSym` from b; b imports `cSym` from c; c imports
    // `aSym` from a — forms a cycle (a → b → c → a). Each module
    // exports a real symbol so the hasExport check passes for each
    // named import.
    const a = entry('a', `import { bSym } from './b'\nexport const aSym = 1;`, [
      { from: 'b', names: ['bSym'] },
    ]);
    const b = entry('b', `import { cSym } from './c'\nexport const bSym = 2;`, [
      { from: 'c', names: ['cSym'] },
    ]);
    const c = entry('c', `import { aSym } from './a'\nexport const cSym = 3;`, [
      { from: 'a', names: ['aSym'] },
    ]);
    expect(() => resolveImports(a, [a, b, c])).toThrow(/circular/);
  });

  it('throws depth-limit when chain exceeds DEPTH_LIMIT (8)', () => {
    // Build a chain of 10 nodes — should hit depth-limit when called with
    // the leaf as the entry. Each intermediate re-exports a unique symbol
    // so the hasExport check passes for the real import.
    const nodes: ScriptEntry[] = [];
    for (let i = 0; i < 10; i++) {
      const prev = i > 0 ? `n${i - 1}` : undefined;
      if (prev === undefined) {
        nodes.push(entry('n0', `export const n0sym = 1;`, []));
      } else {
        nodes.push(
          entry(
            `n${i}`,
            `import { n${i - 1}sym } from './${prev}'\nexport const n${i}sym = n${i - 1}sym + 1;`,
            [{ from: prev, names: [`n${i - 1}sym`] }],
          ),
        );
      }
    }
    const leaf = nodes[nodes.length - 1]!;
    expect(() => resolveImports(leaf, nodes)).toThrowError(ScriptError);
    expect(() => resolveImports(leaf, nodes)).toThrow(/depth/i);
  });
});

// ---------------------------------------------------------------------------
// detectCycles
// ---------------------------------------------------------------------------

describe('detectCycles', () => {
  it('returns empty when DAG is acyclic', () => {
    expect(
      detectCycles(
        new Map([
          ['a', new Set(['b'])],
          ['b', new Set()],
        ]),
      ),
    ).toEqual([]);
  });

  it('returns empty for a diamond DAG', () => {
    expect(
      detectCycles(
        new Map([
          ['root', new Set()],
          ['a', new Set(['root'])],
          ['b', new Set(['root'])],
          ['main', new Set(['a', 'b'])],
        ]),
      ),
    ).toEqual([]);
  });

  it('returns at least one cycle path on a 2-node cycle', () => {
    const cycles = detectCycles(
      new Map([
        ['a', new Set(['b'])],
        ['b', new Set(['a'])],
      ]),
    );
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('returns at least one cycle path on a 3-node cycle', () => {
    const cycles = detectCycles(
      new Map([
        ['a', new Set(['b'])],
        ['b', new Set(['c'])],
        ['c', new Set(['a'])],
      ]),
    );
    expect(cycles.length).toBeGreaterThan(0);
  });

  it('classScriptError attaches a kind + meta', () => {
    const e = classScriptError('circular-import', 'cycle: a -> b -> a', { cycle: ['a', 'b'] });
    expect(e.payload.kind).toBe('circular-import');
    expect(e.payload.meta).toEqual({ cycle: ['a', 'b'] });
  });
});
