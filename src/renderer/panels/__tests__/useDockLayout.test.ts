import { describe, it, expect, vi, beforeEach } from 'vitest';

import { parseStoredLayout, serializeLayout } from '../useDockLayout';

describe('parseStoredLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns layout for valid stored data', () => {
    const valid = JSON.stringify({ version: 1, layout: { grid: {}, activePanel: 'x' } });
    expect(parseStoredLayout(valid)).toEqual({ grid: {}, activePanel: 'x' });
  });

  it('returns null for invalid JSON', () => {
    expect(parseStoredLayout('not-json')).toBeNull();
  });

  it('returns null for version mismatch', () => {
    const wrong = JSON.stringify({ version: 99, layout: {} });
    expect(parseStoredLayout(wrong)).toBeNull();
  });

  it('returns null for missing layout field', () => {
    const noLayout = JSON.stringify({ version: 1 });
    expect(parseStoredLayout(noLayout)).toBeNull();
  });

  it('returns null when layout references unknown panel ids', () => {
    const unknownPanel = JSON.stringify({
      version: 1,
      layout: {
        grid: {
          root: { type: 'leaf', data: { id: 'ghost-panel', component: 'ghost' } },
        },
      },
    });
    expect(parseStoredLayout(unknownPanel)).toBeNull();
  });

  it('accepts layout with known panel ids', () => {
    const knownPanel = JSON.stringify({
      version: 1,
      layout: {
        grid: {
          root: { type: 'leaf', data: { id: 'left-panel', component: 'left-panel' } },
        },
      },
    });
    expect(parseStoredLayout(knownPanel)).not.toBeNull();
  });
});

describe('serializeLayout', () => {
  it('wraps dockview serialize output with version 1', () => {
    const layout = { grid: {}, activePanel: 'test' };
    const result = serializeLayout(layout);
    expect(result.version).toBe(1);
    expect(result.layout).toEqual(layout);
  });
});
