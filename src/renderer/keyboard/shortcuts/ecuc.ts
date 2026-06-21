// src/renderer/keyboard/shortcuts/ecuc.ts
// v1.6.0 Cluster U — ECUC category shortcut definitions (5 commands).
//
// `Mod+Alt+I` = Add Parameter (per U spec Q2a resolved 2026-06-21;
// the original `Mod+Shift+P` collides with `script.openEditor` which
// is higher-frequency in the AUTOSAR power-user workflow).

import type { Command } from '../ShortcutRegistry.js';

export const ecucCommands: readonly Command[] = [
  {
    id: 'ecuc.addContainer',
    labelKey: 'shortcut.ecuc.addContainer',
    category: 'ecuc',
    bindings: ['Mod+I'],
    run: () => undefined,
  },
  {
    id: 'ecuc.deleteContainer',
    labelKey: 'shortcut.ecuc.deleteContainer',
    category: 'ecuc',
    bindings: ['Mod+Backspace'],
    run: () => undefined,
  },
  {
    id: 'ecuc.duplicateContainer',
    labelKey: 'shortcut.ecuc.duplicateContainer',
    category: 'ecuc',
    bindings: ['Mod+D'],
    run: () => undefined,
  },
  {
    id: 'ecuc.addParameter',
    labelKey: 'shortcut.ecuc.addParameter',
    category: 'ecuc',
    bindings: ['Mod+Alt+I'],
    run: () => undefined,
  },
  {
    id: 'ecuc.editParameter',
    labelKey: 'shortcut.ecuc.editParameter',
    category: 'ecuc',
    bindings: ['Enter'],
    when: (ctx) => ctx.focusedArea === 'tree' || ctx.focusedArea === 'editor',
    run: () => undefined,
  },
];
