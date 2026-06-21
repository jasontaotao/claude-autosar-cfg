// src/renderer/keyboard/__tests__/ShortcutRegistry.test.ts
// v1.6.0 Cluster U — ShortcutRegistry unit tests (TDD RED → GREEN).
//
// The registry is an immutable map from binding → Command[] that the
// CommandPalette / CheatSheet / useShortcut hook share. Immutability
// is enforced per common/coding-style.md; every mutation returns a new
// instance so React state comparisons work without surprise.

import { describe, expect, it } from 'vitest';

import {
  ShortcutRegistry,
  type Command,
  type CommandContext,
  type ShortcutBinding,
} from '../ShortcutRegistry.js';

const ctx: CommandContext = {
  activeElement: null,
  hasOpenProject: true,
  hasSelection: false,
  focusedArea: 'other',
};

const echoCommand = (
  id: string,
  binding: string,
  when?: (c: CommandContext) => boolean,
): Command => ({
  id,
  labelKey: `cmd.${id}`,
  category: 'file',
  bindings: [binding],
  ...(when ? { when } : {}),
  run: () => undefined,
});

describe('ShortcutRegistry (v1.6.0 U)', () => {
  it('registers a command and returns a new instance (immutability)', () => {
    const r0 = new ShortcutRegistry();
    const r1 = r0.register(echoCommand('file.open', 'Mod+O'));
    expect(r0.all()).toHaveLength(0); // r0 not mutated
    expect(r1.all()).toHaveLength(1);
    expect(r1.all()[0]?.id).toBe('file.open');
  });

  it('looks up a command by binding and returns the registered command', () => {
    const r = new ShortcutRegistry().register(echoCommand('file.open', 'Mod+O'));
    const cmd = r.lookup(makeKeyEvent('o', { metaKey: true }), ctx);
    expect(cmd).not.toBeNull();
    expect(cmd?.id).toBe('file.open');
  });

  it('returns null when no command matches the binding', () => {
    const r = new ShortcutRegistry().register(echoCommand('file.open', 'Mod+O'));
    const cmd = r.lookup(makeKeyEvent('z', { metaKey: true }), ctx);
    expect(cmd).toBeNull();
  });

  it('respects `when` predicate: returns null when condition is false', () => {
    const r = new ShortcutRegistry().register(
      echoCommand('tree.reveal', 'Mod+Shift+E', (c) => c.focusedArea === 'tree'),
    );
    const cmd = r.lookup(makeKeyEvent('e', { metaKey: true, shiftKey: true }), {
      ...ctx,
      focusedArea: 'editor', // not tree
    });
    expect(cmd).toBeNull();
  });

  it('respects `when` predicate: returns command when condition is true', () => {
    const r = new ShortcutRegistry().register(
      echoCommand('tree.reveal', 'Mod+Shift+E', (c) => c.focusedArea === 'tree'),
    );
    const cmd = r.lookup(makeKeyEvent('e', { metaKey: true, shiftKey: true }), {
      ...ctx,
      focusedArea: 'tree',
    });
    expect(cmd).not.toBeNull();
    expect(cmd?.id).toBe('tree.reveal');
  });

  it('registerAll adds many commands at once', () => {
    const r = new ShortcutRegistry().registerAll([
      echoCommand('file.open', 'Mod+O'),
      echoCommand('file.save', 'Mod+S'),
      echoCommand('edit.undo', 'Mod+Z'),
    ]);
    expect(r.all()).toHaveLength(3);
  });

  it('unregister removes a command and returns a new instance', () => {
    const r1 = new ShortcutRegistry().register(echoCommand('file.open', 'Mod+O'));
    const r2 = r1.unregister('file.open');
    expect(r1.all()).toHaveLength(1); // r1 unchanged
    expect(r2.all()).toHaveLength(0);
  });

  it('detectConflicts returns pairs of commands sharing a binding', () => {
    const r = new ShortcutRegistry().registerAll([
      echoCommand('a', 'Mod+S'),
      echoCommand('b', 'Mod+S'),
      echoCommand('c', 'Mod+O'),
    ]);
    const conflicts = r.detectConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.binding).toBe('Mod+S');
    expect(new Set(conflicts[0]?.ids ?? [])).toEqual(new Set(['a', 'b']));
  });

  it('detectConflicts returns empty when no binding is shared', () => {
    const r = new ShortcutRegistry().registerAll([
      echoCommand('a', 'Mod+S'),
      echoCommand('b', 'Mod+O'),
    ]);
    expect(r.detectConflicts()).toHaveLength(0);
  });

  it('byCategory groups commands and returns them sorted by category', () => {
    const r = new ShortcutRegistry().registerAll([
      { ...echoCommand('a', 'Mod+O'), category: 'file' },
      { ...echoCommand('b', 'Mod+Z'), category: 'edit' },
      { ...echoCommand('c', 'Mod+Shift+P'), category: 'script' },
    ]);
    const map = r.byCategory();
    expect(map.size).toBe(3);
    expect(map.get('file')?.[0]?.id).toBe('a');
    expect(map.get('edit')?.[0]?.id).toBe('b');
    expect(map.get('script')?.[0]?.id).toBe('c');
  });

  it('throws on duplicate command id registration', () => {
    const r = new ShortcutRegistry().register(echoCommand('dup', 'Mod+O'));
    expect(() => r.register(echoCommand('dup', 'Mod+P'))).toThrow(/already registered/i);
  });

  it('lookup handles binding with multiple modifier tokens (Mod+Shift+E)', () => {
    const r = new ShortcutRegistry().register(echoCommand('tree.reveal', 'Mod+Shift+E'));
    const cmd = r.lookup(makeKeyEvent('e', { metaKey: true, shiftKey: true }), ctx);
    expect(cmd?.id).toBe('tree.reveal');
  });

  it('lookup normalizes Ctrl→Mod on Mac and Cmd→Mod on Win for cross-platform', () => {
    const r = new ShortcutRegistry().register(echoCommand('file.open', 'Mod+O'));
    // Simulate Win + Ctrl by setting ctrlKey, no metaKey
    const cmd = r.lookup(makeKeyEvent('o', { ctrlKey: true }), ctx);
    expect(cmd?.id).toBe('file.open');
  });

  it('lookup is case-insensitive on letter keys', () => {
    const r = new ShortcutRegistry().register(echoCommand('file.open', 'Mod+O'));
    // jsdom lowercases the key when shift is not pressed. The registry
    // must canonicalize both 'o' and 'O' to 'O'.
    const cmd = r.lookup(makeKeyEvent('o', { metaKey: true }), ctx);
    expect(cmd?.id).toBe('file.open');
  });

  it('lookup treats F-keys by their code name (F8 / F12 etc.)', () => {
    const r = new ShortcutRegistry().register(echoCommand('validation.next', 'F8'));
    const cmd = r.lookup(makeKeyEvent('F8'), ctx);
    expect(cmd?.id).toBe('validation.next');
  });

  it('first registered command wins on conflict (later is silent-skip)', () => {
    const r = new ShortcutRegistry().registerAll([
      { ...echoCommand('first', 'Mod+S'), run: () => undefined },
      { ...echoCommand('second', 'Mod+S'), run: () => undefined },
    ]);
    const cmd = r.lookup(makeKeyEvent('s', { metaKey: true }), ctx);
    expect(cmd?.id).toBe('first');
  });

  it('all() returns readonly array (does not expose internal Map)', () => {
    const r = new ShortcutRegistry().register(echoCommand('a', 'Mod+O'));
    const list = r.all();
    expect(Array.isArray(list)).toBe(true);
    // Type-level guarantee: List type is ReadonlyArray. Compile-time check.
    const _readonly: readonly Command[] = list;
    expect(_readonly).toBe(list);
  });

  it('empty registry lookup returns null', () => {
    const r = new ShortcutRegistry();
    expect(r.lookup(makeKeyEvent('a', { metaKey: true }), ctx)).toBeNull();
  });
});

function makeKeyEvent(
  key: string,
  mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {},
): KeyboardEvent {
  // jsdom doesn't expose KeyboardEvent constructor in every test env;
  // fall back to a plain object that satisfies the structural type.
  if (typeof KeyboardEvent !== 'undefined') {
    return new KeyboardEvent('keydown', { key, ...mods });
  }
  return { key, ...mods } as unknown as KeyboardEvent;
}

// Smoke check — `binding` type is referenced to satisfy the import
// surface and keep tsc --noEmit honest about the exported union.
const _binding: ShortcutBinding = 'Mod+K';
void _binding;
