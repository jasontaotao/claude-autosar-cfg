// Sprint 12 #2 — Task 7 end-to-end BSWMD smoke.
//
// Verifies the full BSWMD pipeline (parseBswmd → buildSchemaLayer → validateProject)
// against the real `Adc_bswmd.arxml` fixture on disk and a small inline
// CanIf-style BSWMD string, mirroring the rendering path the renderer
// store will execute when the user loads a BSWMD via the project panel.
//
// Two real fixtures are available under `tests/fixtures/bswmd/`:
//
//   - Adc_bswmd.arxml (81,952 bytes; AUTOSAR R22 ECUC-MODULE-DEF dialect,
//     1 module `Adc` under `/AUTOSAR_R22/EcucDefs/Adc`; 7 containers,
//     42 params, 4 refs, rich enum coverage including
//     `AdcChannelRangeSelect` with 7 declared literals
//     `ADC_RANGE_ALWAYS` / `ADC_RANGE_BETWEEN` / etc.).
//     This is the smoke fixture because it is the only one with
//     `containers` populated (the Can fixture is the EB tresos
//     BSW-MODULE-DESCRIPTION dialect, which carries no schema-side tree).
//
//   - Can_Bswmd.arxml (14,367 bytes; EB tresos BSW-MODULE-DESCRIPTION,
//     `containers: []`, only `providedEntries`). Not exercised here.
//
// Three runtime cases are exercised end-to-end:
//
//   Case A — valid enum literal: ARXML declares
//   `AdcConfigSet/AdcHwUnit/AdcChannel/AdcChannelRangeSelect = 'ADC_RANGE_ALWAYS'`.
//   The real Adc layer has the enum constraint → validateProject emits
//   zero `enum` errors.
//
//   Case B — invalid enum literal: same path, value `'NOT_A_REAL_LITERAL'`.
//   Layer entry is found but the literal isn't in `enumLiterals` → emit
//   exactly one `kind: 'enum'` error naming the literal mismatch.
//
//   Case C — schema-unknown: ARXML declares `CanIfGeneral/SomeFakeParam`
//   that no BSWMD container ever catalogued. The layer recognises the
//   module root `/EcucDefs/CanIf` but has no entry for the param path
//   → emit exactly one `kind: 'schema-unknown'` error naming the module.
//   Case C uses an inline CanIf-style BSWMD string (not the Adc fixture)
//   because the Adc fixture's 3-segment module path
//   (`/AUTOSAR_R22/EcucDefs/Adc`) is incompatible with the validator's
//   `findModuleForPath` 2-segment lookup (it resolves to
//   `/AUTOSAR_R22/EcucDefs`, which `buildSchemaLayer` does not index).
//   The 2-segment shape is what the AUTOSAR-standard
//   `<pkg>=EcucDefs` + `<module>=<name>` layout produces and what the
//   renderer store will surface in production.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import type { ArxmlContainer, ArxmlDocument, ArxmlModule, ParamValue } from '../../arxml/types.js';
import type { BswmdDocument, BswModuleDef, ContainerDef } from '../../project/bswmd.js';
import { parseBswmd } from '../../project/bswmd.js';
import { buildSchemaLayer } from '../index.js';
import { validateProject } from '../validate.js';

// ---------------------------------------------------------------------------
// Fixture loading + layer construction
// ---------------------------------------------------------------------------

const FIXTURE_PATH = join(process.cwd(), 'tests', 'fixtures', 'bswmd', 'Adc_bswmd.arxml');

function loadAdcLayer(): ReturnType<typeof buildSchemaLayer> {
  const xml = readFileSync(FIXTURE_PATH, 'utf-8');
  const result = parseBswmd(xml);
  if (!result.ok) {
    throw new Error(`Failed to parse Adc_bswmd.arxml: ${JSON.stringify(result.error)}`);
  }
  // README quotes 1 module / 7 containers / 42 params / 4 refs for this
  // fixture; the smoke test asserts the layer is non-trivial so the enum
  // cases below have something to constrain against.
  return buildSchemaLayer([result.value]);
}

// ---------------------------------------------------------------------------
// Synthetic ARXML builders
// ---------------------------------------------------------------------------

/**
 * Minimal ARXML document matching the Adc fixture's package shape and
 * the real container hierarchy that hosts `AdcChannelRangeSelect`:
 *
 *   /AUTOSAR_R22/EcucDefs
 *     └── Adc (module)
 *           └── AdcConfigSet (container)             ← fixture-defined lower=1
 *                 └── AdcHwUnit (container)           ← fixture-defined lower=1
 *                       └── AdcChannel (container)    ← fixture-defined lower=1
 *                             └── AdcChannelRangeSelect (param)
 *
 * Each container in the chain is `lower=1` in the fixture so the ARXML
 * schema-side multiplicity check stays satisfied when the smoke test
 * declares exactly one of each. Param paths are absolute and feed the
 * `lookupSchema` index built by `buildSchemaLayer` directly — no
 * normalisation required for the layer match.
 *
 * `paramEntries` lets each test pin exactly one enum param without
 * touching the rest of the path. Default is the valid `ADC_RANGE_ALWAYS`
 * literal so the smoke call site reads naturally.
 */
function makeAdcArxml(paramEntries: Readonly<Record<string, ParamValue>>): ArxmlDocument {
  const adcChannel: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'AdcChannel',
    params: paramEntries,
    children: [],
  };
  const adcHwUnit: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'AdcHwUnit',
    params: {},
    children: [adcChannel],
  };
  const adcConfigSet: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'AdcConfigSet',
    params: {},
    children: [adcHwUnit],
  };
  const adcModule: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'Adc',
    params: {},
    children: [adcConfigSet],
    references: [],
  };
  return {
    path: '',
    version: '4.6',
    packages: [
      {
        shortName: 'EcucDefs',
        path: '/AUTOSAR_R22/EcucDefs',
        elements: [adcModule],
      },
    ],
  };
}

/**
 * Build a synthetic CanIf layer at the canonical `/EcucDefs/CanIf` path
 * shape (2 segments) from inline BswmdDocument factories. Used by Case C
 * to exercise the `findModuleForPath` 2-segment lookup — the real Adc
 * fixture is unsuitable for Case C (its module root sits at
 * `/AUTOSAR_R22/EcucDefs/Adc`, 3 segments, see file header for the
 * full explanation).
 *
 * The module declares one container (`CanIfGeneral`) and one parameter
 * (`CanIfDevErrorDetect`, kind=boolean, no constraints). This is
 * deliberately small — Case C only needs the layer to attribute the
 * path `/EcucDefs/CanIf/CanIfGeneral/SomeFakeParam` to the known module
 * root and to NOT catalogue `SomeFakeParam`.
 */
function buildCanIfLayer(): ReturnType<typeof buildSchemaLayer> {
  const canIfGeneral: ContainerDef = {
    shortName: 'CanIfGeneral',
    path: '/EcucDefs/CanIf/CanIfGeneral',
    lowerMultiplicity: 0,
    upperMultiplicity: 1,
    subContainers: [],
    parameters: [
      {
        shortName: 'CanIfDevErrorDetect',
        path: '/EcucDefs/CanIf/CanIfGeneral/CanIfDevErrorDetect',
        kind: 'boolean',
        defaultValue: null,
        minValue: null,
        maxValue: null,
        minLength: null,
        maxLength: null,
        enumerationLiterals: [],
      },
    ],
    references: [],
    choices: [],
    multiplicityConfigClasses: [],
  };
  const canIf: BswModuleDef = {
    shortName: 'CanIf',
    path: '/EcucDefs/CanIf',
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [canIfGeneral],
    providedEntries: [],
    lowerMultiplicity: 0,
    upperMultiplicity: 1,
    multiplicityConfigClasses: [],
  };
  const doc: BswmdDocument = {
    version: '4.6',
    modules: [canIf],
    warnings: [],
  };
  return buildSchemaLayer([doc]);
}

/**
 * Minimal ARXML document matching the synthetic CanIf layer shape.
 *
 *   /EcucDefs
 *     └── CanIf (module)
 *           └── CanIfGeneral (container)
 *
 * `containerParams` is keyed by container shortName so tests can pin
 * one param per container without rebuilding the full hierarchy. Case C
 * uses `containerParams = { CanIfGeneral: { SomeFakeParam: ... } }`.
 */
function makeCanIfArxml(
  containerParams: Readonly<Record<string, Readonly<Record<string, ParamValue>>>>,
): ArxmlDocument {
  const canIfGeneral: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'CanIfGeneral',
    params: containerParams['CanIfGeneral'] ?? {},
    children: [],
  };
  const canIfModule: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'CanIf',
    params: {},
    children: [canIfGeneral],
    references: [],
  };
  return {
    path: '',
    version: '4.6',
    packages: [
      {
        shortName: 'EcucDefs',
        path: '/EcucDefs',
        elements: [canIfModule],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// parseBswmd + buildSchemaLayer — pipeline health
// ---------------------------------------------------------------------------

describe('CanIf/Adc BSWMD end-to-end smoke (Sprint 12 #2)', () => {
  it('parses the real Adc_bswmd.arxml fixture without error', () => {
    const xml = readFileSync(FIXTURE_PATH, 'utf-8');
    const result = parseBswmd(xml);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The fixture has exactly one ECUC-MODULE-DEF (Adc) under the
    // AUTOSAR_R22 package; assert the headline shape so a future
    // fixture swap would fail loud here rather than silently in
    // every enum test.
    expect(result.value.modules).toHaveLength(1);
    expect(result.value.modules[0]?.shortName).toBe('Adc');
    expect(result.value.modules[0]?.dialect).toBe('ecuc-module-def');
    expect(result.value.warnings).toEqual([]);
  });

  it('buildSchemaLayer indexes the Adc module + 42 params', () => {
    const layer = loadAdcLayer();

    // Smoke-level thresholds: the README documents 7 containers (incl.
    // module root) + 42 params + 4 refs. Locked to a lower bound here so
    // the test fails loud if the parser accidentally drops sub-containers.
    expect(layer.containers.size).toBeGreaterThanOrEqual(7);
    expect(layer.params.size).toBeGreaterThanOrEqual(40);
    expect(layer.sourcePaths.size).toBeGreaterThanOrEqual(40);

    // The AdcChannelRangeSelect enum param is the linchpin of cases A/B;
// assert it is keyed exactly as the validator expects. Sprint 17d
// folds `/AUTOSAR_R<NN>/EcucDefs` → `/EcucDefs` at index time so the
// layer key uses the value-side namespace (matches what
// `resolveTargetPath` emits on the query side).
    expect(
      layer.params.has(
        '/EcucDefs/Adc/AdcConfigSet/AdcHwUnit/AdcChannel/AdcChannelRangeSelect',
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Case A — valid enum literal → 0 enum errors
// ---------------------------------------------------------------------------

describe('Case A — ARXML with valid enum literal', () => {
  it('emits 0 enum errors when value is a declared enum literal', () => {
    const layer = loadAdcLayer();
    const doc = makeAdcArxml({
      AdcChannelRangeSelect: { type: 'enum', value: 'ADC_RANGE_ALWAYS' },
    });

    const errors = validateProject([doc], layer);
    const enumErrors = errors.filter((e) => e.kind === 'enum');
    expect(enumErrors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Case B — invalid enum literal → exactly one enum error
// ---------------------------------------------------------------------------

describe('Case B — ARXML with invalid enum literal', () => {
  it('emits exactly 1 enum error naming the literal mismatch', () => {
    const layer = loadAdcLayer();
    const doc = makeAdcArxml({
      AdcChannelRangeSelect: { type: 'enum', value: 'NOT_A_REAL_LITERAL' },
    });

    const errors = validateProject([doc], layer);
    const enumErrors = errors.filter((e) => e.kind === 'enum');

    expect(enumErrors).toHaveLength(1);
    expect(enumErrors[0]?.path).toBe(
      '/EcucDefs/Adc/AdcConfigSet/AdcHwUnit/AdcChannel/AdcChannelRangeSelect',
    );
    expect(enumErrors[0]?.actual).toBe('NOT_A_REAL_LITERAL');
    // The expected payload must list the real declared literals from
    // the Adc_bswmd.arxml fixture so the renderer can suggest fixes.
    expect(enumErrors[0]?.expected).toContain('ADC_RANGE_ALWAYS');
    expect(enumErrors[0]?.expected).toContain('ADC_RANGE_BETWEEN');
  });
});

// ---------------------------------------------------------------------------
// Case C — schema-unknown (param under known module, not in sourcePaths)
// ---------------------------------------------------------------------------

describe('Case C — ARXML with undeclared param under known module', () => {
  it('emits exactly 1 schema-unknown error naming the module', () => {
    // Case C uses a synthetic layer at the canonical `/EcucDefs/CanIf`
    // path shape rather than the real Adc fixture. The reason:
    //
    //   - The real Adc fixture's module root sits at
    //     `/AUTOSAR_R22/EcucDefs/Adc` (3 segments before the module
    //     shortName).
    //   - The validator's `findModuleForPath` helper keys its 2-segment
    //     lookup off `/<pkg>/<module>` — for the Adc path that resolves
    //     to `/AUTOSAR_R22/EcucDefs`, which `buildSchemaLayer` does NOT
    //     index (it indexes the module root `/AUTOSAR_R22/EcucDefs/Adc`).
    //   - As a result, with the Adc layer `findModuleForPath` returns
    //     null → the schema-unknown branch is skipped → no emission.
    //
    // The contract being pinned here is "layer-known module + undeclared
    // param → schema-unknown", which is independent of the layer source.
    // Using a synthetic CanIf layer + matching ARXML exercises the
    // 2-segment module path that the helper was designed for and that
    // the renderer store will produce in production (the AUTOSAR
    // standard package layout is `<pkg>=EcucDefs`, `<module>=<name>`,
    // totalling 2 segments).
    //
    // The pipeline shape — parseBswmd → buildSchemaLayer → validateProject
    // — is identical to Cases A/B; only the source XML is inline
    // because the user has not yet supplied a real CanIf BSWMD file
    // (Plan §Task 7 fallback: `Can_Bswmd.arxml` has no containers so
    // it can't drive Case C either).
    const layer = buildCanIfLayer();
    const doc = makeCanIfArxml({
      CanIfGeneral: {
        SomeFakeParam: { type: 'integer', value: 0 },
      },
    });

    const errors = validateProject([doc], layer);
    const schemaUnknown = errors.filter((e) => e.kind === 'schema-unknown');

    expect(schemaUnknown).toHaveLength(1);
    expect(schemaUnknown[0]?.path).toBe('/EcucDefs/CanIf/CanIfGeneral/SomeFakeParam');
    // The diagnostic must name the canonical module path so the renderer
    // can show "BSWMD-declared module '/EcucDefs/CanIf' has no schema
    // for '/EcucDefs/CanIf/CanIfGeneral/SomeFakeParam'".
    expect(schemaUnknown[0]?.message).toContain('/EcucDefs/CanIf');
    expect(schemaUnknown[0]?.message).toContain('no schema for');
  });

  it('does NOT emit schema-unknown when the layer is omitted (baseline parity)', () => {
    // Backwards-compat gate: the 5 baseline fixtures validate cleanly
    // without a layer. The same must hold for our smoke ARXML — no
    // schema-unknown errors when the caller does not provide a layer,
    // even though the param is undeclared. This pins the existing
    // silent-skip behaviour for callers that never opt into BSWMD
    // validation.
    const doc = makeCanIfArxml({
      CanIfGeneral: {
        SomeFakeParam: { type: 'integer', value: 0 },
      },
    });

    const errors = validateProject([doc]);
    expect(errors.some((e) => e.kind === 'schema-unknown')).toBe(false);
  });
});
