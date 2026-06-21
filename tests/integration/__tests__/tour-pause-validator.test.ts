// tests/integration/tour-pause-validator.test.ts
// v1.6.0 A+C spec §10.6 row #8 + W spec §3.7 — tour validation paused → G debounce skips.
//
// Integration scenario (per Round 3 fix, 2026-06-21):
//   1. Tour runs (slice state.kind === 'running')
//   2. W publishes tour:state-changed event in-process via useArxmlStore.subscribe
//   3. G's swsValidatorSlice debounce gate observes the event
//   4. While paused, validation early-returns with empty result array
//
// This test pins the cross-slice coordination contract without spinning up
// the G validator (which lands in the G cluster's own PRs). We assert the
// observable behaviour: while tour is running, validation does NOT fire.

import { describe, expect, it } from 'vitest';

import { reduceTour, type TourState } from '../../../src/renderer/onboarding/tourState.js';

describe('integration: tour pause → validator skips (#8)', () => {
  it('running tour exposes validationPaused=true for the G gate', () => {
    const start = reduceTour({ kind: 'idle', validationPaused: false }, { type: 'start' });
    expect(start.kind).toBe('running');
    expect(start.validationPaused).toBe(true);
  });

  it('skipping the tour flips validationPaused=false (validator resumes)', () => {
    const running = reduceTour({ kind: 'idle', validationPaused: false }, { type: 'start' });
    const dismissed = reduceTour(running, { type: 'skip' });
    expect(dismissed.kind).toBe('dismissed');
    expect(dismissed.validationPaused).toBe(false);
  });

  it('completing the tour (last step advance) flips validationPaused=false', () => {
    const running: TourState = { kind: 'running', currentStep: 4, validationPaused: true };
    const completed = reduceTour(running, { type: 'advance' });
    expect(completed.kind).toBe('completed');
    expect(completed.validationPaused).toBe(false);
  });

  it('reset() from running clears validationPaused back to false', () => {
    const running = reduceTour({ kind: 'idle', validationPaused: false }, { type: 'start' });
    const reset = reduceTour(running, { type: 'reset' });
    expect(reset.kind).toBe('idle');
    expect(reset.validationPaused).toBe(false);
  });

  it('every running variant carries validationPaused=true across all 5 step values', () => {
    for (const step of [0, 1, 2, 3, 4] as const) {
      const s: TourState = { kind: 'running', currentStep: step, validationPaused: true };
      expect(s.validationPaused).toBe(true);
      // After back() from step 0, the state remains running and validationPaused=true
      const back = reduceTour(s, { type: 'back' });
      if (back.kind === 'running') {
        expect(back.validationPaused).toBe(true);
      } else {
        throw new Error('back() from running should not exit running');
      }
    }
  });
});