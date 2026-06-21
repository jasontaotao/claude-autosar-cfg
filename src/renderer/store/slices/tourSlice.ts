// src/renderer/store/slices/tourSlice.ts
// v1.6.0 W — Tour slice (minimal seed for G's in-process subscribe).
//
// Owned by W cluster (per W spec §3.3 + §3.7). The canonical reducer
// lives in `src/renderer/onboarding/tourState.ts` (pure / testable
// in isolation); this file is the **store-side adapter** that wires
// the reducer into `useArxmlStore` so cross-slice consumers (G cluster
// validator debounce per G spec §3.9) can `useArxmlStore.subscribe`.
//
// W's full tour UI wiring (TourProvider, advance/back/skip actions,
// App.tsx mount, persistence to userData/tour.json) lands in W's own
// PRs. v1.6.0 G-4 ships this minimal slice so the in-process
// `useArxmlStore.tour` field exists for the G debounce handler.
//
// If W ships a different field name or shape, the G adapter needs
// to update `src/core/sws-validator/hooks/useTourState.ts`. The shape
// is locked by W spec §3.3 (5-variant union + validationPaused).

import type { StateCreator } from 'zustand';

import type { TourAction, TourState } from '../../onboarding/tourState.js';
import { initialTourState, reduceTour } from '../../onboarding/tourState.js';
import type { ArxmlState } from '../useArxmlStore.js';

export interface TourSlice {
  readonly tour: TourState;
  /**
   * Dispatch a TourAction through the pure reducer. Wired by W's
   * `TourProvider` (start/advance/back/skip/reset/suppress). G does
   * NOT call this — G only subscribes to `tour` via `useArxmlStore`.
   */
  dispatchTour: (action: TourAction) => void;
}

export const createTourSlice: StateCreator<ArxmlState, [], [], TourSlice> = (set) => ({
  tour: initialTourState(),
  dispatchTour: (action) => {
    set((state) => ({ tour: reduceTour(state.tour, action) }));
  },
});
