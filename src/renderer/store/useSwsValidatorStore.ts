// src/renderer/store/useSwsValidatorStore.ts
// Cluster G (v1.6.0) — Renderer-side state for the SWS validator panel.
//
// Holds:
//   - `results`: latest validation run output (InternalValidatorResult[])
//   - `running`: true while a run is in-flight
//   - `enabled`: feature flag (mirror of experimental.swsValidator)
//   - `panelOpen`: bottom-docked panel visibility (U-3 toggles via Mod+Shift+V)
//   - `severityFilter`: which severities to display (U-3 cycles via F8)
//
// Exposes actions for U-3 keyboard shortcuts (per task spec §"4 G-coupled
// U shortcuts"): `nextError`, `prevError`, `togglePanel`, `focusPanel`.

import { create } from 'zustand';

import type {
  InternalValidatorResult,
  RunInput,
} from '../../core/sws-validator/types.js';
import {
  installTourSubscription,
  runValidation,
} from '../../core/sws-validator/engine.js';
import { RuleRegistry } from '../../core/sws-validator/RuleRegistry.js';
import { rule as c1 } from '../../core/sws-validator/starter/SWS_COM_PDUID_UNIQUE.js';
import { rule as c3 } from '../../core/sws-validator/starter/SWS_PDUR_ROUTING_COMPLETE.js';
import { rule as c4 } from '../../core/sws-validator/starter/SWS_ECUC_MULTIPLICITY_MIN.js';
import { rule as c5 } from '../../core/sws-validator/starter/SWS_BSWMD_DEPS_PRESENT.js';
import { isSwsValidatorEnabled } from '../../core/sws-validator/feature-flag.js';

export type SeverityFilter = 'all' | 'error' | 'warning';

export interface SwsValidatorState {
  readonly results: readonly InternalValidatorResult[];
  readonly running: boolean;
  readonly enabled: boolean;
  readonly panelOpen: boolean;
  readonly severityFilter: SeverityFilter;
  readonly lastRunAt: number | null;
  readonly focusedErrorIndex: number;
  /** Run a validation pass. No-op when `enabled` is false. */
  run: (input: RunInput) => Promise<void>;
  clear: () => void;
  togglePanel: () => void;
  setSeverityFilter: (filter: SeverityFilter) => void;
  nextError: () => void;
  prevError: () => void;
  /** Initialise the in-process tour subscription. Called once at app boot. */
  install: () => () => void;
}

/**
 * Built-in rule registry with the 4 starter rules. Constructed lazily
 * so importing this module doesn't pay the cost when the feature is
 * disabled.
 */
function buildBuiltinRegistry(): RuleRegistry {
  const r = new RuleRegistry();
  r.register(c1);
  r.register(c3);
  r.register(c4);
  r.register(c5);
  return r;
}

let _builtinRegistry: RuleRegistry | null = null;
function getBuiltinRegistry(): RuleRegistry {
  if (_builtinRegistry === null) _builtinRegistry = buildBuiltinRegistry();
  return _builtinRegistry;
}

export const useSwsValidatorStore = create<SwsValidatorState>()((set, get) => ({
  results: [],
  running: false,
  enabled: isSwsValidatorEnabled(),
  panelOpen: false,
  severityFilter: 'all',
  lastRunAt: null,
  focusedErrorIndex: 0,

  run: async (input) => {
    if (!get().enabled) return;
    set({ running: true });
    try {
      const out = await runValidation(getBuiltinRegistry(), input);
      set({
        results: out.results,
        running: false,
        lastRunAt: Date.now(),
        focusedErrorIndex: 0,
      });
    } catch {
      set({ running: false });
    }
  },

  clear: () => {
    set({ results: [], focusedErrorIndex: 0, lastRunAt: null });
  },

  togglePanel: () => {
    set((s) => ({ panelOpen: !s.panelOpen }));
  },

  setSeverityFilter: (filter) => {
    set({ severityFilter: filter });
  },

  nextError: () => {
    const { focusedErrorIndex, results } = get();
    if (results.length === 0) return;
    set({ focusedErrorIndex: (focusedErrorIndex + 1) % results.length });
  },

  prevError: () => {
    const { focusedErrorIndex, results } = get();
    if (results.length === 0) return;
    set({
      focusedErrorIndex:
        (focusedErrorIndex - 1 + results.length) % results.length,
    });
  },

  install: () => installTourSubscription(),
}));