// src/renderer/keyboard/ShortcutRegistry.ts
// v1.6.0 Cluster U — immutable shortcut registry.
//
// Pure data structure: holds a `Map<binding, Command[]>` and a flat
// `Command[]` for iteration. Every mutation returns a new instance
// (per `common/coding-style.md` immutability rule), so React state
// comparisons and `useMemo` dependencies stay stable.
//
// Conflict policy (per U spec §5.2 + §6.1):
//   - First registered command wins on conflict; later registrations
//     sharing the same binding are silently skipped (logged via
//     console.warn in dev mode).
//   - `detectConflicts()` returns the full conflict list for the
//     cheat-sheet UI / dev-mode console warnings.

import { bindingsEqual, eventToBinding } from './normalizeKey.js';
import type {
  Command,
  CommandCategory,
  CommandContext,
  ShortcutBinding,
  ShortcutConflict,
} from './types.js';

export type {
  Command,
  CommandCategory,
  CommandContext,
  FocusedArea,
  ModifierToken,
  ShortcutBinding,
  ShortcutConflict,
  KeyToken,
} from './types.js';

export class ShortcutRegistry {
  private readonly byBinding: ReadonlyMap<string, Command[]>;
  private readonly commands: readonly Command[];

  /** Public empty constructor — used by callers. Internal mutators
   *  (`register` / `unregister`) use the private static factory
   *  below so the class shape stays the public one. */
  constructor() {
    this.byBinding = new Map();
    this.commands = [];
  }

  /** Internal factory — rebuild a registry from a fresh binding map
   *  and command list. Bypasses the public `Map` allocation cost on
   *  every `register` call. */
  private static from(
    byBinding: ReadonlyMap<string, Command[]>,
    commands: readonly Command[],
  ): ShortcutRegistry {
    const r = new ShortcutRegistry();
    // Mutate the freshly-empty instance — the result is still a
    // brand-new object from the caller's perspective.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r as any).byBinding = byBinding;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r as any).commands = commands;
    return r;
  }

  /** Add a new command. Throws on duplicate `id` (caller bug —
   *  suggests two category files both registering the same command).
   *  Conflicts at the binding level are silently skipped; call
   *  `detectConflicts()` afterwards to surface them. */
  register(command: Command): ShortcutRegistry {
    if (this.commands.some((c) => c.id === command.id)) {
      throw new Error(`ShortcutRegistry: command id "${command.id}" is already registered`);
    }
    return this.registerAll([command]);
  }

  /** Bulk register. Returns a new instance; the receiver is unchanged. */
  registerAll(commands: readonly Command[]): ShortcutRegistry {
    // Detect duplicate ids within the new batch — better to fail fast
    // than to silently overwrite.
    const seen = new Set<string>();
    for (const c of commands) {
      if (seen.has(c.id)) {
        throw new Error(`ShortcutRegistry: duplicate command id in batch: "${c.id}"`);
      }
      seen.add(c.id);
    }

    const nextByBinding = new Map(this.byBinding);
    const nextCommands: Command[] = [...this.commands];

    for (const c of commands) {
      nextCommands.push(c);
      for (const b of c.bindings) {
        const list = nextByBinding.get(b) ?? [];
        // First-wins policy: do not append to the head of the array
        // when the binding already has a command; the existing entry
        // is the one `lookup` will return.
        if (!list.some((existing) => existing.id === c.id)) {
          nextByBinding.set(b, [...list, c]);
        }
      }
    }
    return ShortcutRegistry.from(nextByBinding, nextCommands);
  }

  /** Remove a command by id. Returns a new instance. No-op when the
   *  id is not present (idempotent — `unregister` of a never-added
   *  command is not an error). */
  unregister(id: string): ShortcutRegistry {
    if (!this.commands.some((c) => c.id === id)) return this;
    const nextCommands = this.commands.filter((c) => c.id !== id);
    const nextByBinding = new Map<string, Command[]>();
    for (const c of nextCommands) {
      for (const b of c.bindings) {
        const list = nextByBinding.get(b) ?? [];
        list.push(c);
        nextByBinding.set(b, list);
      }
    }
    return ShortcutRegistry.from(nextByBinding, nextCommands);
  }

  /** Resolve a keydown event against the registry, honoring `when`
   *  predicates. Returns the first matching command or null. */
  lookup(event: KeyboardEvent, ctx: CommandContext): Command | null {
    const binding = eventToBinding(event);
    if (binding === '') return null;
    const list = this.byBinding.get(binding);
    if (list === undefined || list.length === 0) return null;
    for (const c of list) {
      if (c.when !== undefined && !c.when(ctx)) continue;
      return c;
    }
    return null;
  }

  /** Resolve a binding string directly (skip the keydown event
   *  adapter). Used by tests + the cheat-sheet "click to execute"
   *  affordance. */
  lookupByBinding(binding: ShortcutBinding, ctx: CommandContext): Command | null {
    // First try canonical match.
    for (const [regBinding, list] of this.byBinding) {
      if (bindingsEqual(regBinding, binding)) {
        for (const c of list) {
          if (c.when !== undefined && !c.when(ctx)) continue;
          return c;
        }
      }
    }
    return null;
  }

  /** Read-only snapshot of every registered command. */
  all(): readonly Command[] {
    return this.commands;
  }

  /** Commands sharing a single binding. Returned as a stable list of
   *  pairs so the cheat sheet can surface "press X to do A or B". */
  detectConflicts(): readonly ShortcutConflict[] {
    const conflicts: ShortcutConflict[] = [];
    for (const [binding, list] of this.byBinding) {
      if (list.length < 2) continue;
      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1];
        const cur = list[i];
        if (prev === undefined || cur === undefined) continue;
        conflicts.push({ binding, ids: [prev.id, cur.id] as const });
      }
    }
    return conflicts;
  }

  /** Group commands by category for the cheat sheet UI. Order is
   *  stable (insertion order of category types encountered). */
  byCategory(): ReadonlyMap<CommandCategory, readonly Command[]> {
    const out = new Map<CommandCategory, Command[]>();
    for (const c of this.commands) {
      const list = out.get(c.category) ?? [];
      list.push(c);
      out.set(c.category, list);
    }
    return out;
  }
}
