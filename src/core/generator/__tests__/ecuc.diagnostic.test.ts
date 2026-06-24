// core/generator/__tests__/ecuc.diagnostic.test.ts
//
// Acceptance-gate coverage for every DiagnosticCode defined in Task 1.
//
// For each of the 12 codes, this file either asserts the code fires
// against a synthetic pipeline run (real `it(...)` test) or marks it
// `test.todo(...)` with a 5-line comment explaining why the validation
// logic is deferred. Per the v1.11.0 brief:
//
//   - 4 codes are emitted by the current pipeline:
//       001 NO_SCHEMA, 002 NO_GENERATOR, 003 THROW, 010 REF_UNRESOLVED
//   - 8 codes are NOT yet emitted; the validation/emit logic that
//     would surface them is scoped to v2:
//       011 MULTIPLICITY, 012 TYPE_MISMATCH, 013 RANGE,
//       020 ORDERING, 021 DUPLICATE_SHORTNAME,
//       030 TEMPLATE_RENDER, 031 OUTPUT_WRITE, INFO-001 EMPTY_VARIANT
//
// The 4 real tests use module-level fixtures only (no ARXML on disk):
// the pipeline's pre-process + generate stages accept `Map<string, ...>`
// inputs, so the tests stay close to the wire shape and avoid coupling
// to a future XML parser.

import { describe, it, test, expect, beforeEach } from 'vitest';

import { DiagnosticSeverity, DiagnosticCode, type DiagnosticCodeValue } from '../diagnostics.js';
import { runPipeline } from '../pipeline.js';
import {
  registerGenerator,
  _resetRegistryForTest,
  type ModuleGenerator,
  type GeneratedArtifact,
} from '../registry.js';

class StubGen implements ModuleGenerator {
  readonly moduleShortName = 'Stub';
  emit(): readonly GeneratedArtifact[] {
    return [{ path: 'Stub/Stub_Cfg.c', content: '/* stub */' }];
  }
}

beforeEach(() => {
  _resetRegistryForTest();
  registerGenerator(new StubGen());
});

/**
 * Helper — runs the pipeline with the given inputs and returns the
 * diagnostics array (asserting presence of the requested code).
 *
 * Kept local to this file because every test rolls its own scenario;
 * pulling a shared builder into `test-fixtures/` would obscure the
 * pre-process/emit boundary that each test is pinning.
 */
async function runAndFind(args: Parameters<typeof runPipeline>[0], code: DiagnosticCodeValue) {
  const result = await runPipeline(args);
  const diag = result.diagnostics.find((d) => d.code === code);
  if (!diag) {
    throw new Error(
      `Expected diagnostic ${code} not emitted. Got: ${
        result.diagnostics.map((d) => `${d.severity}:${d.code}`).join(', ') || '(none)'
      }`,
    );
  }
  return { result, diag };
}

describe('Diagnostic fixture triggers — real pipeline emissions', () => {
  it('ECUC-GEN-002 (NO_GENERATOR, WARN) fires when generator not registered', async () => {
    // Stub is in bswmdIndex (so NO_SCHEMA won't fire) but no generator
    // is registered for it (beforeEach registers StubGen; here we
    // reset and re-register a different module to keep 'Stub' bare).
    _resetRegistryForTest();
    // Register an unrelated generator so the registry is non-empty;
    // 'Stub' itself has no generator.
    registerGenerator({
      moduleShortName: 'Other',
      emit: (): readonly GeneratedArtifact[] => [],
    });
    const { diag } = await runAndFind(
      {
        bswmdIndex: new Map([['Stub', { shortName: 'Stub' }]]),
        ecucValues: new Map([['Stub', {}]]),
        variant: 'PreCompile',
        outDir: '/tmp',
        moduleFilter: undefined,
        strict: false,
      },
      DiagnosticCode.ECUC_GEN_NO_GENERATOR,
    );
    expect(diag.severity).toBe(DiagnosticSeverity.WARNING);
    expect(diag.moduleShortName).toBe('Stub');
  });

  it('ECUC-GEN-003 (THROW, ERROR) fires when generator throws', async () => {
    // Replace the default StubGen with a throwing one. The pipeline's
    // generate-stage try/catch wraps emit() and pushes ECUC_GEN_THROW
    // with severity=ERROR and the throw's stack/message.
    _resetRegistryForTest();
    class ThrowGen implements ModuleGenerator {
      readonly moduleShortName = 'Stub';
      emit(): readonly GeneratedArtifact[] {
        throw new Error('boom');
      }
    }
    registerGenerator(new ThrowGen());
    const { diag, result } = await runAndFind(
      {
        bswmdIndex: new Map([['Stub', { shortName: 'Stub' }]]),
        ecucValues: new Map([['Stub', {}]]),
        variant: 'PreCompile',
        outDir: '/tmp',
        moduleFilter: undefined,
        strict: false,
      },
      DiagnosticCode.ECUC_GEN_THROW,
    );
    expect(diag.severity).toBe(DiagnosticSeverity.ERROR);
    expect(diag.moduleShortName).toBe('Stub');
    expect(diag.message).toContain('boom');
    expect(result.exitCode).toBe(1); // any ERROR → exit 1
  });

  it('ECUC-GEN-010 (REF_UNRESOLVED, ERROR) fires for unresolved cross-module ref', async () => {
    // Pipeline pre-process calls validateReferences, which iterates
    // tree.references. Source module 'Stub' references target module
    // 'MissingMod' — not present in ecucValues, so targetMod is
    // undefined → NO_SCHEMA-style ERROR push.
    const { diag } = await runAndFind(
      {
        bswmdIndex: new Map([['Stub', { shortName: 'Stub' }]]),
        ecucValues: new Map([
          [
            'Stub',
            {
              references: [
                {
                  path: 'Stub/StubGeneral/MissingRef',
                  targetModule: 'MissingMod',
                  targetPath: 'MissingMod/Whatever',
                },
              ],
            },
          ],
        ]),
        variant: 'PreCompile',
        outDir: '/tmp',
        moduleFilter: undefined,
        strict: false,
      },
      DiagnosticCode.ECUC_GEN_REF_UNRESOLVED,
    );
    expect(diag.severity).toBe(DiagnosticSeverity.ERROR);
    expect(diag.moduleShortName).toBe('Stub');
    expect(diag.ecucPath).toBe('Stub/StubGeneral/MissingRef');
  });
});

// ---------------------------------------------------------------------------
// Deferred coverage (8 codes) — validation/emit logic for these codes is
// scoped to v2. The pipeline does not yet push them, so we record the
// intent with `test.todo(...)` plus a short context comment per code.
// Future sprints flip these to real `it(...)` tests once the producer
// code lands.
// ---------------------------------------------------------------------------

describe('Diagnostic fixture triggers — v1.12.0 PATCH E1 (deferred → implemented)', () => {
  // E1 (M1 of v1.12.0 MINOR E) — pipeline widened to iterate the union
  // of bswmdIndex + ecucValues keys, so a values-only module (present
  // in ecucValues but missing BSWMD) now surfaces as NO_SCHEMA WARN.
  it('ECUC-GEN-001 (NO_SCHEMA, WARN) fires when BSWMD missing for a values-only module', async () => {
    // bswmdIndex is empty (or omits 'ValuesOnlyMod'); ecucValues carries
    // it. The pipeline should iterate the union → emit WARN.
    _resetRegistryForTest();
    // Register a catch-all generator so the pipeline doesn't ALSO push
    // NO_GENERATOR (which would mask the NO_SCHEMA we're testing).
    registerGenerator({
      moduleShortName: 'Other',
      emit: (): readonly GeneratedArtifact[] => [],
    });
    const { diag, result } = await runAndFind(
      {
        bswmdIndex: new Map([['Other', { shortName: 'Other' }]]),
        ecucValues: new Map([
          ['Other', {}],
          ['ValuesOnlyMod', {}],
        ]),
        variant: 'PreCompile',
        outDir: '/tmp',
        moduleFilter: undefined,
        strict: false,
      },
      DiagnosticCode.ECUC_GEN_NO_SCHEMA,
    );
    expect(diag.severity).toBe(DiagnosticSeverity.WARNING);
    expect(diag.moduleShortName).toBe('ValuesOnlyMod');
    // WARN → exit 0 (per pipeline §Stage 3: any WARNING → 0 unless --strict)
    expect(result.exitCode).toBe(0);
  });

  // E2 — ECUC-GEN-011 (MULTIPLICITY, ERROR). BSWMD declares
  // container 'PartitionConfig' with lowerMultiplicity=1, upperMultiplicity=3.
  // ECUC values carry 0 instances → below lower → ERROR.
  it('ECUC-GEN-011 (MULTIPLICITY, ERROR) fires when instance count below lower bound', async () => {
    _resetRegistryForTest();
    registerGenerator({
      moduleShortName: 'Stub',
      emit: (): readonly GeneratedArtifact[] => [],
    });
    const { diag, result } = await runAndFind(
      {
        bswmdIndex: new Map([
          [
            'Stub',
            {
              shortName: 'Stub',
              containers: [
                { shortName: 'PartitionConfig', lowerMultiplicity: 1, upperMultiplicity: 3 },
              ],
            },
          ],
        ]),
        ecucValues: new Map([['Stub', { containers: [] }]]),
        variant: 'PreCompile',
        outDir: '/tmp',
        moduleFilter: undefined,
        strict: false,
      },
      DiagnosticCode.ECUC_GEN_MULTIPLICITY,
    );
    expect(diag.severity).toBe(DiagnosticSeverity.ERROR);
    expect(diag.moduleShortName).toBe('Stub');
    expect(diag.ecucPath).toBe('PartitionConfig');
    // ERROR → exit 1
    expect(result.exitCode).toBe(1);
  });

  // E3 — ECUC-GEN-012 (TYPE_MISMATCH, ERROR). BSWMD declares param
  // 'Enable' with kind='boolean'. ECUC values carry a string 'true'
  // → runtime kind='string', expected='boolean' → ERROR.
  it('ECUC-GEN-012 (TYPE_MISMATCH, ERROR) fires when value runtime kind does not match BSWMD kind', async () => {
    _resetRegistryForTest();
    registerGenerator({
      moduleShortName: 'Stub',
      emit: (): readonly GeneratedArtifact[] => [],
    });
    const { diag, result } = await runAndFind(
      {
        bswmdIndex: new Map([
          [
            'Stub',
            {
              shortName: 'Stub',
              params: [{ shortName: 'Enable', kind: 'boolean' }],
            },
          ],
        ]),
        ecucValues: new Map([
          ['Stub', { parameters: [{ shortName: 'Enable', value: 'true' }] }],
        ]),
        variant: 'PreCompile',
        outDir: '/tmp',
        moduleFilter: undefined,
        strict: false,
      },
      DiagnosticCode.ECUC_GEN_TYPE_MISMATCH,
    );
    expect(diag.severity).toBe(DiagnosticSeverity.ERROR);
    expect(diag.moduleShortName).toBe('Stub');
    expect(diag.ecucPath).toBe('Enable');
    expect(result.exitCode).toBe(1);
  });

  // E4 — ECUC-GEN-013 (RANGE, ERROR). BSWMD declares integer param
  // 'Priority' with min=0, max=10. ECUC carries value 99 → ERROR.
  it('ECUC-GEN-013 (RANGE, ERROR) fires when integer value exceeds max', async () => {
    _resetRegistryForTest();
    registerGenerator({
      moduleShortName: 'Stub',
      emit: (): readonly GeneratedArtifact[] => [],
    });
    const { diag, result } = await runAndFind(
      {
        bswmdIndex: new Map([
          [
            'Stub',
            {
              shortName: 'Stub',
              params: [{ shortName: 'Priority', kind: 'integer', min: 0, max: 10 }],
            },
          ],
        ]),
        ecucValues: new Map([
          ['Stub', { parameters: [{ shortName: 'Priority', value: 99 }] }],
        ]),
        variant: 'PreCompile',
        outDir: '/tmp',
        moduleFilter: undefined,
        strict: false,
      },
      DiagnosticCode.ECUC_GEN_RANGE,
    );
    expect(diag.severity).toBe(DiagnosticSeverity.ERROR);
    expect(diag.moduleShortName).toBe('Stub');
    expect(diag.ecucPath).toBe('Priority');
    expect(diag.message).toContain('99');
    expect(diag.message).toContain('10');
    expect(result.exitCode).toBe(1);
  });
});

describe('Diagnostic fixture triggers — deferred to v2', () => {
  // 020 ORDERING: container INDEX attribute not strictly ascending.
  // Container emit sorts by INDEX today (force-correct order); the
  // reverse check that flags reordering violations is not yet wired.
  test.todo('ECUC-GEN-020 (ORDERING, WARN) fires on out-of-order INDEX values');

  // 012 TYPE_MISMATCH: integer value where Boolean expected, etc.
  // The EcuC generator uses cTypeForKind to derive C types but does
  // not currently compare against the value's runtime kind.
  test.todo('ECUC-GEN-012 (TYPE_MISMATCH, ERROR) fires on value vs def type mismatch');

  // 013 RANGE: integer out of [min, max] bound.
  // EcuC emit writes the value verbatim into C source; no min/max
  // clamp or compare runs in v1.11.0.
  test.todo('ECUC-GEN-013 (RANGE, ERROR) fires on value outside [min, max]');

  // 020 ORDERING: container INDEX attribute not strictly ascending.
  // Container emit sorts by INDEX today (force-correct order); the
  // reverse check that flags reordering violations is not yet wired.
  test.todo('ECUC-GEN-020 (ORDERING, WARN) fires on out-of-order INDEX values');

  // 021 DUPLICATE_SHORTNAME: two sibling containers/params with same
  // shortName. normalizeToTree passes through whatever the input
  // carries — it does not dedupe or assert uniqueness.
  test.todo('ECUC-GEN-021 (DUPLICATE_SHORTNAME, ERROR) fires on sibling shortName collision');

  // 030 TEMPLATE_RENDER: Handlebars throws during render. The current
  // pipeline runs generators (which may use Handlebars internally) but
  // no top-level try/catch maps HandlebarsRuntimeError → this code;
  // THROW is the only emit-stage exception path today.
  test.todo('ECUC-GEN-030 (TEMPLATE_RENDER, ERROR) fires when Handlebars render throws');

  // 031 OUTPUT_WRITE: file write fails (EACCES, ENOSPC, etc.). Atomic
  // write lives in post-process (Task 13) and runs after the pipeline
  // returns; the pipeline does not surface write errors yet.
  test.todo('ECUC-GEN-031 (OUTPUT_WRITE, ERROR) fires when output file write fails');

  // INFO-001 EMPTY_VARIANT: active variant has no container/param
  // entries. The pipeline does not branch on emptiness today; v2 will
  // introduce per-variant element walk that pushes this INFO notice.
  test.todo('ECUC-GEN-INFO-001 (INFO_EMPTY_VARIANT, INFO) fires when variant has no elements');
});
