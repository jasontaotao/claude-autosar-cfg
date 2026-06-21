// src/renderer/keyboard/shortcuts/tree.ts
// v1.6.0 Cluster U — Tree category shortcut definitions (5 commands).
//
// `tree.revealActive` binds `Mod+Shift+E`. This collides with the
// Validation category's `validation.focusPanel` shortcut; the two are
// disambiguated by the `focusedArea` clause (per U spec §5.2
// "Binding 冲突清单"): Tree reveal fires when `focusedArea ===
// 'tree'`, Validation focus fires otherwise. Each command's `when`
// predicate enforces the disambiguation.

import type { Command } from '../ShortcutRegistry.js';

export const treeCommands: readonly Command[] = [
  {
    id: 'tree.revealActive',
    labelKey: 'shortcut.tree.revealActive',
    category: 'tree',
    bindings: ['Mod+Shift+E'],
    when: (ctx) => ctx.focusedArea === 'tree',
    run: () => undefined,
  },
  {
    id: 'tree.collapseAll',
    labelKey: 'shortcut.tree.collapseAll',
    category: 'tree',
    bindings: ['Mod+K Mod+0'],
    run: () => undefined,
  },
  {
    id: 'tree.expandAll',
    labelKey: 'shortcut.tree.expandAll',
    category: 'tree',
    bindings: ['Mod+K Mod+J'],
    run: () => undefined,
  },
  {
    id: 'tree.jumpParent',
    labelKey: 'shortcut.tree.jumpParent',
    category: 'tree',
    bindings: ['Alt+Left'],
    run: () => undefined,
  },
  {
    id: 'tree.jumpChild',
    labelKey: 'shortcut.tree.jumpChild',
    category: 'tree',
    bindings: ['Alt+Right'],
    run: () => undefined,
  },
];
