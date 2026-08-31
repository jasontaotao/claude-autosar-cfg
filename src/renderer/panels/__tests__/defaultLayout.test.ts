import { describe, it, expect } from 'vitest';

import { DEFAULT_LAYOUT } from '../defaultLayout';

describe('DEFAULT_LAYOUT', () => {
  it('has version 1', () => {
    expect(DEFAULT_LAYOUT.version).toBe(1);
  });
  it('has left-panel and param-editor only in default panels', () => {
    expect(DEFAULT_LAYOUT.panels).toEqual(['left-panel', 'param-editor']);
  });
  it('splits are 30/70', () => {
    expect(DEFAULT_LAYOUT.splits).toEqual([30, 70]);
  });
});
