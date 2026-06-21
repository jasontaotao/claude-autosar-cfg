// tests/integration/g-tour-pause-validator.test.ts
// Cluster G (v1.6.0) — Cross-spec integration test #8.
//
// A+C spec §10.6 owns this scenario. Verifies G spec §3.9 + §7.5
// acceptance: "Tour running 期间 G validator 0 调用".
//
// Renderer-process observer via Vitest + jsdom:
//   - useArxmlStore.tour transitions to 'running'
//   - in-process subscribe fires
//   - runValidation silently returns []

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RuleRegistry } from '../../../src/core/sws-validator/RuleRegistry.js';
import { installTourSubscription, runValidation } from '../../../src/core/sws-validator/engine.js';
import type { ValidatorRule } from '../../../src/core/sws-validator/types.js';
import type { SchemaLayer } from '../../../src/core/validation/runtimeSchema.js';
import { reduceTour } from '../../../src/renderer/onboarding/tourState.js';
import { useArxmlStore } from '../../../src/renderer/store/useArxmlStore.js';
import type { NormalizedDocument } from '../../../src/shared/normalized-document.js';

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
  defaultSeverity: 'error',
  messageKey: 'swsValidator.runtimeError',
  check: () => [
    { ruleId: 'NO_OP', severity: 'error', messageKey: 'swsValidator.runtimeError', path: '/p' },
  ],
};

describe('Cross-spec #8 — W tour → G debounce skip', () => {
  let unsubscribe: () => void;

  beforeEach(() => {
    useArxmlStore.setState({ tour: { kind: 'idle', validationPaused: false } });
    unsubscribe = installTourSubscription();
  });

  afterEach(() => {
    unsubscribe();
  });

  it('engine returns 0 results while tour is running (no rule.check() invocations)', async () => {
    const reg = new RuleRegistry();
    let invocationCount = 0;
    reg.register({
      id: 'COUNTER',
      defaultSeverity: 'error',
      messageKey: 'swsValidator.runtimeError',
      check: () => {
        invocationCount += 1;
        return [
          {
            ruleId: 'COUNTER',
            severity: 'error',
            messageKey: 'swsValidator.runtimeError',
            path: '/p',
          },
        ];
      },
    });

    // Baseline: idle → rule.check() is called once.
    const baseline = await runValidation(reg, { document: EMPTY_DOC, schemaLayer: EMPTY_LAYER });
    expect(invocationCount).toBe(1);
    expect(baseline.results.length).toBe(1);

    // Tour → running.
    useArxmlStore.setState({ tour: reduceTour(useArxmlStore.getState().tour, { type: 'start' }) });
    await Promise.resolve();

    // Tour running → 0 invocations, 0 results.
    const paused = await runValidation(reg, { document: EMPTY_DOC, schemaLayer: EMPTY_LAYER });
    expect(invocationCount).toBe(1); // unchanged from baseline
    expect(paused.results).toEqual([]);
    expect(paused.rulesRun).toBe(0);

    // Tour → dismissed (paused → false).
    useArxmlStore.setState({
      tour: reduceTour(useArxmlStore.getState().tour, { type: 'skip' }),
    });
    await Promise.resolve();

    // Tour dismissed → rule.check() resumes (now called 2×).
    const resumed = await runValidation(reg, { document: EMPTY_DOC, schemaLayer: EMPTY_LAYER });
    expect(invocationCount).toBe(2);
    expect(resumed.results.length).toBe(1);
  });

  it('does NOT retroactively run validation for edits during the paused window', async () => {
    // Per G spec §7.5: "the engine does NOT retroactively run
    // validation for edits made during the paused window."
    const reg = new RuleRegistry();
    reg.register(NO_OP_RULE);

    // Tour → running.
    useArxmlStore.setState({ tour: reduceTour(useArxmlStore.getState().tour, { type: 'start' }) });
    await Promise.resolve();

    // 3 "edits" happen (simulated by runValidation calls).
    const a = await runValidation(reg, { document: EMPTY_DOC, schemaLayer: EMPTY_LAYER });
    const b = await runValidation(reg, { document: EMPTY_DOC, schemaLayer: EMPTY_LAYER });
    const c = await runValidation(reg, { document: EMPTY_DOC, schemaLayer: EMPTY_LAYER });
    expect(a.results).toEqual([]);
    expect(b.results).toEqual([]);
    expect(c.results).toEqual([]);

    // Tour → dismissed.
    useArxmlStore.setState({
      tour: reduceTour(useArxmlStore.getState().tour, { type: 'skip' }),
    });
    await Promise.resolve();

    // Single post-unpause run — NOT 4 (no retroactive replay).
    const resumed = await runValidation(reg, { document: EMPTY_DOC, schemaLayer: EMPTY_LAYER });
    expect(resumed.results.length).toBe(1);
  });
});
