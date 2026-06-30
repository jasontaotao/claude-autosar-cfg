// v1.18.0 MINOR T1 (Obs-3) — ApplyResult.warnings contract tests.
//
// Locks down the warnings shape introduced for the C8 variant
// downgrade warning channel. Per `docs/superpowers/specs/2026-06-30-
// v1-18-0-minor-design.md` §3, `applyPatchSteps` accumulates
// non-fatal diagnostics in `ApplyResult.warnings` parallel to
// the existing `errors` array. The CLI dispatcher already maps
// non-empty warnings to EXIT_WARNING (src/cli/command-dispatcher.ts
// :92-97), so T1 only needs to wire the producer side.
//
// These tests are contract-only — they verify the type surface
// and the empty-default invariant. Behavioral tests for warning
// EMISSION (e.g. variant downgrade emitting a warning) land in T8
// when the C8 step op is added. Adding a synthetic warning-emitting
// step op here would require extending PatchStep's exhaustive
// switch, which is out of scope for the foundation work.

import { describe, expect, it } from 'vitest';

import type { PatchStep } from '../../../shared/headless/ipc-contract.js';
import type { ArxmlDocument } from '../../arxml/types.js';
import type { ApplyResult, StepWarning } from '../applyPatchSteps.js';
import { applyPatchSteps } from '../applyPatchSteps.js';

// Minimal valid ARXML doc: `parseArxml` produces a real one but
// for applyPatchSteps contract tests we don't need parsed content
// — we just need a valid `ArxmlDocument` shape. The patch engine
// only walks the doc when a step targets it; with `steps: []` the
// doc is returned untouched.
const emptyDoc: ArxmlDocument = {
  rootPath: '/fake/path.arxml',
  packages: [],
  arPackages: [],
  references: [],
  moduleRefs: [],
} as unknown as ArxmlDocument;

describe('v1.18.0 Obs-3 — ApplyResult.warnings contract', () => {
  it('exposes a `warnings: ReadonlyArray<StepWarning>` field on ApplyResult', () => {
    const r: ApplyResult = applyPatchSteps(emptyDoc, []);
    expect(Array.isArray(r.warnings)).toBe(true);
    expect(r.warnings).toHaveLength(0);
  });

  it('returns warnings: [] for empty steps', () => {
    const r = applyPatchSteps(emptyDoc, []);
    expect(r.warnings).toEqual([]);
  });

  it('returns warnings: [] for steps that do not emit warnings', () => {
    // A no-op `set-param` on a non-existent container returns an
    // error but does NOT emit a warning — warnings are non-fatal
    // diagnostics, distinct from errors.
    const step = {
      op: 'set-param' as const,
      containerPath: '/NoSuchContainer',
      paramName: 'NoSuchParam',
      value: 0,
    };
    const r = applyPatchSteps(emptyDoc, [step]);
    expect(r.errors.length).toBeGreaterThan(0); // sanity: error surfaced
    expect(r.warnings).toEqual([]); // warnings untouched
  });

  it('StepWarning has the expected shape (kind discriminator + message + stepIndex)', () => {
    // Type-level + structural test: build a StepWarning and verify
    // its fields. C8 (T8) is the first consumer of `kind`; this test
    // locks down the field set so future consumers don't accidentally
    // add/remove fields.
    const w: StepWarning = {
      stepIndex: 0,
      kind: 'variant-downgrade',
      message: 'POST-BUILD → PRE-COMPILE',
      step: { op: 'replace', path: '/x', value: 1 },
    };
    expect(w.stepIndex).toBe(0);
    expect(w.kind).toBe('variant-downgrade');
    expect(typeof w.message).toBe('string');
    expect(w.step).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// v1.18.0 T8 (C8) — end-to-end dispatcher tests for the new
// `variant-downgrade` step op. These exercise the full pipeline:
//   applyPatchSteps → applyOneStep switch case → applyVariantDowngrade
//   → variantDowngradeStep → StepWarning → ApplyResult.warnings.
// T8's engineering.test.ts + variant-downgrade.test.ts cover the
// unit-level helpers; the tests below lock the dispatcher wiring.
// ---------------------------------------------------------------------------

function vDownStep(
  fromMultiplicity: 'POST-BUILD' | 'PRE-COMPILE' | 'LINK-TIME',
  toMultiplicity: 'POST-BUILD' | 'PRE-COMPILE' | 'LINK-TIME',
): PatchStep {
  return {
    op: 'variant-downgrade',
    containerPath: '/EcuC/Com/ComConfig',
    paramName: 'ComTimeBase',
    fromMultiplicity,
    toMultiplicity,
  };
}

describe('v1.18.0 C8 — applyPatchSteps variant-downgrade dispatcher', () => {
  it('POST-BUILD → PRE-COMPILE populates ApplyResult.warnings', () => {
    const r = applyPatchSteps(emptyDoc, [vDownStep('POST-BUILD', 'PRE-COMPILE')]);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]?.kind).toBe('variant-downgrade');
    expect(r.warnings[0]?.stepIndex).toBe(0);
    expect(r.warnings[0]?.step?.op).toBe('variant-downgrade');
    expect(r.warnings[0]?.message).toContain('POST-BUILD');
    expect(r.warnings[0]?.message).toContain('PRE-COMPILE');
  });

  it('PRE-COMPILE → PRE-COMPILE does NOT populate warnings', () => {
    const r = applyPatchSteps(emptyDoc, [vDownStep('PRE-COMPILE', 'PRE-COMPILE')]);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('upgrade PRE-COMPILE → POST-BUILD does NOT populate warnings', () => {
    const r = applyPatchSteps(emptyDoc, [vDownStep('PRE-COMPILE', 'POST-BUILD')]);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('variant-downgrade step does NOT increment `applied` (no doc mutation)', () => {
    // The step is diagnostic-only: it surfaces a warning but does
    // NOT mutate the doc, so the `applied` counter must NOT tick.
    const r = applyPatchSteps(emptyDoc, [vDownStep('POST-BUILD', 'LINK-TIME')]);
    expect(r.applied).toBe(0);
    expect(r.warnings).toHaveLength(1);
  });
});
