import { describe, it, expect } from 'vitest';

import { PANEL_REGISTRY, getPanelDef } from '../registry';

describe('PanelRegistry', () => {
  it('registers exactly 5 panels with stable ids', () => {
    const ids = PANEL_REGISTRY.map((p) => p.id);
    expect(ids).toEqual(['left-panel', 'param-editor', 'script-panel', 'dbc-viewer', 'odx-viewer']);
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
    expect(getPanelDef('left-panel')).toBeDefined();
  });
});
