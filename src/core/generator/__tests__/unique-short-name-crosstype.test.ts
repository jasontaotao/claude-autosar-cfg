// core/generator/__tests__/unique-short-name-crosstype.test.ts
//
// v1.14.0 MINOR S10 — cross-type sibling shortName uniqueness
// (D-rev2 Senior S10). v1.12.0 E6 only checked parameter siblings.
// A user could declare a container named `Foo` and a parameter named
// `Foo` at the same level — the resulting C identifiers would collide.

import { describe, it, expect } from 'vitest';

import { DiagnosticCode, DiagnosticSeverity } from '../diagnostics.js';
import { validateUniqueShortNames } from '../emit/unique-short-name.js';

describe('validateUniqueShortNames — cross-type siblings (D-rev2 S10)', () => {
  it('errors when a parameter shortName collides with a sibling container shortName', () => {
    const diags = validateUniqueShortNames(
      new Map([
        [
          'EcuC',
          {
            parameters: [{ shortName: 'Foo' }],
            containers: [{ shortName: 'Foo' }],
          },
        ],
      ]) as never,
    );
    const collisions = diags.filter((d) => d.code === DiagnosticCode.ECUC_GEN_DUPLICATE_SHORTNAME);
    expect(collisions).toHaveLength(1);
    const first = collisions[0]!;
    expect(first.severity).toBe(DiagnosticSeverity.ERROR);
    expect(first.moduleShortName).toBe('EcuC');
    expect(first.message).toContain('Foo');
  });

  it('errors when a container shortName collides with a sibling parameter', () => {
    // Order matters: parameter declared first, then container with
    // the same shortName. The validator should detect the collision
    // regardless of declaration order.
    const diags = validateUniqueShortNames(
      new Map([
        [
          'EcuC',
          {
            parameters: [{ shortName: 'Bar' }],
            containers: [{ shortName: 'Bar' }],
          },
        ],
      ]) as never,
    );
    expect(diags.some((d) => d.code === DiagnosticCode.ECUC_GEN_DUPLICATE_SHORTNAME)).toBe(true);
  });

  it('does not error when siblings are distinct', () => {
    const diags = validateUniqueShortNames(
      new Map([
        [
          'EcuC',
          {
            parameters: [{ shortName: 'Foo' }, { shortName: 'Bar' }],
            containers: [{ shortName: 'Baz' }],
          },
        ],
      ]) as never,
    );
    expect(diags).toHaveLength(0);
  });

  it('still detects within-parameter duplicates (regression guard)', () => {
    // The original v1.12.0 E6 check — two parameters with the same
    // shortName at the same level — must still fire.
    const diags = validateUniqueShortNames(
      new Map([
        [
          'EcuC',
          {
            parameters: [{ shortName: 'Dup' }, { shortName: 'Dup' }],
          },
        ],
      ]) as never,
    );
    expect(diags.some((d) => d.code === DiagnosticCode.ECUC_GEN_DUPLICATE_SHORTNAME)).toBe(true);
  });

  it('tolerates modules with only parameters (no containers)', () => {
    const diags = validateUniqueShortNames(
      new Map([
        [
          'EcuC',
          {
            parameters: [{ shortName: 'Foo' }],
          },
        ],
      ]) as never,
    );
    expect(diags).toHaveLength(0);
  });

  it('tolerates modules with only containers (no parameters)', () => {
    const diags = validateUniqueShortNames(
      new Map([
        [
          'EcuC',
          {
            containers: [{ shortName: 'Foo' }, { shortName: 'Bar' }],
          },
        ],
      ]) as never,
    );
    expect(diags).toHaveLength(0);
  });

  // v1.39.0 MINOR T5 (H3) — duplicate (shortName, INDEX) tuples
  // produce identical C identifiers downstream. The legacy
  // container-vs-container check (above) intentionally skipped this
  // case because AUTOSAR array semantics allow multiple instances of
  // the same container shortName distinguished by INDEX. But two
  // instances with the same INDEX cannot both emit a unique C
  // identifier. The E5 (ORDERING) monotonic check is not a
  // substitute — it accepts [1,1,2] as ascending.
  it('errors when two containers share shortName + INDEX (T5 H3)', () => {
    const diags = validateUniqueShortNames(
      new Map([
        [
          'EcuC',
          {
            containers: [
              { shortName: 'PartitionConfig', index: 0 },
              { shortName: 'PartitionConfig', index: 1 },
              { shortName: 'PartitionConfig', index: 1 }, // duplicate INDEX
              { shortName: 'PartitionConfig', index: 2 },
            ],
          },
        ],
      ]) as never,
    );
    const dupIndexDiags = diags.filter(
      (d) =>
        d.code === DiagnosticCode.ECUC_GEN_DUPLICATE_SHORTNAME &&
        d.message.includes('INDEX=1'),
    );
    expect(dupIndexDiags).toHaveLength(1);
    expect(dupIndexDiags[0]!.severity).toBe(DiagnosticSeverity.ERROR);
    expect(dupIndexDiags[0]!.moduleShortName).toBe('EcuC');
    expect(dupIndexDiags[0]!.ecucPath).toBe('PartitionConfig');
  });

  // T5 H3 — distinguish from the legacy case: a single container
  // without INDEX must not be flagged.
  it('tolerates container shortName collisions when INDEX is undefined (T5 H3 negative)', () => {
    const diags = validateUniqueShortNames(
      new Map([
        [
          'EcuC',
          {
            containers: [
              { shortName: 'Foo' /* index undefined */ },
              { shortName: 'Foo' /* index undefined */ },
            ],
          },
        ],
      ]) as never,
    );
    expect(diags).toHaveLength(0);
  });

  // T5 H3 — distinct INDEX values within the same shortName group
  // remain valid (the core AUTOSAR array pattern).
  it('tolerates same shortName with distinct INDEX values (T5 H3 negative)', () => {
    const diags = validateUniqueShortNames(
      new Map([
        [
          'EcuC',
          {
            containers: [
              { shortName: 'PartitionConfig', index: 0 },
              { shortName: 'PartitionConfig', index: 1 },
              { shortName: 'PartitionConfig', index: 2 },
            ],
          },
        ],
      ]) as never,
    );
    expect(diags).toHaveLength(0);
  });
});
