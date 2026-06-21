// src/renderer/keyboard/shortcuts/palette.ts
// v1.6.0 Cluster U — Palette category shortcut definitions (1 command).

import type { Command } from '../ShortcutRegistry.js';

export const paletteCommands: readonly Command[] = [
  {
    id: 'palette.toggle',
    labelKey: 'shortcut.palette.toggle',
    category: 'palette',
    bindings: ['Mod+K'],
    run: () => undefined,
  },
];