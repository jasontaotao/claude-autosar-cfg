// src/renderer/app/useAppHeaderShell.ts
// Closure-scoped hook for AppHeader.tsx shell lifecycle state.
//
// Extracted from `src/renderer/components/AppHeader.tsx` as part of
// v1.42.4 PATCH (final cleanup pass after v1.42.2 sub-components +
// v1.42.3 handler cluster hook). AppHeader.tsx is the only consumer;
// the hook returns a 4-field bundle that AppHeader.tsx destructures
// once at the top and propagates to its 3 sub-components + StencilWizard
// mount.
//
// Public surface: 3 read-only state slots + 1 imperative close action
// = 4 return fields.
//
// **Why this hook exists**: v1.42.3 extracted the handler cluster to
// `useAppHeaderHandlers()`. The remaining shell lifecycle state —
// 3 useState (appVersion + stencilOpen + stencilFlagOn) + 3 useEffect
// (feature flag IPC + CustomEvent listener + app version IPC) — is
// a coherent cluster that owns no handlers, no async work, just
// state + effects. Extracting it here lets the shell shrink to a
// near-pure JSX file.
//
// **Why `closeStencil` is exposed (not just `stencilOpen`)**:
// StencilWizard's `onClose` prop is the existing close path (per
// `src/renderer/components/StencilWizard/StencilWizard.tsx` line 51).
// The shell renders `<StencilWizard onClose={...} />` so the wizard
// can fire its close button / Esc / backdrop to dismiss. The setter
// for `stencilOpen` lives inside this hook; the shell can't call it
// directly. `closeStencil` exposes the imperative close action so
// the shell can pass it as the `onClose` prop without re-introducing
// the setter into the shell's scope.

import { useEffect, useState } from 'react';

import { refreshStencilFlag as refreshStencilFlagCache } from '../keyboard/shortcuts/palette.js';

export type AppHeaderShell = {
  /** App version string from the `getAppVersion` IPC + v1.11.4 PATCH-B
   *  fallback chain. Read-only. Passed to `<AppHeaderStatusBadge>`
   *  via prop. */
  readonly appVersion: string;
  /** StencilWizard mount gate. `true` when the Cmd-K palette dispatched
   *  `stencil:open` (or future external triggers). Read-only. */
  readonly stencilOpen: boolean;
  /** Feature flag gate for the Stencil Wizard menu entry. `true` when
   *  `experimental.stencilWizard` is ON. Read-only. Passed to the
   *  BrandMenu children render-prop as `{stencilFlagOn && <button>}`. */
  readonly stencilFlagOn: boolean;
  /** Imperative close action for the StencilWizard. Passed to
   *  `<StencilWizard onClose={closeStencil} />` so the wizard's
   *  internal Esc / backdrop / ×-button can dismiss itself without
   *  the shell needing direct setter access. */
  readonly closeStencil: () => void;
};

export function useAppHeaderShell(): AppHeaderShell {
  // 3 useState — all read-only via the hook return; setters stay
  // closure-local because no external code (other than the 3 useEffect
  // below) writes to them.
  const [appVersion, setAppVersion] = useState<string>('…');
  const [stencilOpen, setStencilOpen] = useState(false);
  const [stencilFlagOn, setStencilFlagOn] = useState(false);

  // Effect 1 — feature flag fetch + cache refresh.
  // v1.8.0 K Task 7 — refresh the cache then fetch `experimental.
  // stencilWizard` from the main process. On flag fetch rejection
  // (e.g. preload bridge failure) we conservatively set the flag OFF
  // so stale menu entries cannot open a wizard that main will reject.
  useEffect(() => {
    refreshStencilFlagCache();
    const api = (
      globalThis as { window?: { autosarApi?: { getFeatureFlags?: () => Promise<unknown> } } }
    ).window?.autosarApi;
    if (api === undefined || typeof api.getFeatureFlags !== 'function') return;
    let cancelled = false;
    void api
      .getFeatureFlags()
      .then((reply) => {
        if (cancelled) return;
        const flag = (reply as { experimental?: { stencilWizard?: boolean } } | undefined)
          ?.experimental?.stencilWizard;
        setStencilFlagOn(flag === true);
      })
      .catch(() => {
        if (cancelled) return;
        setStencilFlagOn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Effect 2 — `stencil:open` CustomEvent listener on `window`.
  // The Cmd-K palette command dispatches this event so the wizard has
  // a single owner. Future triggers (e.g. toolbar button) can dispatch
  // the same event.
  useEffect(() => {
    const handler = (): void => {
      setStencilOpen(true);
    };
    window.addEventListener('stencil:open', handler);
    return () => window.removeEventListener('stencil:open', handler);
  }, []);

  // Effect 3 — app version IPC fetch with v1.11.4 PATCH-B + v1.12.0
  // PATCH D3 fallback chain. Distinguishes 3 failure modes:
  //   - autosarApi entirely undefined → 'dev' (E2E harness; expected)
  //   - autosarApi present but getAppVersion missing → '?' (production
  //     anomaly: preload bridge failure or future IPC refactor)
  //   - getAppVersion promise rejected → '?' (IPC call threw)
  useEffect(() => {
    const api = window.autosarApi;
    if (api === undefined) {
      setAppVersion('dev');
      return;
    }
    if (typeof api.getAppVersion !== 'function') {
      setAppVersion('?');
      return;
    }
    let cancelled = false;
    void api
      .getAppVersion()
      .then((v) => {
        if (cancelled) return;
        setAppVersion(v);
      })
      .catch(() => {
        if (cancelled) return;
        setAppVersion('?');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    appVersion,
    stencilOpen,
    stencilFlagOn,
    closeStencil: () => setStencilOpen(false),
  };
}
