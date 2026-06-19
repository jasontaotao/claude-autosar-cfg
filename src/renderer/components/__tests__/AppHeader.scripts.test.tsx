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