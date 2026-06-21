// src/renderer/onboarding/__tests__/TourState.test.ts
// v1.6.0 W — TourState 5-variant union transitions + validationPaused field.
//
// Contract (locked W spec §3.3):
//   - TourState is a 5-variant union: idle | running | completed | dismissed | suppressed
//   - Every variant carries `validationPaused: boolean`
//   - `validationPaused === true` only when `kind === 'running'` (G cluster debounce gate)
//   - Transitions are explicit; no implicit flips
//
// TDD: this file pins the contract BEFORE implementation. The reducer
// itself lives at src/renderer/onboarding/tourState.ts and is intentionally
// a pure-function module so it can be unit-tested without React.

import { describe, expect, it } from 'vitest';

import {
  initialTourState,
  reduceTour,
  type TourAction,
  type TourState,
} from '../tourState.js';

describe('TourState (v1.6.0 W)', () => {
  describe('initial state', () => {
    it('starts at kind="idle" with validationPaused=false', () => {
      const s = initialTourState();
      expect(s.kind).toBe('idle');
      expect(s.validationPaused).toBe(false);
    });
  });

  describe('idle → running transition', () => {
    it('start() from idle flips kind to running, currentStep=0, validationPaused=true', () => {
      const start: TourAction = { type: 'start' };
      const next = reduceTour(initialTourState(), start);
      expect(next.kind).toBe('running');
      if (next.kind === 'running') {
        expect(next.currentStep).toBe(0);
      }
      expect(next.validationPaused).toBe(true);
    });
  });

  describe('running transitions', () => {
    function runningAt(step: 0 | 1 | 2 | 3 | 4): TourState {
      return {
        kind: 'running',
        currentStep: step,
        validationPaused: true,
      };
    }

    it('advance() at last step (4) → completed, validationPaused=false', () => {
      const next = reduceTour(runningAt(4), { type: 'advance' });
      expect(next.kind).toBe('completed');
      expect(next.validationPaused).toBe(false);
    });

    it('advance() at step 0-3 stays running and increments', () => {
      const next = reduceTour(runningAt(0), { type: 'advance' });
      expect(next.kind).toBe('running');
      if (next.kind === 'running') {
        expect(next.currentStep).toBe(1);
      }
      expect(next.validationPaused).toBe(true);
    });

    it('advance() at step 3 increments to 4 (still running, not completed)', () => {
      const next = reduceTour(runningAt(3), { type: 'advance' });
      expect(next.kind).toBe('running');
      if (next.kind === 'running') {
        expect(next.currentStep).toBe(4);
      }
      expect(next.validationPaused).toBe(true);
    });

    it('back() from step 0 stays at 0 (clamped)', () => {
      const next = reduceTour(runningAt(0), { type: 'back' });
      expect(next.kind).toBe('running');
      if (next.kind === 'running') {
        expect(next.currentStep).toBe(0);
      }
    });

    it('back() from step 3 decrements to 2', () => {
      const next = reduceTour(runningAt(3), { type: 'back' });
      expect(next.kind).toBe('running');
      if (next.kind === 'running') {
        expect(next.currentStep).toBe(2);
      }
    });

    it('skip() from running → dismissed, validationPaused=false', () => {
      const next = reduceTour(runningAt(2), { type: 'skip' });
      expect(next.kind).toBe('dismissed');
      expect(next.validationPaused).toBe(false);
    });
  });

  describe('terminal state immutability', () => {
    it('completed ignores advance/back/start', () => {
      const c: TourState = { kind: 'completed', validationPaused: false };
      expect(reduceTour(c, { type: 'advance' })).toEqual(c);
      expect(reduceTour(c, { type: 'back' })).toEqual(c);
      expect(reduceTour(c, { type: 'start' })).toEqual(c);
    });

    it('dismissed ignores advance/back/start/skip', () => {
      const d: TourState = { kind: 'dismissed', validationPaused: false };
      expect(reduceTour(d, { type: 'advance' })).toEqual(d);
      expect(reduceTour(d, { type: 'back' })).toEqual(d);
      expect(reduceTour(d, { type: 'skip' })).toEqual(d);
    });

    it('suppressed ignores every action except reset', () => {
      const sp: TourState = { kind: 'suppressed', validationPaused: false };
      expect(reduceTour(sp, { type: 'start' })).toEqual(sp);
      expect(reduceTour(sp, { type: 'advance' })).toEqual(sp);
      expect(reduceTour(sp, { type: 'back' })).toEqual(sp);
      expect(reduceTour(sp, { type: 'skip' })).toEqual(sp);
    });
  });

  describe('reset() from any state', () => {
    it('running → idle (reset clears validationPaused)', () => {
      const r: TourState = { kind: 'running', currentStep: 2, validationPaused: true };
      const next = reduceTour(r, { type: 'reset' });
      expect(next.kind).toBe('idle');
      expect(next.validationPaused).toBe(false);
    });

    it('completed → idle', () => {
      const c: TourState = { kind: 'completed', validationPaused: false };
      expect(reduceTour(c, { type: 'reset' }).kind).toBe('idle');
    });

    it('dismissed → idle', () => {
      const d: TourState = { kind: 'dismissed', validationPaused: false };
      expect(reduceTour(d, { type: 'reset' }).kind).toBe('idle');
    });

    it('suppressed → idle', () => {
      const sp: TourState = { kind: 'suppressed', validationPaused: false };
      expect(reduceTour(sp, { type: 'reset' }).kind).toBe('idle');
    });
  });

  describe('suppress() — 7-day timer transition (any → suppressed)', () => {
    it('idle with elapsedDays=8 (>7) → suppressed', () => {
      const next = reduceTour(initialTourState(), { type: 'suppress', elapsedDays: 8 });
      expect(next.kind).toBe('suppressed');
    });

    it('idle with elapsedDays=7 (exactly) stays idle (strict greater-than)', () => {
      const next = reduceTour(initialTourState(), { type: 'suppress', elapsedDays: 7 });
      expect(next.kind).toBe('idle');
    });

    it('completed with elapsedDays=8 → suppressed', () => {
      const c: TourState = { kind: 'completed', validationPaused: false };
      const next = reduceTour(c, { type: 'suppress', elapsedDays: 8 });
      expect(next.kind).toBe('suppressed');
    });

    it('running ignores suppress() (only reset/dismiss/complete can exit running)', () => {
      const r: TourState = { kind: 'running', currentStep: 1, validationPaused: true };
      const next = reduceTour(r, { type: 'suppress', elapsedDays: 30 });
      expect(next.kind).toBe('running');
    });
  });

  describe('immutability invariant', () => {
    it('reducer never mutates the input state', () => {
      const original: TourState = { kind: 'running', currentStep: 0, validationPaused: true };
      const snapshot = JSON.stringify(original);
      reduceTour(original, { type: 'advance' });
      expect(JSON.stringify(original)).toBe(snapshot);
    });
  });
});