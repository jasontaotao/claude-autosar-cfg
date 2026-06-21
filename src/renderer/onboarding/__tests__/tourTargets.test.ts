// @vitest-environment jsdom
// src/renderer/onboarding/__tests__/tourTargets.test.ts
// v1.6.0 W — Tour step target lookup helper.
//
// Contract (locked W spec §2.4):
//   - `resolveTourTarget(targetId)` returns the DOMRect of the matching
//     `[data-tour-id]` element, or null when the selector misses
//   - The 5 step definitions live in TOUR_STEPS (pure data, no runtime
//     side effects)
//
// TDD: pins the resolver contract BEFORE the overlay consumes it.
// jsdom does not compute layout — we stub `getBoundingClientRect` to
// simulate real layout for the "found" path.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { TOUR_STEPS, resolveTourTarget } from '../tourTargets.js';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('TOUR_STEPS (v1.6.0 W)', () => {
  it('contains exactly 5 entries with index 0..4', () => {
    expect(TOUR_STEPS).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(TOUR_STEPS[i]?.index).toBe(i);
    }
  });

  it('every step has a non-empty targetId, titleKey, bodyKey, placement', () => {
    for (const step of TOUR_STEPS) {
      expect(step.targetId.length).toBeGreaterThan(0);
      expect(step.titleKey.length).toBeGreaterThan(0);
      expect(step.bodyKey.length).toBeGreaterThan(0);
      expect(['top', 'bottom', 'left', 'right', 'center']).toContain(step.placement);
    }
  });
});

describe('resolveTourTarget (v1.6.0 W)', () => {
  it('returns null when the target selector misses', () => {
    expect(resolveTourTarget('does-not-exist')).toBeNull();
  });

  it('returns a DOMRect when the target element exists', () => {
    const div = document.createElement('div');
    div.setAttribute('data-tour-id', 'app-header');
    document.body.appendChild(div);
    vi.spyOn(div, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      left: 0,
      width: 800,
      height: 60,
      right: 800,
      bottom: 60,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const rect = resolveTourTarget('app-header');
    expect(rect).not.toBeNull();
    expect(rect?.width).toBe(800);
  });

  it('returns null when the element has zero width/height (jsdom default)', () => {
    const div = document.createElement('div');
    div.setAttribute('data-tour-id', 'zero-size-target');
    document.body.appendChild(div);
    // No mock — jsdom returns 0×0 → resolves to null (overlay falls back)
    expect(resolveTourTarget('zero-size-target')).toBeNull();
  });
});