// @vitest-environment jsdom
// src/renderer/onboarding/__tests__/TourOverlay.test.tsx
// v1.6.0 W — TourOverlay 5-step navigation + target resolution.
//
// Contract (locked W spec §2.4):
//   - Overlay renders 5 steps in order
//   - Step content uses i18n keys; data-tour-id attribute on target element
//   - Prev/Next/Skip buttons call slice actions
//   - Last step's Next button label is "Finish"
//   - When target selector misses, overlay falls back to a centered bubble
//
// TDD: this file pins the 5-step navigation contract BEFORE implementation.
// jsdom does not compute layout — we stub `getBoundingClientRect` to
// simulate real layout for the "found" path.

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TourOverlay } from '../TourOverlay.js';
import { TOUR_STEPS } from '../tourTargets.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

function makeTargetStub(targetId: string): HTMLElement {
  const div = document.createElement('div');
  div.setAttribute('data-tour-id', targetId);
  div.style.position = 'absolute';
  div.style.top = '100px';
  div.style.left = '100px';
  div.style.width = '200px';
  div.style.height = '50px';
  document.body.appendChild(div);
  vi.spyOn(div, 'getBoundingClientRect').mockReturnValue({
    top: 100,
    left: 100,
    width: 200,
    height: 50,
    right: 300,
    bottom: 150,
    x: 100,
    y: 100,
    toJSON: () => ({}),
  });
  return div;
}

describe('TourOverlay (v1.6.0 W)', () => {
  it('renders the 5-step static definition', () => {
    expect(TOUR_STEPS).toHaveLength(5);
    expect(TOUR_STEPS[0]?.targetId).toBe('app-header');
    expect(TOUR_STEPS[1]?.targetId).toBe('left-panel');
    expect(TOUR_STEPS[2]?.targetId).toBe('arxml-panel');
    expect(TOUR_STEPS[3]?.targetId).toBe('right-pane-content');
    expect(TOUR_STEPS[4]?.targetId).toBe('app-save');
  });

  it('places the bubble adjacent to the resolved target', () => {
    makeTargetStub('app-header');
    render(
      <TourOverlay
        currentStep={0}
        locale="en"
        onAdvance={vi.fn()}
        onBack={vi.fn()}
        onSkip={vi.fn()}
        onFinish={vi.fn()}
      />,
    );
    const overlay = document.querySelector('[data-tour-overlay-step="0"]');
    expect(overlay).not.toBeNull();
    const spotlight = overlay?.querySelector('[data-tour-spotlight]');
    expect(spotlight).not.toBeNull();
  });

  it('falls back to a centered bubble when the target selector misses', () => {
    // No target injected — overlay should still render the bubble (centered).
    render(
      <TourOverlay
        currentStep={0}
        locale="en"
        onAdvance={vi.fn()}
        onBack={vi.fn()}
        onSkip={vi.fn()}
        onFinish={vi.fn()}
      />,
    );
    const overlay = document.querySelector('[data-tour-overlay-step="0"]');
    expect(overlay).not.toBeNull();
    const bubble = overlay?.querySelector('[data-tour-bubble="centered"]');
    expect(bubble).not.toBeNull();
  });

  it('emits onAdvance when the next button is clicked', () => {
    const onAdvance = vi.fn();
    makeTargetStub('app-header');
    render(
      <TourOverlay
        currentStep={0}
        locale="en"
        onAdvance={onAdvance}
        onBack={vi.fn()}
        onSkip={vi.fn()}
        onFinish={vi.fn()}
      />,
    );
    const nextBtn = document.querySelector('[data-tour-action="next"]') as HTMLButtonElement | null;
    expect(nextBtn).not.toBeNull();
    nextBtn?.click();
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it('emits onSkip when the skip button is clicked', () => {
    const onSkip = vi.fn();
    render(
      <TourOverlay
        currentStep={0}
        locale="en"
        onAdvance={vi.fn()}
        onBack={vi.fn()}
        onSkip={onSkip}
        onFinish={vi.fn()}
      />,
    );
    const skipBtn = document.querySelector('[data-tour-action="skip"]') as HTMLButtonElement | null;
    expect(skipBtn).not.toBeNull();
    skipBtn?.click();
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('labels the next button as "Finish" on the last step (4)', () => {
    render(
      <TourOverlay
        currentStep={4}
        locale="en"
        onAdvance={vi.fn()}
        onBack={vi.fn()}
        onSkip={vi.fn()}
        onFinish={vi.fn()}
      />,
    );
    const nextBtn = document.querySelector('[data-tour-action="next"]') as HTMLButtonElement | null;
    expect(nextBtn?.getAttribute('data-tour-action-label')).toBe('finish');
  });

  it('disables the back button on step 0', () => {
    render(
      <TourOverlay
        currentStep={0}
        locale="en"
        onAdvance={vi.fn()}
        onBack={vi.fn()}
        onSkip={vi.fn()}
        onFinish={vi.fn()}
      />,
    );
    const backBtn = document.querySelector('[data-tour-action="back"]') as HTMLButtonElement | null;
    expect(backBtn?.hasAttribute('disabled')).toBe(true);
  });

  it('emits onBack when the back button is clicked on step ≥ 1', () => {
    const onBack = vi.fn();
    render(
      <TourOverlay
        currentStep={2}
        locale="en"
        onAdvance={vi.fn()}
        onBack={onBack}
        onSkip={vi.fn()}
        onFinish={vi.fn()}
      />,
    );
    const backBtn = document.querySelector('[data-tour-action="back"]') as HTMLButtonElement | null;
    expect(backBtn?.hasAttribute('disabled')).toBe(false);
    backBtn?.click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});