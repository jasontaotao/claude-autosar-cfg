// src/renderer/keyboard/normalizeKey.ts
// v1.6.0 Cluster U — cross-platform key event → binding string.
//
// Normalizes a `KeyboardEvent` (or a synthetic `{ key, modifiers }`
// shape) to the canonical `ShortcutBinding` form used by the registry.
// Handles:
//   - `Mod` ↔ Cmd/Ctrl aliasing based on `process.platform`
//   - Case normalization on letter keys (`O` / `o` both → `O`)
//   - Modifier order: `Mod`, `Shift`, `Alt` (then the key)
//   - F-key passthrough (`F1`..`F12`)
//   - Chord sequences: caller composes `firstBinding + ' ' + secondBinding`

import type { ModifierToken } from './types.js';

/** Map `process.platform` to the `Mod` modifier label. macOS → Meta,
 *  everything else → Control. Imported lazily so tests can swap it. */
let platformOverride: NodeJS.Platform | null = null;

export function _setPlatformForTest(p: NodeJS.Platform | null): void {
  platformOverride = p;
}

function resolvePlatform(): NodeJS.Platform {
  if (platformOverride !== null) return platformOverride;
  return resolvePlatformFromContext();
}

/** Public helper: resolve the host platform with the standard
 *  fallback chain (preload bridge → window.process → globalThis.process
 *  → 'win32'). Exposed so sibling helpers (e.g. ariaKeyshortcuts)
 *  stay in sync with test overrides via `_setPlatformForTest`. */
export function resolvePlatformFromContext(): NodeJS.Platform {
  if (platformOverride !== null) return platformOverride;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w: any = typeof globalThis !== 'undefined' ? (globalThis as any).window : undefined;
  if (w !== undefined && w.autosarApi !== undefined && typeof w.autosarApi.getPlatform === 'function') {
    return w.autosarApi.getPlatform() as NodeJS.Platform;
  }
  if (w !== undefined && typeof w.process?.platform === 'string') {
    return w.process.platform as NodeJS.Platform;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = typeof globalThis !== 'undefined' ? globalThis : undefined;
  if (g !== undefined && typeof g.process?.platform === 'string') {
    return g.process.platform as NodeJS.Platform;
  }
  return 'win32';
}

/** Returns the `Mod` modifier token for the current platform. */
export function modToken(): ModifierToken {
  return 'Mod';
}

/** Returns the `Event#key` value for the `Mod` modifier on the
 *  current platform — used when rendering bindings in the cheat
 *  sheet (Mac shows `⌘`, Win/Linux shows `Ctrl`). */
export function modLabel(): string {
  return resolvePlatform() === 'darwin' ? 'Cmd' : 'Ctrl';
}

/** Map a single modifier-key flag (ctrl/meta/alt/shift) to a token. */
function modifiersFromEvent(e: KeyboardEvent | SyntheticKeyEvent): readonly ModifierToken[] {
  const mods: ModifierToken[] = [];
  const mod = modToken();
  // Either Ctrl or Meta triggers `Mod` — the renderer normalizes via
  // platform so a single registry entry handles both ecosystems.
  if ((e.ctrlKey === true && mod === 'Mod') || (e.metaKey === true && mod === 'Mod')) {
    mods.push('Mod');
  } else {
    // Fallback path emits the raw OS-level token (not part of the
    // canonical `ModifierToken` set) — used only when callers pass a
    // synthetic event without a `mod` alias.
    if (e.ctrlKey === true) mods.push('Mod');
    if (e.metaKey === true) mods.push('Mod');
  }
  if (e.altKey === true) mods.push('Alt');
  if (e.shiftKey === true) mods.push('Shift');
  return mods;
}

/** Minimal structural type for synthetic events used in tests. */
interface SyntheticKeyEvent {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
}

/** Convert a keydown event into the canonical binding string.
 *
 *  - Letter keys → uppercase
 *  - Single-character symbols (`/`, `?`, `+`, `,`, `.`) pass through
 *  - Named keys (`Enter`, `Escape`, `ArrowUp`, `Tab`, ...) pass through
 *  - F-keys (`F1`..`F12`) pass through
 *  - Pure modifier presses (`key === 'Control'` / `'Shift'` / ...) → empty
 */
export function eventToBinding(e: KeyboardEvent | SyntheticKeyEvent): string {
  const mods = modifiersFromEvent(e);
  const key = normalizeKey(e.key);
  if (key === '') return '';
  return [...mods, key].join('+');
}

function normalizeKey(raw: string): string {
  if (raw === '') return '';
  // Pure modifier keys: ignore.
  if (
    raw === 'Control' ||
    raw === 'Shift' ||
    raw === 'Alt' ||
    raw === 'Meta' ||
    raw === 'OS'
  ) {
    return '';
  }
  // F-keys: pass through.
  if (/^F\d{1,2}$/.test(raw)) return raw;
  // Named keys: pass through.
  if (
    raw === 'Enter' ||
    raw === 'Escape' ||
    raw === 'Tab' ||
    raw === 'Backspace' ||
    raw === 'Delete' ||
    raw === 'ArrowUp' ||
    raw === 'ArrowDown' ||
    raw === 'ArrowLeft' ||
    raw === 'ArrowRight' ||
    raw === 'PageUp' ||
    raw === 'PageDown' ||
    raw === 'Home' ||
    raw === 'End' ||
    raw === ' ' ||
    raw === 'Spacebar'
  ) {
    return raw === 'Spacebar' ? 'Space' : raw;
  }
  // Single-character keys (letters, digits, symbols): uppercase letters.
  if (raw.length === 1) {
    return raw.toUpperCase();
  }
  // Anything else: return as-is (e.g. `+`, `,`, `?`).
  return raw;
}

/** Inverse helper — compare a registered binding to the live event.
 *  Used by ShortcutRegistry.lookup after it builds the event-derived
 *  binding; both sides are normalized via eventToBinding so 'Mod+O'
 *  and 'Mod+o' both match. */
export function bindingsEqual(a: string, b: string): boolean {
  return canonicalizeBinding(a) === canonicalizeBinding(b);
}

function canonicalizeBinding(b: string): string {
  const parts = b.split('+').map((s) => s.trim());
  if (parts.length === 0) return '';
  const key = parts[parts.length - 1] ?? '';
  const keyNorm = normalizeKey(key);
  if (keyNorm === '') return '';
  const mods = parts.slice(0, -1).map((m) => m.trim());
  // Dedup + sort modifiers (Mod / Shift / Alt order).
  const order: Record<string, number> = { Mod: 0, Ctrl: 0, Meta: 0, Shift: 1, Alt: 2 };
  const sortedMods = [...new Set(mods)]
    .filter((m) => m.length > 0)
    .sort((x, y) => (order[x] ?? 99) - (order[y] ?? 99));
  return [...sortedMods, keyNorm].join('+');
}

/** Format a binding for display in the cheat sheet / palette.
 *  Replaces `Mod` with the platform label (`Cmd` or `Ctrl`). */
export function formatBindingForDisplay(binding: string): string {
  const parts = binding.split('+').map((s) => s.trim());
  return parts
    .map((p) => {
      if (p === 'Mod') return modLabel();
      return p;
    })
    .join('+');
}