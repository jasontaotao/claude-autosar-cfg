// src/renderer/keyboard/shortcuts/file.ts
// v1.6.0 Cluster U — File category shortcut definitions (5 commands).
//
// Bindings follow U spec §5.2 File row. `run` is intentionally a
// no-op in this layer — the host wires the actions via store +
// project-action hooks. Here we only declare the (id, binding,
// when) tuple.

import type { Command } from '../ShortcutRegistry.js';

export const fileCommands: readonly Command[] = [
  {
    id: 'file.open',
    labelKey: 'shortcut.file.open',
    category: 'file',
    bindings: ['Mod+O'],
    run: () => undefined,
  },
  {
    id: 'file.save',
    labelKey: 'shortcut.file.save',
    category: 'file',
    bindings: ['Mod+S'],
    run: () => undefined,
  },
  {
    id: 'file.saveAs',
    labelKey: 'shortcut.file.saveAs',
    category: 'file',
    bindings: ['Mod+Shift+S'],
    run: () => undefined,
  },
  {
    id: 'file.close',
    labelKey: 'shortcut.file.close',
    category: 'file',
    bindings: ['Mod+W'],
    run: () => undefined,
  },
  {
    id: 'file.recent',
    labelKey: 'shortcut.file.recent',
    category: 'file',
    bindings: ['Mod+R'],
    run: () => undefined,
  },
];
