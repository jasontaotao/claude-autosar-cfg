import { describe, it, expect } from 'vitest';
import { DEFAULT_LAYOUT } from '../defaultLayout';

describe('DEFAULT_LAYOUT', () => {
  it('has version 2 (P4)', () => {
    expect(DEFAULT_LAYOUT.version).toBe(2);
  });
  it('has 5 default panels (no script-panel/viewers)', () => {
    expect(DEFAULT_LAYOUT.panels).toEqual([
      'project', 'files', 'validation', 'arxml-tree', 'param-editor',
    ]);
  });
  it('splits are 30/70 horizontal', () => {
    expect(DEFAULT_LAYOUT.splits).toEqual([30, 70]);
  });
  it('left vertical split is 60/40 (tabs top, tree bottom)', () => {
    expect(DEFAULT_LAYOUT.leftVerticalSplit).toEqual([60, 40]);
  });
});
