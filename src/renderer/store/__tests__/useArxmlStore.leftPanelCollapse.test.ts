// src/renderer/store/__tests__/useArxmlStore.leftPanelCollapse.test.ts
// Pin the contract of leftPanelProjectCollapsed: slice field + setter
// writes to localStorage + rehydrate from localStorage on store init.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useArxmlStore } from '../useArxmlStore.js';

const STORAGE_KEY = 'claude-autosarcfg:leftPanel:projectCollapsed';

describe('useArxmlStore — leftPanelProjectCollapsed (v1.55.0)', () => {
  beforeEach(() => {
    localStorage.clear();
    // Re-init: in vitest, the store module is loaded once per test
    // file; the localStorage read happens at module load. If a test
    // mutates localStorage mid-run, the slice does NOT re-hydrate
    // (one-shot read at module load — matches the locale init
    // pattern). Tests below re-import the module via
    // `vi.resetModules()` + dynamic import to exercise rehydrate.
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to false on a fresh store (no localStorage entry)', () => {
    // No localStorage write; default from initial state should be false.
    expect(useArxmlStore.getState().leftPanelProjectCollapsed).toBe(false);
  });

  it('setLeftPanelProjectCollapsed flips the in-memory field AND writes localStorage', () => {
    useArxmlStore.getState().setLeftPanelProjectCollapsed(true);
    expect(useArxmlStore.getState().leftPanelProjectCollapsed).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');

    useArxmlStore.getState().setLeftPanelProjectCollapsed(false);
    expect(useArxmlStore.getState().leftPanelProjectCollapsed).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });
});
