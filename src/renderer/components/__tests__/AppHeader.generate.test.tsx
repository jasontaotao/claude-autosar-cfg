// @vitest-environment jsdom
//
// AppHeader BSW generator button — v1.21.0 MINOR T1.
//
// Behaviour pinned by tests:
//   1. Renders the Generate button (data-testid="btn-generate")
//   2. Button is disabled when canGenerate=false (no project open)
//   3. Button is enabled when canGenerate=true
//   4. Clicking the button calls onGenerate
//   5. Button is disabled while generateBusy=true (in-flight IPC)

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useArxmlStore } from '../../store/useArxmlStore';
import { AppHeader } from '../AppHeader';

interface MockApi {
  readonly getAppVersion: ReturnType<typeof vi.fn>;
  readonly openArxmlMulti: ReturnType<typeof vi.fn>;
  readonly parseArxml: ReturnType<typeof vi.fn>;
  readonly saveArxml: ReturnType<typeof vi.fn>;
  readonly listScripts: ReturnType<typeof vi.fn>;
}

(globalThis as unknown as { window: { autosarApi: MockApi } }).window.autosarApi = {
  getAppVersion: vi.fn().mockResolvedValue('0.9.5'),
  openArxmlMulti: vi.fn().mockResolvedValue({ kind: 'canceled' }),
  parseArxml: vi.fn(),
  saveArxml: vi.fn(),
  listScripts: vi.fn().mockResolvedValue({ scripts: [] }),
};

function renderHeader(args: {
  readonly onGenerate?: () => void;
  readonly canGenerate?: boolean;
  readonly generateBusy?: boolean;
}): void {
  render(
    <AppHeader
      onEcucModuleSelect={(): void => {}}
      canSelectEcucModule={false}
      scriptPanelOpen={false}
      onToggleScriptPanel={(): void => {}}
      onGenerate={args.onGenerate ?? ((): void => {})}
      canGenerate={args.canGenerate ?? false}
      generateBusy={args.generateBusy ?? false}
    />,
  );
}

describe('AppHeader BSW generate button (v1.21.0 MINOR T1)', () => {
  afterEach(() => {
    cleanup();
    useArxmlStore.getState().clear();
  });

  it('renders the Generate button', () => {
    renderHeader({});
    const btn = screen.getByTestId('btn-generate');
    expect(btn).not.toBeNull();
    expect(btn.tagName.toLowerCase()).toBe('button');
  });

  it('is disabled when canGenerate=false (no project open)', () => {
    renderHeader({ canGenerate: false });
    expect(screen.getByTestId('btn-generate').hasAttribute('disabled')).toBe(true);
  });

  it('is enabled when canGenerate=true (project open)', () => {
    renderHeader({ canGenerate: true });
    expect(screen.getByTestId('btn-generate').hasAttribute('disabled')).toBe(false);
  });

  it('clicking the enabled button calls onGenerate', () => {
    const onGenerate = vi.fn();
    renderHeader({ canGenerate: true, onGenerate });
    fireEvent.click(screen.getByTestId('btn-generate'));
    expect(onGenerate).toHaveBeenCalledOnce();
  });

  it('is disabled while generateBusy=true even when canGenerate=true', () => {
    renderHeader({ canGenerate: true, generateBusy: true });
    expect(screen.getByTestId('btn-generate').hasAttribute('disabled')).toBe(true);
  });
});
