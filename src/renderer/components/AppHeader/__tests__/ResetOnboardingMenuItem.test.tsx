// src/renderer/components/AppHeader/__tests__/ResetOnboardingMenuItem.test.tsx
// v1.6.0 Cluster U — ResetOnboardingMenuItem behavior tests (TDD).
//
// Per U spec §11.1 — three test cases:
//   1. visible-when-enabled
//   2. click-dispatches-ipc
//   3. hidden-when-no-project

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// @vitest-environment jsdom

import { createStubTourIpcContract, type TourIpcContract } from '../../../lib/TourIpcContract.js';
import { ResetOnboardingMenuItem } from '../ResetOnboardingMenuItem.js';

describe('ResetOnboardingMenuItem (v1.6.0 U)', () => {
  it('renders the menu item when project is open', () => {
    const tourIpc = createStubTourIpcContract();
    render(
      <ul>
        <ResetOnboardingMenuItem tourIpc={tourIpc} hasOpenProject={true} locale="en" />
      </ul>,
    );
    expect(screen.getByText(/reset onboarding/i)).toBeInTheDocument();
  });

  it('does NOT render when no project is open', () => {
    const tourIpc = createStubTourIpcContract();
    const { container } = render(
      <ul>
        <ResetOnboardingMenuItem tourIpc={tourIpc} hasOpenProject={false} locale="en" />
      </ul>,
    );
    expect(container.querySelector('[data-testid="menu-reset-onboarding"]')).toBeNull();
  });

  it('clicking the menu item calls tourIpc.reset()', () => {
    const tourIpc: TourIpcContract = {
      ...createStubTourIpcContract(),
      reset: vi.fn().mockResolvedValue(undefined),
    };
    render(
      <ul>
        <ResetOnboardingMenuItem tourIpc={tourIpc} hasOpenProject={true} locale="en" />
      </ul>,
    );
    fireEvent.click(screen.getByTestId('menu-reset-onboarding'));
    expect(tourIpc.reset).toHaveBeenCalledTimes(1);
  });

  it('catches and console.warns when tourIpc.reset() rejects (no toast per U spec)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const tourIpc: TourIpcContract = {
      ...createStubTourIpcContract(),
      reset: vi.fn().mockRejectedValue(new Error('IPC failed')),
    };
    render(
      <ul>
        <ResetOnboardingMenuItem tourIpc={tourIpc} hasOpenProject={true} locale="en" />
      </ul>,
    );
    fireEvent.click(screen.getByTestId('menu-reset-onboarding'));
    // Wait for the rejected promise + the catch handler.
    await new Promise((r) => setTimeout(r, 0));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
