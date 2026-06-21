// src/renderer/keyboard/shortcuts/window.ts
// v1.6.0 Cluster U — Window category shortcut definitions (4 commands).

import type { Command } from '../ShortcutRegistry.js';

export const windowCommands: readonly Command[] = [
  {
    id: 'window.newWindow',
    labelKey: 'shortcut.window.newWindow',
    category: 'window',
    bindings: ['Mod+Shift+N'],
    run: () => undefined,
  },
  {
    id: 'window.closeWindow',
    labelKey: 'shortcut.window.closeWindow',
    category: 'window',
    bindings: ['Mod+Shift+W'],
    run: () => undefined,
  },
  {
    id: 'window.focusPanel',
    labelKey: 'shortcut.window.focusPanel',
    category: 'window',
    bindings: ['Mod+1'],
    run: () => undefined,
  },
  {
    id: 'window.focusPanel2',
    labelKey: 'shortcut.window.focusPanel',
    category: 'window',
    bindings: ['Mod+2'],
    run: () => undefined,
  },
];
