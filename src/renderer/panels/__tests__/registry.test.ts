import { describe, it, expect } from 'vitest';
import { PANEL_REGISTRY, getPanelDef } from '../registry';

describe('PanelRegistry', () => {
  it('registers exactly 8 panels with stable ids (P4)', () => {
    const ids = PANEL_REGISTRY.map((p) => p.id);
    expect(ids).toEqual([
      'project',
      'files',
      'validation',
      'arxml-tree',
      'param-editor',
      'script-panel',
      'dbc-viewer',
      'odx-viewer',
    ]);
  });

  it('every panel has a component, titleKey, and defaultGroup', () => {
    for (const p of PANEL_REGISTRY) {
      expect(p.component).toBeDefined();
      expect(typeof p.titleKey).toBe('string');
      expect(['left', 'center', 'bottom', 'viewer']).toContain(p.defaultGroup);
    }
  });

  it('getPanelDef returns undefined for unknown ids', () => {
    expect(getPanelDef('nonexistent')).toBeUndefined();
    expect(getPanelDef('arxml-tree')).toBeDefined();
  });

  it('left-panel id is retired (not in registry)', () => {
    expect(getPanelDef('left-panel')).toBeUndefined();
  });
});
