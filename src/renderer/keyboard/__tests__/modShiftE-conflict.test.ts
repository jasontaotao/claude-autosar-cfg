// src/renderer/keyboard/__tests__/modShiftE-conflict.test.ts
// v1.6.0 Cluster U — `Mod+Shift+E` disambiguation test.
//
// Per U spec §5.2 "Binding 冲突清单":
//   - `tree.revealActive`  → fires when focusedArea === 'tree'
//   - `validation.focusPanel` → fires when focusedArea !== 'tree'
//
// Both commands register the same binding; the ShortcutRegistry
// returns the first command whose `when` predicate passes (first-wins).
// This test pins the contract so a future refactor does not silently
// swap the order.

// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { ShortcutRegistry, type CommandContext } from '../ShortcutRegistry.js';

const ctx = (
  focusedArea: CommandContext['focusedArea'],
  hasOpenProject = true,
): CommandContext => ({
  activeElement: null,
  focusedArea,
  hasOpenProject,
  hasSelection: false,
});

describe('Mod+Shift+E disambiguation (v1.6.0 U)', () => {
  const r = new ShortcutRegistry().registerAll([
    {
      id: 'tree.revealActive',
      labelKey: 'shortcut.tree.revealActive',
      category: 'tree',
      bindings: ['Mod+Shift+E'],
      when: (c) => c.focusedArea === 'tree',
      run: () => undefined,
    },
    {
      id: 'validation.focusPanel',
      labelKey: 'shortcut.validation.focusPanel',
      category: 'validation',
      bindings: ['Mod+Shift+E'],
      when: (c) => c.focusedArea !== 'tree' && c.hasOpenProject,
      run: () => undefined,
    },
  ]);

  it('returns tree.revealActive when focusedArea === "tree"', () => {
    const cmd = r.lookup(makeKeyEvent('e', { metaKey: true, shiftKey: true }), ctx('tree'));
    expect(cmd?.id).toBe('tree.revealActive');
  });

  it('returns validation.focusPanel when focusedArea === "editor"', () => {
    const cmd = r.lookup(makeKeyEvent('e', { metaKey: true, shiftKey: true }), ctx('editor'));
    expect(cmd?.id).toBe('validation.focusPanel');
  });

  it('returns validation.focusPanel when focusedArea === "other"', () => {
    const cmd = r.lookup(makeKeyEvent('e', { metaKey: true, shiftKey: true }), ctx('other'));
    expect(cmd?.id).toBe('validation.focusPanel');
  });

  it('returns validation.focusPanel when focusedArea === "script"', () => {
    const cmd = r.lookup(makeKeyEvent('e', { metaKey: true, shiftKey: true }), ctx('script'));
    expect(cmd?.id).toBe('validation.focusPanel');
  });

  it("returns null when neither command's `when` matches (e.g. no project open)", () => {
    const cmd = r.lookup(
      makeKeyEvent('e', { metaKey: true, shiftKey: true }),
      ctx('editor', false),
    );
    // tree.revealActive wants focusedArea === 'tree'; validation wants hasOpenProject.
    // No match → null.
    expect(cmd).toBeNull();
  });
});

function makeKeyEvent(
  key: string,
  mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {},
): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, ...mods });
}
