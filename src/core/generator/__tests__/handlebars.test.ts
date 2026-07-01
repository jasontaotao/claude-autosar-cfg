import Handlebars from 'handlebars';
import { describe, it, expect } from 'vitest';

import { createEngine } from '../handlebars.js';

describe('createEngine', () => {
  it('returns a Handlebars instance with cIdent registered', () => {
    const engine = createEngine();
    const tpl = engine.compile('{{cIdent path}}');
    expect(tpl({ path: 'Mcu/Clock/Div' })).toBe('Mcu_Clock_Div');
  });

  it('reuses the same helpers across compilations', () => {
    const engine = createEngine();
    const tpl1 = engine.compile('{{cIdent a}}');
    const tpl2 = engine.compile('[{{cIdent b}}]');
    expect(tpl1({ a: 'X/Y' })).toBe('X_Y');
    expect(tpl2({ b: 'Z' })).toBe('[Z]');
  });

  it('does not leak cIdent to a bare Handlebars instance (isolation)', () => {
    // Handlebars 4.7.9 throws on a missing helper by default; the brief
    // expected '' but the runtime behavior is throw. Either way, a bare
    // Handlebars.create() instance must NOT see cIdent — that's the
    // isolation contract createEngine() provides.
    const bare = Handlebars.create();
    const tpl = bare.compile('{{cIdent path}}');
    expect(() => tpl({ path: 'X' })).toThrow(/Missing helper/i);
  });
});

// v1.20.0 MINOR T2 B-3 second half — Handlebars templates call the
// emit*Decl helpers directly (not via pre-stringified arrays). The
// helpers now accept object inputs mirroring the canonical
// `emitConstDeclInput` / `ExternDeclInput` / `LoaderEntryInput`
// shapes from `src/core/generator/emit/strategy.ts`. These tests
// pin the helper→emit-function equivalence so the generator's
// snapshot output stays byte-identical after the template reshape.

describe('createEngine — v1.20.0 B-3 second half helper integration', () => {
  it('externDecl with object input matches emitExternDecl output', () => {
    const engine = createEngine();
    const tpl = engine.compile('{{externDecl entry}}');
    const out = tpl({ entry: { ident: 'X', cType: 'uint8' } });
    expect(out).toBe('extern CONST(uint8, AUTOMATIC) uint8 X;');
  });

  it('constDecl with object input matches emitConstDecl output', () => {
    const engine = createEngine();
    const tpl = engine.compile('{{constDecl entry}}');
    const out = tpl({
      entry: {
        ident: 'X',
        cType: 'uint8',
        cValue: '0u',
        isArray: false,
        value: 0,
        def: { kind: 'integer' },
      },
    });
    expect(out).toBe('CONST(uint8, AUTOMATIC) uint8 X = 0u;');
  });

  it('loaderEntry with object input matches emitLoaderEntry output', () => {
    const engine = createEngine();
    const tpl = engine.compile('{{loaderEntry entry}}');
    const out = tpl({ entry: { ident: 'X', cType: 'uint8', isArray: false } });
    expect(out).toBe('static uint8 X;');
  });
});
