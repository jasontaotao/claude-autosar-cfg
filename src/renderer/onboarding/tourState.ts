// src/renderer/onboarding/tourState.ts
// v1.6.0 W — TourState 5-variant union + pure reducer.
//
// 设计要点 (locked W spec §3.3):
//   - 5-variant union: idle | running | completed | dismissed | suppressed
//   - Every variant carries validationPaused (consumed by G cluster debounce gate)
//   - Pure-function reducer (no React / no store imports); testable in isolation
//   - All transitions are explicit actions; no implicit state flips
//   - 业务注释中文，技术 API 注释英文

/**
 * Canonical 5-variant tour state. Every variant carries
 * `validationPaused: boolean` so the G cluster's debounce handler can
 * gate background validation in a single typecheck (per W spec §3.7 +
 * G spec §4.5).
 *
 * - `idle`:        initial state before any user interaction
 * - `running`:     active tour with currentStep 0..4
 * - `completed`:   user reached the last step + clicked Finish
 * - `dismissed`:   user clicked Skip mid-tour (7-day suppress window starts)
 * - `suppressed`:  terminal; only `reset()` can exit
 */
export type TourState =
  | { readonly kind: 'idle'; readonly validationPaused: false }
  | { readonly kind: 'running'; readonly currentStep: 0 | 1 | 2 | 3 | 4; readonly validationPaused: true }
  | { readonly kind: 'completed'; readonly validationPaused: false }
  | { readonly kind: 'dismissed'; readonly validationPaused: false }
  | { readonly kind: 'suppressed'; readonly validationPaused: false };

/**
 * Explicit transition actions. Adding a new action is a typecheck
 * that forces every reducer arm to be visited.
 */
export type TourAction =
  | { readonly type: 'start' }
  | { readonly type: 'advance' }
  | { readonly type: 'back' }
  | { readonly type: 'skip' }
  | { readonly type: 'reset' }
  | { readonly type: 'suppress'; readonly elapsedDays: number };

/**
 * Initial state factory. The slice composes this into the renderer
 * store on mount; tests call it directly.
 */
export function initialTourState(): TourState {
  return { kind: 'idle', validationPaused: false };
}

/**
 * Pure reducer. Same input → same output (no I/O, no clock reads,
 * no store reads). The 7-day suppress rule is parameterized via the
 * `elapsedDays` action payload — the caller is responsible for
 * computing `now - dismissedAt` from the persisted timestamp.
 */
export function reduceTour(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case 'start': {
      if (state.kind === 'idle') {
        return { kind: 'running', currentStep: 0, validationPaused: true };
      }
      return state;
    }
    case 'advance': {
      if (state.kind === 'running') {
        if (state.currentStep === 4) {
          return { kind: 'completed', validationPaused: false };
        }
        const nextStep = (state.currentStep + 1) as 0 | 1 | 2 | 3 | 4;
        return { kind: 'running', currentStep: nextStep, validationPaused: true };
      }
      return state;
    }
    case 'back': {
      if (state.kind === 'running' && state.currentStep > 0) {
        const prevStep = (state.currentStep - 1) as 0 | 1 | 2 | 3 | 4;
        return { kind: 'running', currentStep: prevStep, validationPaused: true };
      }
      return state;
    }
    case 'skip': {
      if (state.kind === 'running') {
        return { kind: 'dismissed', validationPaused: false };
      }
      return state;
    }
    case 'reset': {
      // Reset is the only action that exits a terminal state.
      return { kind: 'idle', validationPaused: false };
    }
    case 'suppress': {
      // Only fire the suppress transition from non-running states.
      // A running tour cannot be silently suppressed mid-flow.
      if (state.kind === 'running') {
        return state;
      }
      if (action.elapsedDays > 7) {
        return { kind: 'suppressed', validationPaused: false };
      }
      return state;
    }
  }
}