// src/renderer/keyboard/shortcuts/navigate.ts
// v1.6.0 Cluster U — Navigate category shortcut definitions (3 commands).

import type { Command } from '../ShortcutRegistry.js';

export const navigateCommands: readonly Command[] = [
  {
    id: 'navigate.goToDefinition',
    labelKey: 'shortcut.navigate.goToDefinition',
    category: 'navigate',
    bindings: ['F12'],
    run: () => undefined,
  },
  {
    id: 'navigate.goToReference',
    labelKey: 'shortcut.navigate.goToReference',
    category: 'navigate',
    bindings: ['Shift+F12'],
    run: () => undefined,
  },
  {
    id: 'navigate.focusSearch',
    labelKey: 'shortcut.navigate.focusSearch',
    category: 'navigate',
    bindings: ['Mod+P'],
    run: () => undefined,
  },
];