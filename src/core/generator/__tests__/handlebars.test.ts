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
