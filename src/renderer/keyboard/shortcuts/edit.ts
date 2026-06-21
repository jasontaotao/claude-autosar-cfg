// src/renderer/keyboard/shortcuts/edit.ts
// v1.6.0 Cluster U — Edit category shortcut definitions (7 commands).
//
// Note: `Mod+S` collides with File.save; `when` predicate disambiguates:
// Edit/Undo fires only when ScriptPanel is focused (script editor
// undo), File.save otherwise. The ShortcutRegistry returns the first
// command whose `when` passes.

import type { Command } from '../ShortcutRegistry.js';

export const editCommands: readonly Command[] = [
  {
    id: 'edit.undo',
    labelKey: 'shortcut.edit.undo',
    category: 'edit',
    bindings: ['Mod+Z'],
    run: () => undefined,
  },
  {
    id: 'edit.redo',
    labelKey: 'shortcut.edit.redo',
    category: 'edit',
    bindings: ['Mod+Shift+Z'],
    run: () => undefined,
  },
  {
    id: 'edit.cut',
    labelKey: 'shortcut.edit.cut',
    category: 'edit',
    bindings: ['Mod+X'],
    run: () => undefined,
  },
  {
    id: 'edit.copy',
    labelKey: 'shortcut.edit.copy',
    category: 'edit',
    bindings: ['Mod+C'],
    run: () => undefined,
  },
  {
    id: 'edit.paste',
    labelKey: 'shortcut.edit.paste',
    category: 'edit',
    bindings: ['Mod+V'],
    run: () => undefined,
  },
  {
    id: 'edit.find',
    labelKey: 'shortcut.edit.find',
    category: 'edit',
    bindings: ['Mod+F'],
    run: () => undefined,
  },
  {
    id: 'edit.replace',
    labelKey: 'shortcut.edit.replace',
    category: 'edit',
    bindings: ['Mod+H'],
    run: () => undefined,
  },
];
