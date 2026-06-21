// src/renderer/keyboard/shortcuts/help.ts
// v1.6.0 Cluster U — Help category shortcut definitions (3 commands).
//
// `help.resetOnboarding` binds `Mod+Shift+R` and triggers the W
// cluster's `tour:reset` IPC (per U spec §3.4 cross-cluster wiring).
// The renderer wires the actual IPC call; here we only declare the
// (id, binding, category) tuple.

import type { Command } from '../ShortcutRegistry.js';

export const helpCommands: readonly Command[] = [
  {
    id: 'help.showCheatSheet',
    labelKey: 'shortcut.help.showCheatSheet',
    category: 'help',
    bindings: ['?'],
    when: (ctx) => {
      // Don't fire when the user is typing in an input/textarea.
      const ae = ctx.activeElement;
      if (ae === null) return true;
      const tag = ae.tagName;
      return tag !== 'INPUT' && tag !== 'TEXTAREA' && !ae.isContentEditable;
    },
    run: () => undefined,
  },
  {
    id: 'help.showDocs',
    labelKey: 'shortcut.help.showDocs',
    category: 'help',
    bindings: ['F1'],
    run: () => undefined,
  },
  {
    id: 'help.resetOnboarding',
    labelKey: 'shortcut.help.resetOnboarding',
    category: 'help',
    bindings: ['Mod+Shift+R'],
    when: (ctx) => ctx.hasOpenProject,
    run: () => undefined,
  },
];
