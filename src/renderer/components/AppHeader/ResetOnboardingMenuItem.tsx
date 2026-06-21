// src/renderer/components/AppHeader/ResetOnboardingMenuItem.tsx
// v1.6.0 Cluster U — Help menu item that calls W `tour:reset` IPC.
//
// Per U spec §3.4 + §11.1: this component is the renderer-side
// consumer of W's `tour:reset` channel. The IPC contract is injected
// via props (`tourIpc`) so AppHeader does not need to know about W.
//
// Visibility rules:
//   - Render only when `hasOpenProject === true` AND the
//     `experimental.keyboardFirst` flag is ON (per U spec §8.6).
//     The flag is checked by the parent (AppHeader) and passed in
//     implicitly via the `hasOpenProject` prop (when the flag is OFF,
//     AppHeader does not mount this item at all).
//
// Failure path (per U spec §6.6): on `reset()` rejection, the catch
// logs a `console.warn` and keeps the menu enabled (user can retry).
// No toast — W owns the toast UI per W §3.2.

import { type JSX } from 'react';

import { t, type Locale } from '@shared/i18n';

import { type TourIpcContract } from '../../lib/TourIpcContract.js';

export interface ResetOnboardingMenuItemProps {
  readonly tourIpc: TourIpcContract;
  readonly hasOpenProject: boolean;
  readonly locale: Locale;
}

export function ResetOnboardingMenuItem({
  tourIpc,
  hasOpenProject,
  locale,
}: ResetOnboardingMenuItemProps): JSX.Element | null {
  if (!hasOpenProject) return null;

  const onClick = (): void => {
    void tourIpc.reset().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.warn('[tour] reset failed:', message);
    });
  };

  return (
    <button
      type="button"
      className="app-dropdown-item"
      role="menuitem"
      onClick={onClick}
      data-testid="menu-reset-onboarding"
    >
      <span className="app-dropdown-icon" aria-hidden="true">
        ↻
      </span>
      {t(locale, 'help.menu.resetOnboarding')}
    </button>
  );
}