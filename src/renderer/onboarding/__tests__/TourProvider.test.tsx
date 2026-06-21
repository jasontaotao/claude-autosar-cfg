// @vitest-environment jsdom
// src/renderer/onboarding/__tests__/TourProvider.test.tsx
// v1.6.0 W — TourProvider component smoke tests.
//
// Contract (locked W spec §3.3):
//   - TourProvider wires the tourSlice into a React context
//   - Renders nothing (or null) when kind ∈ {idle, dismissed, completed, suppressed}
//   - Renders <TourOverlay /> when kind === 'running'
//   - Mounts a single overlay even if useTourStore is somehow double-subscribed
//
// TDD: this file pins the mount contract BEFORE implementation.

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TourProvider } from '../TourProvider.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function renderWith(tourState: Parameters<typeof TourProvider>[0]['tourState']): ReturnType<typeof render> {
  return render(
    <TourProvider
      tourState={tourState}
      locale="en"
      onAdvance={vi.fn()}
      onBack={vi.fn()}
      onSkip={vi.fn()}
      onFinish={vi.fn()}
    >
      <div data-testid="child">child</div>
    </TourProvider>,
  );
}

describe('TourProvider (v1.6.0 W)', () => {
  it('renders null when the slice is in idle state', () => {
    const { container } = renderWith({ kind: 'idle', validationPaused: false });
    expect(container.querySelector('[data-tour-overlay]')).toBeNull();
    expect(container.querySelector('[data-testid="child"]')).not.toBeNull();
  });

  it('renders null when the slice is in suppressed state', () => {
    const { container } = renderWith({ kind: 'suppressed', validationPaused: false });
    expect(container.querySelector('[data-tour-overlay]')).toBeNull();
  });

  it('renders null when the slice is in dismissed state', () => {
    const { container } = renderWith({ kind: 'dismissed', validationPaused: false });
    expect(container.querySelector('[data-tour-overlay]')).toBeNull();
  });

  it('renders null when the slice is in completed state', () => {
    const { container } = renderWith({ kind: 'completed', validationPaused: false });
    expect(container.querySelector('[data-tour-overlay]')).toBeNull();
  });

  it('renders the overlay container when the slice is in running state', () => {
    const { container } = renderWith({
      kind: 'running',
      currentStep: 0,
      validationPaused: true,
    });
    expect(container.querySelector('[data-tour-overlay]')).not.toBeNull();
  });

  it('passes currentStep through to the overlay as a data attribute', () => {
    const { container } = renderWith({
      kind: 'running',
      currentStep: 3,
      validationPaused: true,
    });
    const overlay = container.querySelector('[data-tour-overlay]');
    expect(overlay?.getAttribute('data-tour-step')).toBe('3');
  });

  it('always renders children (provider is a passthrough, not a guard)', () => {
    const { container } = renderWith({ kind: 'suppressed', validationPaused: false });
    const sentinel = container.querySelector('[data-testid="child"]');
    expect(sentinel).not.toBeNull();
    expect(sentinel?.textContent).toBe('child');
  });
});