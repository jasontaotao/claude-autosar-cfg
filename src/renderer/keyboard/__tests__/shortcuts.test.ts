// src/renderer/keyboard/__tests__/shortcuts.test.ts
// v1.6.0 Cluster U — integration test: 51 shortcuts register + the
// 4 G-coupled shortcuts are present (per U spec §5.2 "Validation
// category 集成细节").

import { describe, expect, it } from 'vitest';

import { ShortcutRegistry } from '../ShortcutRegistry.js';
import { allCommands } from '../shortcuts/index.js';

describe('shortcut registry integration (v1.6.0 U)', () => {
  it('ships exactly 51 shortcuts from allCommands', () => {
    expect(allCommands).toHaveLength(51);
  });

  it('registers all 51 into a ShortcutRegistry without throwing', () => {
    const r = new ShortcutRegistry().registerAll(allCommands);
    expect(r.all()).toHaveLength(51);
  });

  it('covers every category in CATEGORY_LABEL_KEYS', () => {
    const r = new ShortcutRegistry().registerAll(allCommands);
    const byCat = r.byCategory();
    expect(byCat.size).toBeGreaterThanOrEqual(11);
    // Spot-check categories
    expect(byCat.get('file')?.length).toBe(5);
    expect(byCat.get('edit')?.length).toBe(7);
    expect(byCat.get('view')?.length).toBe(5);
    expect(byCat.get('tree')?.length).toBe(5);
    expect(byCat.get('script')?.length).toBe(4);
    expect(byCat.get('ecuc')?.length).toBe(5);
    expect(byCat.get('validation')?.length).toBe(4);
    expect(byCat.get('window')?.length).toBe(4);
  });

  it('contains the 4 G-coupled validation shortcuts', () => {
    const ids = new Set(allCommands.map((c) => c.id));
    expect(ids.has('validation.nextError')).toBe(true);
    expect(ids.has('validation.prevError')).toBe(true);
    expect(ids.has('validation.togglePanel')).toBe(true);
    expect(ids.has('validation.focusPanel')).toBe(true);
  });

  it('contains the cross-spec Reset Onboarding shortcut', () => {
    expect(allCommands.some((c) => c.id === 'help.resetOnboarding')).toBe(true);
  });

  it('declares no duplicate ids', () => {
    const ids = allCommands.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every command has at least one binding (except Cmd-K "Run Script" deferred to palette)', () => {
    // We allow 0 bindings for `script.run` because the palette
    // surfaces it as a virtual entry; the registry treats 0-bindings
    // commands as palette-only.
    const noBinding = allCommands.filter((c) => c.bindings.length === 0);
    expect(noBinding.map((c) => c.id)).toEqual(['script.run']);
  });
});