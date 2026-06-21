// src/core/sws-validator/__tests__/tourPause.test.ts
// Cluster G (v1.6.0) — In-process tour-pause subscribe test.
//
// Verifies G spec §3.9 + §7.5 acceptance:
//   "Tour running 期间 G validator 0 调用"
// The in-process zustand subscription wires `useArxmlStore.tour.validationPaused`
// into the engine's `inProcessValidationPaused` mirror. When the tour
// transitions to 'running' the engine silently returns []; when it
// transitions back to 'idle' / 'completed' the engine runs normally.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { reduceTour } from '../../../renderer/onboarding/tourState.js';
import { useArxmlStore } from '../../../renderer/store/useArxmlStore.js';
import type { NormalizedDocument } from '../../../shared/normalized-document.js';
import type { SchemaLayer } from '../../validation/runtimeSchema.js';
import { RuleRegistry } from '../RuleRegistry.js';
import { installTourSubscription, runValidation } from '../engine.js';
import type { ValidatorRule } from '../types.js';

const EMPTY_DOC: NormalizedDocument = {
  version: '4.2',
  packages: [],
  modules: [],
  references: [],
  sourceOrder: [],
  origin: 'dom',
};
const EMPTY_LAYER: SchemaLayer = {
  params: new Map(),
  containers: new Map(),
  sourcePaths: new Set(),
  moduleRoots: [],
};

const NO_OP_RULE: ValidatorRule = {
  id: 'NO_OP',
  defaultSeverity: 'info',
  messageKey: 'swsValidator.runtimeError',
  check: () => [
    { ruleId: 'NO_OP', severity: 'info', messageKey: 'swsValidator.runtimeError', path: '' },
  ],
};

describe('G engine + W tour coordination', () => {
  let unsubscribe: () => void;

  beforeEach(() => {
    // Reset the tour slice to idle before each test.
    useArxmlStore.setState({ tour: { kind: 'idle', validationPaused: false } });
    unsubscribe = installTourSubscription();
  });

  afterEach(() => {
    unsubscribe();
  });

  it('runs validation when tour is idle', async () => {
    const reg = new RuleRegistry();
    reg.register(NO_OP_RULE);
    const r = await runValidation(reg, { document: EMPTY_DOC, schemaLayer: EMPTY_LAYER });
    expect(r.results.length).toBe(1);
    expect(r.rulesRun).toBe(1);
  });

  it('silently returns [] when tour flips to running (in-process subscribe)', async () => {
    // First, run validation while idle to confirm baseline.
    const reg = new RuleRegistry();
    reg.register(NO_OP_RULE);
    const baseline = await runValidation(reg, { document: EMPTY_DOC, schemaLayer: EMPTY_LAYER });
    expect(baseline.results.length).toBe(1);

    // Transition tour to 'running' via the W reducer.
    const next = reduceTour(useArxmlStore.getState().tour, { type: 'start' });
    useArxmlStore.setState({ tour: next });

    // Allow zustand subscribe to fire (synchronous in test env).
    await Promise.resolve();

    const paused = await runValidation(reg, { document: EMPTY_DOC, schemaLayer: EMPTY_LAYER });
    expect(paused.results).toEqual([]);
    expect(paused.rulesRun).toBe(0);
    expect(paused.rulesSkipped).toBe(1);
  });

  it('resumes validation when tour completes (in-process subscribe fires unpause)', async () => {
    const reg = new RuleRegistry();
    reg.register(NO_OP_RULE);

    // Tour → running → completed.
    // After start() currentStep = 0. 5 advances take 0→1→2→3→4→completed.
    let state = useArxmlStore.getState().tour;
    state = reduceTour(state, { type: 'start' });
    useArxmlStore.setState({ tour: state });
    await Promise.resolve();
    for (let i = 0; i < 5; i += 1) {
      state = reduceTour(state, { type: 'advance' });
      useArxmlStore.setState({ tour: state });
      await Promise.resolve();
    }

    // After advancing through all 5 steps, the reducer returns 'completed'.
    expect(state.kind).toBe('completed');

    // Validation should resume.
    const r = await runValidation(reg, { document: EMPTY_DOC, schemaLayer: EMPTY_LAYER });
    expect(r.results.length).toBe(1);
  });
});
