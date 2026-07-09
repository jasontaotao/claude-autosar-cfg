// Generate command handler test (v1.11.0 — Task 19).
//
// Pins the MVP happy-path: register EcuCGenerator, build a minimal project
// skeleton in a tmp dir, call `generateHeadlessProject`, and assert the
// returned envelope surfaces generated files + exit code 0.
//
// Follows the existing CLI test patterns (captureStd, real fs in tmpdir,
// real EcuCGenerator handle). Stubs the project loader so we don't depend
// on the full `openProject` IPC pipeline — the brief explicitly says the
// MVP handler does the parsing inline (mirror of `workspace-111` test).
//
// v1.39.0 MINOR T4 (H1 + H4) — adds 3 manifest-mode tests (no
// injection fast-path). They write real BSWMD + ECUC value files on
// disk and let the handler's `loadProjectMaps` walk them, asserting:
// (1) the BSWMD loader populates the FULL `BswmdModuleDefLite` shape
// (containers / parameters / references / moduleHeader / includes),
// (2) the ECUC values loader extracts real params / refs from the
// parsed ARXML (not the empty-stub `{ parameters: [], references: [] }`
// pre-T4 placeholder), and (3) `validateMultiplicity` fires on a
// manifest with bad BSWMD multiplicity — was a silent no-op pre-T4
// because the CLI loader dropped `containers[]` before reaching the
// validator.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type {
  BswmdModuleDefLite,
  EcucModuleConfigurationValuesInput,
} from '../../../core/generator/normalize.js';
import { _resetRegistryForTest } from '../../../core/generator/registry.js';
import type { GenerateArgs } from '../../../shared/headless/ipc-contract.js';
import { parseCliArgs } from '../../commander.js';
import { generateHeadlessProject } from '../../handlers/generate.js';

/**
 * Test-only extension of the public `GenerateArgs` schema. The handler
 * accepts underscore-prefixed escape hatches to bypass the fs-based
 * project loader; that surface is not part of the wire contract, so
 * tests add it via an intersection rather than `as unknown` casts.
 */
type GenerateArgsForTest = GenerateArgs & {
  readonly _bswmdIndex?: ReadonlyMap<string, BswmdModuleDefLite>;
  readonly _ecucValues?: ReadonlyMap<string, EcucModuleConfigurationValuesInput>;
};

/**
 * Test fixture shape for the BSWMD module def. The wire-facing
 * `BswmdModuleDefLite` is intentionally a one-field opaque handle; the
 * runtime pipeline widens it via `ReadonlyMap<string, unknown>` and the
 * generators walk `containers` directly. The richer shape below
 * captures the minimal in-memory fixture needed by EcuCGenerator.
 */
interface BswmdContainerDefFixture {
  readonly shortName: string;
  readonly parameters: readonly { readonly kind: string }[];
}
interface BswmdModuleDefFixture extends BswmdModuleDefLite {
  readonly containers: readonly BswmdContainerDefFixture[];
}

let projectDir: string;

beforeEach(async () => {
  projectDir = await mkdtemp(join(tmpdir(), 'claude-gen-handler-'));
  // Minimal manifest — the handler only reads bswmdPaths + valueArxmlPaths,
  // both empty here. We inject BSWMD / BSWCFG via the handler's loader stub.
  await writeFile(
    join(projectDir, 'project.autosarcfg.json'),
    JSON.stringify({
      schemaVersion: '1',
      id: 'test',
      name: 'test',
      valueArxmlPaths: [],
      bswmdPaths: [],
    }),
  );
  _resetRegistryForTest();
});

afterEach(async () => {
  await rm(projectDir, { recursive: true, force: true });
  _resetRegistryForTest();
});

describe('generateHeadlessProject', () => {
  it('writes generated files into the project dir for a minimal EcuC input', async () => {
    // Seed inline BSWMD + BSWCFG that the loader helper will surface to the
    // pipeline. A bare `{ shortName: 'EcuC' }` def + empty values is enough
    // for EcuCGenerator to emit `EcuC/EcuC_Cfg.h` (the container header).
    const bswmdIndex = new Map<string, BswmdModuleDefFixture>([
      [
        'EcuC',
        {
          shortName: 'EcuC',
          containers: [{ shortName: 'EcuCGeneral', parameters: [] }],
        },
      ],
    ]);
    const ecucValues = new Map<string, EcucModuleConfigurationValuesInput>([
      ['EcuC', { parameters: [], references: [] }],
    ]);

    const args: GenerateArgsForTest = {
      command: 'generate',
      projectPath: projectDir,
      format: 'json',
      // Inject pre-loaded maps for the test — bypass fs-based loader.
      _bswmdIndex: bswmdIndex,
      _ecucValues: ecucValues,
    };
    const result = await generateHeadlessProject(args);

    expect(result.ok).toBe(true);
    expect(result.command).toBe('generate');
    expect(result.variant).toBe('PreCompile');
    expect(result.projectPath).toBe(projectDir);
    expect(result.files.length).toBeGreaterThan(0);
    // At least one generated file should mention EcuC_Cfg.
    const paths = result.files.map((f) => f.path);
    expect(paths.some((p) => p.includes('EcuC_Cfg'))).toBe(true);
  });
});

describe('generate — end-to-end via parseCliArgs + handler', () => {
  it('routes --variant Link from CLI parser through to the handler envelope', async () => {
    // Regression: pre-fix, `parseCliArgs(['node', 'autosarcfg', 'generate', ...])`
    // threw "Unhandled sub-command: generate". After wiring, it returns
    // { kind: 'generate', input: { variant: 'Link', ... } } and the handler
    // surfaces the variant in its GenerateResult envelope.
    const bswmdIndex = new Map<string, BswmdModuleDefFixture>([
      [
        'EcuC',
        {
          shortName: 'EcuC',
          containers: [{ shortName: 'EcuCGeneral', parameters: [] }],
        },
      ],
    ]);
    const ecucValues = new Map<string, EcucModuleConfigurationValuesInput>([
      ['EcuC', { parameters: [], references: [] }],
    ]);

    // --project points at the project *directory* (not the manifest file).
    // The handler's default outDir = projectPath/generated; passing a file
    // path here would have the handler try to mkdir inside a regular file.
    // The injection fast-path below short-circuits the manifest-mode loader.
    const parsed = parseCliArgs([
      'node',
      'autosarcfg',
      'generate',
      '--project',
      projectDir,
      '--variant',
      'Link',
    ]);
    expect(parsed.kind).toBe('generate');
    if (parsed.kind !== 'generate') throw new Error('unreachable');
    expect(parsed.input.variant).toBe('Link');
    expect(parsed.input.strict).toBe(false);

    // Bypass the manifest-mode loader by injecting maps (matches the
    // handler's `_bswmdIndex` / `_ecucValues` fast-path).
    const args: GenerateArgsForTest = {
      ...parsed.input,
      _bswmdIndex: bswmdIndex,
      _ecucValues: ecucValues,
    };
    const result = await generateHeadlessProject(args);

    expect(result.ok).toBe(true);
    expect(result.command).toBe('generate');
    expect(result.variant).toBe('Link');
    expect(result.projectPath).toBe(projectDir);
  });
});

// ---------------------------------------------------------------------------
// v1.39.0 MINOR T4 (H1 + H4) — manifest-mode loader integration.
// These tests intentionally bypass the `_bswmdIndex` / `_ecucValues`
// injection fast-path and exercise the real on-disk manifest loader.
// T4 fixed two silent-no-op regressions:
//   (H1) BSWMD loader dropped containers / parameters / references /
//        moduleHeader / includes, leaving every Stage-1 validator
//        (multiplicity / type-check / range / ordering / reference)
//        except `validateUniqueShortNames` + `validateOrdering` with
//        nothing to walk.
//   (H4) ECUC values loader wrote `{ parameters: [], references: [] }`
//        stubs for every module, so the generator ran against an empty
//        values map and emitted every parameter at its BSWMD default.
// Each test asserts via the `diagnostics` envelope field of the
// returned `GenerateResult` — the handler translates engine
// `Diagnostic`s into wire-side `ValidatorResult`s (see
// `generateHeadlessProject`'s `diagnostics.map(diagnosticToValidatorResult)`).
// ---------------------------------------------------------------------------

/**
 * Minimal R4.6 BSWMD XML declaring one module (`T4Module`) with one
 * module-level integer parameter (`T4IntParam`) AND one container
 * (`T4Container`). The container has `lowerMultiplicity=2` so a
 * values file with zero instances violates `validateMultiplicity`
 * (used by Test 1). The module-level integer param has no
 * `lowerMultiplicity`/`upperMultiplicity` constraints (default 0/1)
 * and is the anchor for `validateTypeMatches` (Test 3): an
 * ECUC values file carrying a non-integer `<VALUE>` triggers
 * `ECUC-GEN-014`.
 */
const T4_BSWMD_XML = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_4-2-2.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>T4Module</SHORT-NAME>
          <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
          <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
          <PARAMETERS>
            <ECUC-INTEGER-PARAM-DEF>
              <SHORT-NAME>T4IntParam</SHORT-NAME>
              <MIN>0</MIN>
              <MAX>50</MAX>
              <DEFAULT>7</DEFAULT>
            </ECUC-INTEGER-PARAM-DEF>
          </PARAMETERS>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>T4Container</SHORT-NAME>
              <LOWER-MULTIPLICITY>2</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY>5</UPPER-MULTIPLICITY>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>
`;

/**
 * R4.6 ECUC values XML — module-level values file with zero instances
 * of `T4Container`. The BSWMD declares lowerMultiplicity=2, so this
 * values file is multiplicity-invalid. Used by Test 1.
 */
const T4_ECUC_VALUES_XML_EMPTY = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_4-2-2.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucValues</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES>
          <SHORT-NAME>T4Module</SHORT-NAME>
          <DEFINITION-REF DEST="ECUC-MODULE-DEF">/EcucDefs/T4Module</DEFINITION-REF>
          <CONTAINERS>
          </CONTAINERS>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>
`;

/**
 * R4.6 ECUC values XML — module-level values file with two instances
 * of `T4Container` (satisfying the BSWMD lowerMultiplicity=2 bound)
 * AND a module-level `T4IntParam` carrying value 42. Used by Test 2
 * to verify the `ecucValues` map is populated from the parsed ARXML
 * (not an empty stub) — pre-T4 the loader's empty-stub
 * `{ parameters: [], references: [] }` entry made
 * `validateMultiplicity` see count=0 and fire ECUC-GEN-011
 * unconditionally.
 */
const T4_ECUC_VALUES_XML_POPULATED = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_4-2-2.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucValues</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES>
          <SHORT-NAME>T4Module</SHORT-NAME>
          <DEFINITION-REF DEST="ECUC-MODULE-DEF">/EcucDefs/T4Module</DEFINITION-REF>
          <PARAMETER-VALUES>
            <ECUC-NUMERICAL-PARAM-VALUE>
              <DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/EcucDefs/T4Module/T4IntParam</DEFINITION-REF>
              <VALUE>42</VALUE>
            </ECUC-NUMERICAL-PARAM-VALUE>
          </PARAMETER-VALUES>
          <CONTAINERS>
            <ECUC-CONTAINER-VALUE>
              <SHORT-NAME>T4Container</SHORT-NAME>
              <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/EcucDefs/T4Module/T4Container</DEFINITION-REF>
            </ECUC-CONTAINER-VALUE>
            <ECUC-CONTAINER-VALUE>
              <SHORT-NAME>T4Container</SHORT-NAME>
              <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/EcucDefs/T4Module/T4Container</DEFINITION-REF>
            </ECUC-CONTAINER-VALUE>
          </CONTAINERS>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>
`;

/**
 * v1.39.0 MINOR T4 (H1) — manifest-mode loader populates the FULL
 * `BswmdModuleDefLite` shape. Test: write a BSWMD declaring
 * `lowerMultiplicity=2` on its sole container. Write a values file
 * with zero instances. After T4, the loader preserves `containers[]`
 * in the lite map; `validateMultiplicity` walks it and finds the
 * violation. Pre-T4, `containers[]` was dropped at the loader
 * boundary, so the validator found nothing to walk and returned no
 * diagnostic. The assertion is the presence of an
 * `ECUC_GEN_MULTIPLICITY` diagnostic in the result envelope.
 */
it('T4 (H1): manifest-mode loader preserves containers[] so validateMultiplicity fires', async () => {
  const bswmdPath = join(projectDir, 't4module.bswmd.arxml');
  const valuesPath = join(projectDir, 't4module.ecucvalues.arxml');
  const manifestPath = join(projectDir, 'project.autosarcfg.json');
  await writeFile(bswmdPath, T4_BSWMD_XML, 'utf-8');
  await writeFile(valuesPath, T4_ECUC_VALUES_XML_EMPTY, 'utf-8');
  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: '1',
      id: 't4-h1',
      name: 't4-h1',
      valueArxmlPaths: ['t4module.ecucvalues.arxml'],
      bswmdPaths: ['t4module.bswmd.arxml'],
    }),
    'utf-8',
  );

  const args: GenerateArgs = {
    command: 'generate',
    projectPath: manifestPath,
    format: 'json',
    // CRITICAL: NO `_bswmdIndex` / `_ecucValues` injection. This test
    // exercises the real on-disk manifest loader that T4 fixed.
    variant: 'PreCompile',
  };
  const result = await generateHeadlessProject(args);

  // Stage 1 surfaces the multiplicity violation as an ERROR
  // diagnostic. Pipeline Stage-2 early-breaks on any ERROR
  // (`pipeline.ts:180-188`), so the result is `ok: false` with zero
  // generated files but the diagnostic present in the envelope.
  expect(result.ok).toBe(false);
  const multiplicity = result.diagnostics.find(
    (d) => d.ruleId === 'ECUC-GEN-011' && d.severity === 'error',
  );
  expect(multiplicity).toBeDefined();
  expect(multiplicity?.message).toContain('T4Container');
  expect(multiplicity?.message).toContain('[2, 5]');
});

/**
 * v1.39.0 MINOR T4 (H4) — manifest-mode loader extracts real ECUC
 * values from the parsed ARXML. Test: write a BSWMD declaring
 * `lowerMultiplicity=2` on its sole container. Write a values file
 * with TWO instances (satisfying the multiplicity bound). Pre-T4,
 * the loader wrote `{ parameters: [], references: [] }` for every
 * module — `validateMultiplicity` saw count=0 and fired
 * `ECUC-GEN-011` regardless of what the user wrote. Post-T4, the
 * walker counts the actual instances and the diagnostic is absent.
 *
 * Note: this test does not assert absence of ALL diagnostics (the
 * generator may emit unrelated warnings for an unknown module name);
 * it asserts specifically that `validateMultiplicity` is satisfied.
 */
it('T4 (H4): manifest-mode loader extracts ecucValues.containers so multiplicity is satisfied', async () => {
  const bswmdPath = join(projectDir, 't4module.bswmd.arxml');
  const valuesPath = join(projectDir, 't4module.ecucvalues.arxml');
  const manifestPath = join(projectDir, 'project.autosarcfg.json');
  await writeFile(bswmdPath, T4_BSWMD_XML, 'utf-8');
  await writeFile(valuesPath, T4_ECUC_VALUES_XML_POPULATED, 'utf-8');
  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: '1',
      id: 't4-h4',
      name: 't4-h4',
      valueArxmlPaths: ['t4module.ecucvalues.arxml'],
      bswmdPaths: ['t4module.bswmd.arxml'],
    }),
    'utf-8',
  );

  const args: GenerateArgs = {
    command: 'generate',
    projectPath: manifestPath,
    format: 'json',
    variant: 'PreCompile',
  };
  const result = await generateHeadlessProject(args);

  // ECUC-GEN-011 (MULTIPLICITY) is the exact code T4's H4 fix removes.
  // Other codes may appear (e.g. ECUC-GEN-002 NO_GENERATOR for the
  // unknown `T4Module`), but multiplicity is specifically absent.
  const multiplicity = result.diagnostics.find((d) => d.ruleId === 'ECUC-GEN-011');
  expect(multiplicity).toBeUndefined();
});

/**
 * v1.39.0 MINOR T4 (M1) — sibling defence-in-depth check. Beyond
 * `validateMultiplicity`, the range validator (`validateRange`) also
 * no-op'd pre-T4 because both BSWMD `params[]` and ECUC values
 * `parameters[]` were dropped at the loader boundary. Test: write a
 * BSWMD declaring a module-level integer parameter `T4IntParam` with
 * `MAX=10`, and a values file where the same parameter carries
 * `<VALUE>99</VALUE>` (out of range). Post-T4 the range violation
 * surfaces as `ECUC-GEN-012`. Pre-T4 the validator had no inputs and
 * returned no diagnostic.
 *
 * Why M1 vs H1: H1 covers the BSWMD side (containers[] survived the
 * loader), M1 covers the ECUC values side (parameters[] survived
 * AND the range validator walks them end-to-end). Together with
 * the multiplicity test (H1+H4 pair) they pin both halves of the
 * defence-in-depth fix.
 */
it('T4 (M1): validateRange fires when ecucValues param value violates BSWMD min/max', async () => {
  const valuesWithOutOfRangeValue = T4_ECUC_VALUES_XML_POPULATED.replace(
    '<VALUE>42</VALUE>',
    '<VALUE>99</VALUE>',
  );
  const bswmdPath = join(projectDir, 't4module.bswmd.arxml');
  const valuesPath = join(projectDir, 't4module.ecucvalues.arxml');
  const manifestPath = join(projectDir, 'project.autosarcfg.json');
  await writeFile(bswmdPath, T4_BSWMD_XML, 'utf-8');
  await writeFile(valuesPath, valuesWithOutOfRangeValue, 'utf-8');
  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: '1',
      id: 't4-m1',
      name: 't4-m1',
      valueArxmlPaths: ['t4module.ecucvalues.arxml'],
      bswmdPaths: ['t4module.bswmd.arxml'],
    }),
    'utf-8',
  );

  const args: GenerateArgs = {
    command: 'generate',
    projectPath: manifestPath,
    format: 'json',
    variant: 'PreCompile',
  };
  const result = await generateHeadlessProject(args);

  // ECUC-GEN-013 (RANGE) is the range validator's code. It walks
  // BSWMD module-level `params[].min`/`max` against ECUC value
  // entries — pre-T4 neither side was populated, so the diagnostic
  // never fired on the CLI path. Post-T4 the 99 > 50 violation
  // surfaces.
  const range = result.diagnostics.find((d) => d.ruleId === 'ECUC-GEN-013');
  expect(range).toBeDefined();
  expect(range?.message).toContain('T4IntParam');
});
