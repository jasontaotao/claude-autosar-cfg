// src/renderer/keyboard/shortcuts/script.ts
// v1.6.0 Cluster U — Script category shortcut definitions (4 commands).
//
// Per U spec §5.2 "Q2a resolved": `Mod+Shift+P` is reserved for the
// Script Editor (high-frequency). The ECUC `addParameter` command
// remaps to `Mod+Alt+I` to avoid the conflict (see ecuc.ts).

import type { Command } from '../ShortcutRegistry.js';

export const scriptCommands: readonly Command[] = [
  {
    id: 'script.openEditor',
    labelKey: 'shortcut.script.openEditor',
    category: 'script',
    bindings: ['Mod+Shift+P'],
    run: () => undefined,
  },
  {
    id: 'script.run',
    labelKey: 'shortcut.script.run',
    category: 'script',
    bindings: [],
    run: () => undefined,
  },
  {
    id: 'script.save',
    labelKey: 'shortcut.script.save',
    category: 'script',
    bindings: ['Shift+Alt+F'],
    run: () => undefined,
  },
  {
    id: 'script.format',
    labelKey: 'shortcut.script.format',
    category: 'script',
    bindings: ['Mod+Alt+L'],
    run: () => undefined,
  },
];