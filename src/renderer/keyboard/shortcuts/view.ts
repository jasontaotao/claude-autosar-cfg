// src/renderer/keyboard/shortcuts/view.ts
// v1.6.0 Cluster U — View category shortcut definitions (5 commands).

import type { Command } from '../ShortcutRegistry.js';

export const viewCommands: readonly Command[] = [
  {
    id: 'view.toggleLeft',
    labelKey: 'shortcut.view.toggleLeft',
    category: 'view',
    bindings: ['Mod+B'],
    run: () => undefined,
  },
  {
    id: 'view.toggleRight',
    labelKey: 'shortcut.view.toggleRight',
    category: 'view',
    bindings: ['Mod+J'],
    run: () => undefined,
  },
  {
    id: 'view.zoomIn',
    labelKey: 'shortcut.view.zoomIn',
    category: 'view',
    bindings: ['Mod+='],
    run: () => undefined,
  },
  {
    id: 'view.zoomOut',
    labelKey: 'shortcut.view.zoomOut',
    category: 'view',
    bindings: ['Mod+-'],
    run: () => undefined,
  },
  {
    id: 'view.zoomReset',
    labelKey: 'shortcut.view.zoomReset',
    category: 'view',
    bindings: ['Mod+0'],
    run: () => undefined,
  },
];
