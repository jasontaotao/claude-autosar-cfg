// src/renderer/keyboard/types.ts
// v1.6.0 Cluster U — shared shortcut types.
//
// Pure type module: no runtime exports. Imported by ShortcutRegistry,
// CommandPalette, CheatSheet, useShortcut, and every category file in
// shortcuts/. Keeping the types in a separate file lets the registry
// avoid circular imports with the category definitions.

/** Modifier tokens. `Mod` is the cross-platform alias resolved at
 *  runtime to `Cmd` on macOS and `Ctrl` on Windows/Linux. */
export type ModifierToken = 'Mod' | 'Shift' | 'Alt';

/** A single key token — letter / digit / symbol / named key.
 *  Examples: `'K'`, `'/'`, `'Enter'`, `'Escape'`, `'F5'`, `'?'`. */
export type KeyToken = string;

/** Binding grammar: `'Mod+K'`, `'Mod+Shift+P'`, `'?'`, `'F5'`,
 *  `'Mod+K Mod+0'` (chord sequences). Modifiers appear before the
 *  trigger key, separated by `+`. Chord sequences use a single space. */
export type ShortcutBinding = string;

/** Categories drive palette grouping + cheat-sheet section ordering. */
export type CommandCategory =
  | 'file'
  | 'edit'
  | 'view'
  | 'navigate'
  | 'selection'
  | 'tree'
  | 'script'
  | 'ecuc'
  | 'window'
  | 'help'
  | 'palette'
  | 'validation';

/** Where the user is currently focused — drives `when` predicates
 *  for context-sensitive shortcuts (e.g. `Mod+Shift+E` is "Reveal
 *  Active" in tree focus, "Focus ValidationPanel" elsewhere). */
export type FocusedArea = 'tree' | 'editor' | 'script' | 'palette' | 'cheatsheet' | 'other';

/** Runtime context for command resolution and `when` predicates.
 *  Built by the keymap provider from the active element + store
 *  selectors — kept tiny so callers can construct it cheaply inside
 *  the keydown handler. */
export interface CommandContext {
  readonly activeElement: HTMLElement | null;
  readonly hasOpenProject: boolean;
  readonly hasSelection: boolean;
  readonly focusedArea: FocusedArea;
}

/** Static command definition. The registry holds commands; the
 *  palette/cheatsheet render them via i18n lookups on `labelKey`. */
export interface Command {
  readonly id: string;
  readonly labelKey: string;
  readonly descriptionKey?: string;
  readonly category: CommandCategory;
  readonly bindings: readonly ShortcutBinding[];
  readonly when?: (ctx: CommandContext) => boolean;
  readonly run: (ctx: CommandContext) => void | Promise<void>;
}

/** Result of a conflict-detection pass. Shared binding, multiple ids. */
export interface ShortcutConflict {
  readonly binding: ShortcutBinding;
  readonly ids: readonly [string, string];
}
