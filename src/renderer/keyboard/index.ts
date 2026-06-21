// src/renderer/keyboard/index.ts
// v1.6.0 Cluster U — barrel exports.
//
// Consumers (App.tsx, tests) import the public surface from a single
// module; internal helpers stay hidden.

export {
  ShortcutRegistry,
  type Command,
  type CommandCategory,
  type CommandContext,
  type FocusedArea,
  type ModifierToken,
  type ShortcutBinding,
  type ShortcutConflict,
  type KeyToken,
} from './ShortcutRegistry.js';

export {
  CommandPalette,
  type PaletteCommand,
  type CommandPaletteProps,
} from './CommandPalette.js';

export {
  CheatSheet,
  type CheatSheetSection,
  type CheatSheetEntry,
  type CheatSheetProps,
} from './CheatSheet.js';

export {
  eventToBinding,
  formatBindingForDisplay,
  modLabel,
  modToken,
  bindingsEqual,
} from './normalizeKey.js';