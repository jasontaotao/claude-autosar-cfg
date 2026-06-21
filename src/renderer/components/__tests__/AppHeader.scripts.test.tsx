// @vitest-environment jsdom
//
// AppHeader scripts toggle — Sprint 14 #1 Phase C (T14).
//
// Behaviour pinned by tests:
//   1. Renders a "Scripts" toggle button (data-testid="btn-scripts-toggle")
//   2. Clicking the toggle calls onToggleScriptPanel
//   3. aria-pressed reflects the scriptPanelOpen prop
//   4. is-active CSS class reflects the scriptPanelOpen prop

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { refreshStencilFlag, isStencilFlagCached } from '../../keyboard/shortcuts/palette.js';
import { useArxmlStore } from '../../store/useArxmlStore';
import { AppHeader } from '../AppHeader';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window.autosarApi = {
  getAppVersion: vi.fn().mockResolvedValue('0.9.5'),
  openArxmlMulti: vi.fn().mockResolvedValue({ kind: 'canceled' }),
  parseArxml: vi.fn(),
  saveArxml: vi.fn(),
  listScripts: vi.fn().mockResolvedValue({ scripts: [] }),
};

describe('AppHeader scripts toggle (S14#1 T14)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
    useArxmlStore.getState().setLocale('en');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the Scripts toggle button', () => {
    render(
      <AppHeader
        onEcucModuleSelect={(): void => {}}
        canSelectEcucModule={false}
        scriptPanelOpen={false}
        onToggleScriptPanel={(): void => {}}
      />,
    );
    expect(screen.getByTestId('btn-scripts-toggle')).not.toBeNull();
  });

  it('clicking the toggle calls onToggleScriptPanel', () => {
    const onToggle = vi.fn();
    render(
      <AppHeader
        onEcucModuleSelect={(): void => {}}
        canSelectEcucModule={false}
        scriptPanelOpen={false}
        onToggleScriptPanel={onToggle}
      />,
    );
    fireEvent.click(screen.getByTestId('btn-scripts-toggle'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('aria-pressed and class reflect scriptPanelOpen=true', () => {
    render(
      <AppHeader
        onEcucModuleSelect={(): void => {}}
        canSelectEcucModule={false}
        scriptPanelOpen={true}
        onToggleScriptPanel={(): void => {}}
      />,
    );
    const btn = screen.getByTestId('btn-scripts-toggle');
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.className).toContain('is-active');
  });

  it('aria-pressed is false when panel is closed', () => {
    render(
      <AppHeader
        onEcucModuleSelect={(): void => {}}
        canSelectEcucModule={false}
        scriptPanelOpen={false}
        onToggleScriptPanel={(): void => {}}
      />,
    );
    const btn = screen.getByTestId('btn-scripts-toggle');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.className).not.toContain('is-active');
  });
});

// ---------------------------------------------------------------------------
// v1.8.0 K — Task 7: Stencil Wizard menu entry + flag gating.
//
// The "New from Stencil..." entry lives under the fileOps group in
// the File menu and is hidden when `experimental.stencilWizard` is
// OFF (the default). The flag is read via the existing
// `feature-flags:get` IPC, so we seed the window stub per test.
// ---------------------------------------------------------------------------

describe('AppHeader Stencil Wizard menu entry (v1.8.0 K Task 7)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
    useArxmlStore.getState().setLocale('en');
    refreshStencilFlag();
  });

  it('does NOT render the entry when stencilWizard flag is OFF (default)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = {
      getAppVersion: vi.fn().mockResolvedValue('0.9.5'),
      openArxmlMulti: vi.fn().mockResolvedValue({ kind: 'canceled' }),
      parseArxml: vi.fn(),
      saveArxml: vi.fn(),
      getFeatureFlags: vi.fn().mockResolvedValue({
        experimental: {
          onboarding: false,
          streaming: false,
          indexedDb: false,
          headlessCli: false,
          swsValidator: false,
          keyboardFirst: false,
          stencilWizard: false,
        },
      }),
    };
    render(
      <AppHeader
        onEcucModuleSelect={(): void => {}}
        canSelectEcucModule={false}
        scriptPanelOpen={false}
        onToggleScriptPanel={(): void => {}}
      />,
    );
    expect(screen.queryByTestId('btn-stencil-new')).toBeNull();
    expect(isStencilFlagCached()).toBe(false);
  });

  it('renders the entry when stencilWizard flag is ON', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = {
      getAppVersion: vi.fn().mockResolvedValue('0.9.5'),
      openArxmlMulti: vi.fn().mockResolvedValue({ kind: 'canceled' }),
      parseArxml: vi.fn(),
      saveArxml: vi.fn(),
      getFeatureFlags: vi.fn().mockResolvedValue({
        experimental: {
          onboarding: false,
          streaming: false,
          indexedDb: false,
          headlessCli: false,
          swsValidator: false,
          keyboardFirst: false,
          stencilWizard: true,
        },
      }),
    };
    render(
      <AppHeader
        onEcucModuleSelect={(): void => {}}
        canSelectEcucModule={false}
        scriptPanelOpen={false}
        onToggleScriptPanel={(): void => {}}
      />,
    );
    // Open the dropdown so the entry is visible.
    fireEvent.click(screen.getByTestId('menu-project-trigger').querySelector('button')!);
    const entry = await screen.findByTestId('btn-stencil-new');
    expect(entry).toBeInTheDocument();
    expect(entry.textContent).toMatch(/New from Stencil/);
    // The palette cache should now reflect the ON state.
    await vi.waitFor(() => expect(isStencilFlagCached()).toBe(true));
  });
});
