// src/renderer/keyboard/shortcuts/selection.ts
// v1.6.0 Cluster U — Selection category shortcut definitions (5 commands).

import type { Command } from '../ShortcutRegistry.js';

export const selectionCommands: readonly Command[] = [
  {
    id: 'selection.selectAll',
    labelKey: 'shortcut.selection.selectAll',
    category: 'selection',
    bindings: ['Mod+A'],
    run: () => undefined,
  },
  {
    id: 'selection.expand',
    labelKey: 'shortcut.selection.expand',
    category: 'selection',
    bindings: ['Mod+Shift+Right'],
    run: () => undefined,
  },
  {
    id: 'selection.shrink',
    labelKey: 'shortcut.selection.shrink',
    category: 'selection',
    bindings: ['Mod+Shift+Left'],
    run: () => undefined,
  },
  {
    id: 'selection.multiCursorAbove',
    labelKey: 'shortcut.selection.expand',
    category: 'selection',
    bindings: ['Mod+Alt+Up'],
    run: () => undefined,
  },
  {
    id: 'selection.multiCursorBelow',
    labelKey: 'shortcut.selection.shrink',
    category: 'selection',
    bindings: ['Mod+Alt+Down'],
    run: () => undefined,
  },
];