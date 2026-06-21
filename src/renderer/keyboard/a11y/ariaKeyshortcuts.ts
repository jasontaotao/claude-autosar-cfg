// src/renderer/keyboard/a11y/ariaKeyshortcuts.ts
// v1.6.0 Cluster U — convert a ShortcutBinding to the W3C aria-keyshortcuts
// grammar so screen readers can announce the binding.
//
// Spec: https://www.w3.org/TR/wai-aria-1.2/#aria-keyshortcuts
//
// The grammar uses '+' to separate modifiers and the standard key
// names: "Control", "Shift", "Alt", "Meta", and the literal key.
// We translate our `Mod` alias to the platform-appropriate name
// (Meta on macOS, Control elsewhere) since the aria grammar does not
// have a portable `Mod` token.

import { resolvePlatformFromContext } from '../normalizeKey.js';

const MODIFIER_TO_ARIA: Record<string, string> = {
  Mod: 'Mod',
  Shift: 'Shift',
  Alt: 'Alt',
  Ctrl: 'Control',
  Meta: 'Meta',
};

const KEY_TO_ARIA: Record<string, string> = {
  Enter: 'Enter',
  Escape: 'Escape',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Home: 'Home',
  End: 'End',
  ' ': 'Space',
  Space: 'Space',
};

export function bindingToAriaKeyshortcuts(binding: string): string {
  const parts = binding
    .split('+')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return '';
  const key = parts[parts.length - 1] ?? '';
  const mods = parts.slice(0, -1);
  const isDarwin = resolvePlatformFromContext() === 'darwin';
  const ariaMods = mods.map((m) => {
    if (m === 'Mod') {
      return isDarwin ? 'Meta' : 'Control';
    }
    return MODIFIER_TO_ARIA[m] ?? m;
  });
  const ariaKey = KEY_TO_ARIA[key] ?? key.toUpperCase();
  return [...ariaMods, ariaKey].join('+');
}
