// src/renderer/keyboard/shortcuts/palette.ts
// v1.6.0 Cluster U — Palette category shortcut definitions (1 command).
// v1.8.0 K — Stencil Wizard (Task 7). Adds the
// `palette.stencilNew` command bound to `Mod+K` so the Cmd-K palette
// surfaces the wizard. The `when` predicate gates the command on the
// `experimental.stencilWizard` feature flag — same gate the File menu
// uses, so the entry is hidden from the palette when the flag is OFF
// (no stale triggers). The flag is read via the existing
// `feature-flags:get` IPC; the optional `stencilWizard` field is
// projected via a narrow cast so a future IPC handler can add it
// without breaking this module's compile.

import type { Command } from '../ShortcutRegistry.js';

interface StencilFlagResponse {
  readonly experimental?: { readonly stencilWizard?: boolean };
}

async function isStencilFlagOn(): Promise<boolean> {
  const api = (globalThis as { window?: { autosarApi?: { getFeatureFlags?: () => Promise<unknown> } } })
    .window?.autosarApi;
  if (api === undefined || typeof api.getFeatureFlags !== 'function') return false;
  try {
    const reply = (await api.getFeatureFlags()) as StencilFlagResponse;
    return reply.experimental?.stencilWizard === true;
  } catch {
    return false;
  }
}

export const paletteCommands: readonly Command[] = [
  {
    id: 'palette.toggle',
    labelKey: 'shortcut.palette.toggle',
    category: 'palette',
    bindings: ['Mod+K'],
    run: () => undefined,
  },
  {
    id: 'palette.stencilNew',
    labelKey: 'stencil.title',
    category: 'palette',
    bindings: ['Mod+Shift+N'],
    // The `when` predicate is async (feature flag read) so we resolve
    // it synchronously via a cached lookup. The flag defaults to OFF,
    // so this command is effectively no-op when the IPC reply is
    // missing the `stencilWizard` field — which is the v1.6.0 default.
    when: () => stencilFlagCache,
    run: () => {
      if (!stencilFlagCache) return;
      // Defer to the AppHeader menu trigger so a single owner opens
      // the wizard. AppHeader wires `data-testid="btn-stencil-new"`
      // and listens for a `stencil:open` CustomEvent on `window`.
      window.dispatchEvent(new CustomEvent('stencil:open'));
    },
  },
];

// Synchronous mirror of `isStencilFlagOn()` for the `when` predicate.
// AppHeader calls `refreshStencilFlag()` on mount and on focus so the
// palette re-evaluates without a per-keystroke async round-trip. The
// value defaults to false so the command is hidden in production
// (matches the default-OFF contract from `feature-flag.ts`).
let stencilFlagCache = false;

export function refreshStencilFlag(): void {
  void isStencilFlagOn().then((v) => {
    stencilFlagCache = v;
  });
}

export function isStencilFlagCached(): boolean {
  return stencilFlagCache;
}
