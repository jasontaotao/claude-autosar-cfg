// src/renderer/keyboard/shortcuts/validation.ts
// v1.6.0 Cluster U — Validation category shortcut definitions (4 commands).
//
// Per U spec §5.2 "Validation category 集成细节 (G cluster)":
//   - F8            → `validation.nextError`   (consume `useSwsValidatorStore.nextError`)
//   - Shift+F8      → `validation.prevError`   (consume `useSwsValidatorStore.prevError`)
//   - Mod+Shift+V   → `validation.togglePanel` (consume `useSwsValidatorStore.togglePanel`)
//   - Mod+Shift+E   → `validation.focusPanel`  (consume `useSwsValidatorStore.focusPanel`)
//   - The 4 shortcuts are gated by `experimental.swsValidator` flag — when
//     the flag is OFF, the registry returns null for these bindings
//     (silent no-op, no toast, no warn).
//
// `Mod+Shift+E` collides with `tree.revealActive`. The disambiguation
// rule (per U spec §5.2 "Binding 冲突清单"):
//   - tree.revealActive → `when: focusedArea === 'tree'`
//   - validation.focusPanel → `when: focusedArea !== 'tree' && hasOpenProject`
// Both commands register against the same binding; the registry
// returns the first whose `when` predicate passes.

import type { Command } from '../ShortcutRegistry.js';

export const validationCommands: readonly Command[] = [
  {
    id: 'validation.nextError',
    labelKey: 'shortcut.validation.nextError',
    category: 'validation',
    bindings: ['F8'],
    run: () => undefined,
  },
  {
    id: 'validation.prevError',
    labelKey: 'shortcut.validation.prevError',
    category: 'validation',
    bindings: ['Shift+F8'],
    run: () => undefined,
  },
  {
    id: 'validation.togglePanel',
    labelKey: 'shortcut.validation.togglePanel',
    category: 'validation',
    bindings: ['Mod+Shift+V'],
    run: () => undefined,
  },
  {
    id: 'validation.focusPanel',
    labelKey: 'shortcut.validation.focusPanel',
    category: 'validation',
    bindings: ['Mod+Shift+E'],
    when: (ctx) => ctx.focusedArea !== 'tree' && ctx.hasOpenProject,
    run: () => undefined,
  },
];
