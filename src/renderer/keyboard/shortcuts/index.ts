// src/renderer/keyboard/shortcuts/index.ts
// v1.6.0 Cluster U — barrel for all 11 shortcut category files.
//
// Aggregates the static command list into one `allCommands` constant.
// Callers iterate it to build the ShortcutRegistry, palette entries,
// and cheat sheet sections.

import type { MessageKey } from '@shared/i18n';

import type { Command } from '../ShortcutRegistry.js';
import type { CommandCategory } from '../types.js';

import { ecucCommands } from './ecuc.js';
import { editCommands } from './edit.js';
import { fileCommands } from './file.js';
import { helpCommands } from './help.js';
import { navigateCommands } from './navigate.js';
import { paletteCommands } from './palette.js';
import { scriptCommands } from './script.js';
import { selectionCommands } from './selection.js';
import { treeCommands } from './tree.js';
import { validationCommands } from './validation.js';
import { viewCommands } from './view.js';
import { windowCommands } from './window.js';

/** All 51 commands from the 11 category files (47 base + 4 G-coupled).
 *  Order is the registration order; the ShortcutRegistry preserves it. */
export const allCommands: readonly Command[] = [
  ...fileCommands, // 5
  ...editCommands, // 7
  ...viewCommands, // 5
  ...navigateCommands, // 3
  ...selectionCommands, // 5
  ...treeCommands, // 5
  ...scriptCommands, // 4
  ...ecucCommands, // 5
  ...windowCommands, // 3
  ...helpCommands, // 3
  ...paletteCommands, // 1
  ...validationCommands, // 4
];

/** Map a command category to its i18n label key (used by the cheat
 *  sheet section header). The keys are flat to keep the lookup O(1). */
export const CATEGORY_LABEL_KEYS: Readonly<Record<CommandCategory, MessageKey>> = {
  file: 'shortcut.category.file',
  edit: 'shortcut.category.edit',
  view: 'shortcut.category.view',
  navigate: 'shortcut.category.navigate',
  selection: 'shortcut.category.selection',
  tree: 'shortcut.category.tree',
  script: 'shortcut.category.script',
  ecuc: 'shortcut.category.ecuc',
  window: 'shortcut.category.window',
  help: 'shortcut.category.help',
  palette: 'shortcut.category.palette',
  validation: 'shortcut.category.validation',
};

export {
  editCommands,
  ecucCommands,
  fileCommands,
  helpCommands,
  navigateCommands,
  paletteCommands,
  scriptCommands,
  selectionCommands,
  treeCommands,
  validationCommands,
  viewCommands,
  windowCommands,
};
