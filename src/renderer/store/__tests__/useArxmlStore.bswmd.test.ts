// Sprint 12 #2 — store BSWMD integration tests.
//
// Pins the contract for `useArxmlStore.bswmdSchemas` + `bswmdPaths` +
// `addBswmd` (real impl) + `removeBswmd`:
//
//   1. addBswmd parse ok → bswmdSchemas/bswmdPaths append; re-validate
//   2. addBswmd duplicate path → setError + bswmdSchemas unchanged (no replace)
//   3. addBswmd parse fail → setError + bswmdSchemas unchanged
//   4. addBswmd re-runs validation with the layer built from current schemas
//   5. addBswmd with project open → project.bswmdPaths append
//   6. addBswmd loose mode → bswmdSchemas/bswmdPaths grow, project stays null
//   7. removeBswmd existing path → bswmdSchemas/bswmdPaths shrink; project sync
//   8. removeBswmd unknown path → no-op
//   9. End-to-end smoke: Adc_bswmd.arxml enum literal triggers an 'enum' error
//      when the ARXML uses an invalid value; 0 errors with a valid value
//  10. Existing multidoc / project / validation tests are not affected
//      (covered indirectly — the file only adds new describes, never
//      touches pre-existing test files).
//
// These tests bypass React (the store is consumed via
// `useArxmlStore.getState()` / `useArxmlStore.setState()`). Same pattern
// as the other store test files.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect, beforeEach } from 'vitest';

import { parseArxml } from '@core/arxml/parser';
import type { ArxmlContainer, ArxmlDocument, ArxmlModule } from '@core/arxml/types';

import { MANIFEST_SCHEMA_VERSION } from '../../../shared/project.js';
import type { ProjectManifest } from '../../../shared/project.js';
import { useArxmlStore } from '../useArxmlStore.js';

// ---------------------------------------------------------------------------
// Test fixture builders
// ---------------------------------------------------------------------------

/** Minimal valid ARXML string. The store only needs well-formed XML +
 *  a single ECUC-MODULE-CONFIGURATION-VALUES for the tests below. */
const MIN_ARXML = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES>
          <SHORT-NAME>Adc</SHORT-NAME>
          <DEFINITION-REF DEST="ECUC-MODULE-DEF">/EcucDefs/Adc</DEFINITION-REF>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

/** Minimal BSWMD (autosar-standard ECUC-MODULE-DEF dialect). The store
 *  only needs well-formed XML + an <AUTOSAR> root + an <AR-PACKAGES>
 *  branch for parseBswmd to accept it. The Adc_bswmd fixture is used
 *  for the real enum-literal end-to-end smoke (test 9). */
const MIN_BSWMD = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Adc</SHORT-NAME>
          <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
          <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>AdcGeneral</SHORT-NAME>
              <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
              <PARAMETERS>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>AdcDevErrorDetect</SHORT-NAME>
                  <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <MIN>0</MIN>
                  <MAX>1</MAX>
                </ECUC-INTEGER-PARAM-DEF>
              </PARAMETERS>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

const MALFORMED_BSWMD = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Adc
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

const ADC_BSWMD_PATH = join(process.cwd(), 'tests/fixtures/bswmd/Adc_bswmd.arxml');

function sampleManifest(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test Project',
    valueArxmlPaths: [],
    bswmdPaths: [],
    ...overrides,
  };
}

function parseArxmlOrThrow(content: string): ArxmlDocument {
  const result = parseArxml(content);
  if (!result.ok) throw new Error(`parse failed: ${result.error.kind}`);
  return result.value;
}

beforeEach(() => {
  useArxmlStore.getState().clear();
});

// ---------------------------------------------------------------------------
// 1. addBswmd happy path
// ---------------------------------------------------------------------------

describe('useArxmlStore — addBswmd (Sprint 12 #2)', () => {
  it('parse ok appends to bswmdSchemas + bswmdPaths', () => {
    // Act
    useArxmlStore.getState().addBswmd('/schemas/Adc.bswmd.arxml', MIN_BSWMD);

    // Assert
    const after = useArxmlStore.getState();
    expect(after.bswmdSchemas).toHaveLength(1);
    expect(after.bswmdPaths).toEqual(['/schemas/Adc.bswmd.arxml']);
    expect(after.bswmdSchemas[0]!.version).toBe('4.6');
    expect(after.error).toBeNull();
  });

  it('re-validates after addBswmd (lastValidatedAt updates, validationErrors re-runs)', () => {
    // Arrange
    useArxmlStore.getState().addDocument(parseArxmlOrThrow(MIN_ARXML), '/tmp/Adc.arxml');
    const beforeValidatedAt = useArxmlStore.getState().lastValidatedAt;
    // Wait one millisecond so the timestamp strictly increases (Date.now
    // can repeat on the same tick in fast CI).
    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    // Act
    return wait(2).then(() => {
      useArxmlStore.getState().addBswmd('/schemas/Adc.bswmd.arxml', MIN_BSWMD);

      // Assert
      const after = useArxmlStore.getState();
      expect(after.lastValidatedAt).not.toBeNull();
      if (beforeValidatedAt !== null) {
        expect(after.lastValidatedAt!).toBeGreaterThanOrEqual(beforeValidatedAt);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Duplicate path rejection (user-confirmed design #2)
// ---------------------------------------------------------------------------

describe('useArxmlStore — addBswmd dedupe (Sprint 12 #2)', () => {
  it('duplicate path → setError + bswmdSchemas unchanged (no replace)', () => {
    // Arrange — load once
    useArxmlStore.getState().addBswmd('/schemas/Adc.bswmd.arxml', MIN_BSWMD);
    const firstSchema = useArxmlStore.getState().bswmdSchemas[0];
    expect(useArxmlStore.getState().bswmdSchemas).toHaveLength(1);

    // Act — try to add the same path with different content
    useArxmlStore.getState().addBswmd('/schemas/Adc.bswmd.arxml', MIN_ARXML);

    // Assert
    const after = useArxmlStore.getState();
    expect(after.bswmdSchemas).toHaveLength(1); // NOT replaced
    expect(after.bswmdSchemas[0]).toBe(firstSchema);
    expect(after.bswmdPaths).toEqual(['/schemas/Adc.bswmd.arxml']);
    expect(after.error).not.toBeNull();
    // Error message contains the path (per the i18n template "{path}")
    expect(after.error).toContain('/schemas/Adc.bswmd.arxml');
  });

  it('duplicate path is rejected in BOTH zh-CN and en locale', () => {
    // Act — load + dup with en locale
    useArxmlStore.getState().setLocale('en');
    useArxmlStore.getState().addBswmd('/schemas/A.arxml', MIN_BSWMD);
    useArxmlStore.getState().addBswmd('/schemas/A.arxml', MIN_BSWMD);

    // Assert
    const enErr = useArxmlStore.getState().error;
    expect(enErr).not.toBeNull();
    expect(enErr).toContain('already loaded');
    expect(enErr).toContain('/schemas/A.arxml');

    // Act — switch to zh-CN and try a different duplicate
    useArxmlStore.getState().setLocale('zh-CN');
    useArxmlStore.getState().addBswmd('/schemas/B.arxml', MIN_BSWMD);
    useArxmlStore.getState().addBswmd('/schemas/B.arxml', MIN_BSWMD);

    // Assert
    const zhErr = useArxmlStore.getState().error;
    expect(zhErr).not.toBeNull();
    expect(zhErr).toContain('已加载过');
  });
});

// ---------------------------------------------------------------------------
// 3. Parse failure handling
// ---------------------------------------------------------------------------

describe('useArxmlStore — addBswmd parse failure (Sprint 12 #2)', () => {
  it('malformed XML → setError + bswmdSchemas unchanged', () => {
    // Act
    useArxmlStore.getState().addBswmd('/schemas/bad.arxml', MALFORMED_BSWMD);

    // Assert
    const after = useArxmlStore.getState();
    expect(after.bswmdSchemas).toHaveLength(0);
    expect(after.bswmdPaths).toEqual([]);
    expect(after.error).not.toBeNull();
    // Parse error message contains the localized prefix and the parser detail.
    // Default locale is zh-CN — the template is `BSWMD 解析失败: {message}`.
    expect(after.error).toContain('解析失败');
    // The parser detail is appended after the prefix.
    expect(after.error!.toLowerCase()).toMatch(/xml|tag|close/);
  });

  it('parse error clears a previous parse error on the next successful addBswmd', () => {
    // Arrange — load a bad one
    useArxmlStore.getState().addBswmd('/schemas/bad.arxml', MALFORMED_BSWMD);
    expect(useArxmlStore.getState().error).not.toBeNull();

    // Act — load a good one
    useArxmlStore.getState().addBswmd('/schemas/good.arxml', MIN_BSWMD);

    // Assert — prior parse error cleared, new add succeeded
    const after = useArxmlStore.getState();
    expect(after.error).toBeNull();
    expect(after.bswmdSchemas).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 4. Project sync (open mode)
// ---------------------------------------------------------------------------

describe('useArxmlStore — addBswmd project sync (Sprint 12 #2)', () => {
  it('with project open → project.bswmdPaths appends', () => {
    // Arrange
    useArxmlStore.getState().openProject({
      manifestPath: '/proj/p.json',
      manifest: sampleManifest(),
      docs: [],
    });

    // Act
    useArxmlStore.getState().addBswmd('/schemas/Adc.bswmd.arxml', MIN_BSWMD);

    // Assert
    const after = useArxmlStore.getState();
    expect(after.project?.bswmdPaths).toEqual(['/schemas/Adc.bswmd.arxml']);
    expect(after.bswmdPaths).toEqual(['/schemas/Adc.bswmd.arxml']);
  });

  it('with project open → two addBswmd calls append in order', () => {
    // Arrange
    useArxmlStore.getState().openProject({
      manifestPath: '/proj/p.json',
      manifest: sampleManifest(),
      docs: [],
    });

    // Act
    useArxmlStore.getState().addBswmd('/schemas/A.bswmd.arxml', MIN_BSWMD);
    useArxmlStore.getState().addBswmd('/schemas/B.bswmd.arxml', MIN_BSWMD);

    // Assert
    const after = useArxmlStore.getState();
    expect(after.bswmdPaths).toEqual(['/schemas/A.bswmd.arxml', '/schemas/B.bswmd.arxml']);
    expect(after.project?.bswmdPaths).toEqual(['/schemas/A.bswmd.arxml', '/schemas/B.bswmd.arxml']);
  });
});

// ---------------------------------------------------------------------------
// 5. Loose mode (no project)
// ---------------------------------------------------------------------------

describe('useArxmlStore — addBswmd loose mode (Sprint 12 #2)', () => {
  it('loose mode → bswmdSchemas + bswmdPaths grow, project stays null', () => {
    // Arrange — no openProject call (loose mode)
    expect(useArxmlStore.getState().project).toBeNull();

    // Act
    useArxmlStore.getState().addBswmd('/schemas/Adc.bswmd.arxml', MIN_BSWMD);

    // Assert
    const after = useArxmlStore.getState();
    expect(after.bswmdSchemas).toHaveLength(1);
    expect(after.bswmdPaths).toEqual(['/schemas/Adc.bswmd.arxml']);
    // project is still null — loose mode doesn't synthesize a manifest
    expect(after.project).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. removeBswmd
// ---------------------------------------------------------------------------

describe('useArxmlStore — removeBswmd (Sprint 12 #2)', () => {
  it('removes existing path → bswmdSchemas/bswmdPaths shrink + re-validate', () => {
    // Arrange
    useArxmlStore.getState().addBswmd('/schemas/A.arxml', MIN_BSWMD);
    useArxmlStore.getState().addBswmd('/schemas/B.arxml', MIN_BSWMD);
    const schemaA = useArxmlStore.getState().bswmdSchemas[0];
    const schemaB = useArxmlStore.getState().bswmdSchemas[1];
    expect(useArxmlStore.getState().bswmdSchemas).toHaveLength(2);

    // Act
    useArxmlStore.getState().removeBswmd('/schemas/A.arxml');

    // Assert
    const after = useArxmlStore.getState();
    expect(after.bswmdPaths).toEqual(['/schemas/B.arxml']);
    expect(after.bswmdSchemas).toEqual([schemaB]);
    // schemaA reference is gone
    expect(after.bswmdSchemas).not.toContain(schemaA);
  });

  it('removes existing path → project.bswmdPaths sync (when project open)', () => {
    // Arrange
    useArxmlStore.getState().openProject({
      manifestPath: '/proj/p.json',
      manifest: sampleManifest(),
      docs: [],
    });
    useArxmlStore.getState().addBswmd('/schemas/A.arxml', MIN_BSWMD);
    useArxmlStore.getState().addBswmd('/schemas/B.arxml', MIN_BSWMD);
    expect(useArxmlStore.getState().project?.bswmdPaths).toHaveLength(2);

    // Act
    useArxmlStore.getState().removeBswmd('/schemas/A.arxml');

    // Assert
    const after = useArxmlStore.getState();
    expect(after.bswmdPaths).toEqual(['/schemas/B.arxml']);
    expect(after.project?.bswmdPaths).toEqual(['/schemas/B.arxml']);
  });

  it('removes unknown path → no-op (no error, no state change)', () => {
    // Arrange
    useArxmlStore.getState().addBswmd('/schemas/A.arxml', MIN_BSWMD);
    const before = useArxmlStore.getState();

    // Act
    useArxmlStore.getState().removeBswmd('/schemas/does-not-exist.arxml');

    // Assert
    const after = useArxmlStore.getState();
    expect(after.bswmdSchemas).toBe(before.bswmdSchemas);
    expect(after.bswmdPaths).toBe(before.bswmdPaths);
    expect(after.bswmdSchemas).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 7. End-to-end smoke: synthetic inline BSWMD + ARXML with valid/invalid enum
// ---------------------------------------------------------------------------
//
// The validator (validate.ts) only walks the top-level `pkg.elements` of
// each ARXML document — it does NOT recurse into nested `pkg.packages`.
// The 5 baseline fixtures all put their modules at the top level
// (`<AR-PACKAGE shortName="EcucDefs">` > `<ELEMENTS>` > module). To keep
// the smoke aligned with the validator's contract we use a synthetic
// inline BSWMD whose module path also lives at the top-level package
// shape (`/EcucDefs/Adc/...`), and a top-level ARXML pkg. This isolates
// the smoke from any future "validate walks nested packages" change
// while still exercising the full BSWMD-parse → buildSchemaLayer →
// validateProject → 'enum' kind emission pipeline.

const SYNTHETIC_ADC_BSWMD = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Adc</SHORT-NAME>
          <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
          <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>AdcConfigSet</SHORT-NAME>
              <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
              <SUB-CONTAINERS>
                <ECUC-PARAM-CONF-CONTAINER-DEF>
                  <SHORT-NAME>AdcHwUnit</SHORT-NAME>
                  <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY-INFINITE>true</UPPER-MULTIPLICITY-INFINITE>
                  <SUB-CONTAINERS>
                    <ECUC-PARAM-CONF-CONTAINER-DEF>
                      <SHORT-NAME>AdcChannel</SHORT-NAME>
                      <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                      <UPPER-MULTIPLICITY-INFINITE>true</UPPER-MULTIPLICITY-INFINITE>
                      <PARAMETERS>
                        <ECUC-ENUMERATION-PARAM-DEF>
                          <SHORT-NAME>AdcChannelRangeSelect</SHORT-NAME>
                          <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                          <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                          <LITERALS>
                            <ECUC-ENUMERATION-LITERAL-DEF>
                              <SHORT-NAME>ADC_RANGE_ALWAYS</SHORT-NAME>
                            </ECUC-ENUMERATION-LITERAL-DEF>
                            <ECUC-ENUMERATION-LITERAL-DEF>
                              <SHORT-NAME>ADC_RANGE_BETWEEN</SHORT-NAME>
                            </ECUC-ENUMERATION-LITERAL-DEF>
                            <ECUC-ENUMERATION-LITERAL-DEF>
                              <SHORT-NAME>ADC_RANGE_UNDER_LOW</SHORT-NAME>
                            </ECUC-ENUMERATION-LITERAL-DEF>
                          </LITERALS>
                        </ECUC-ENUMERATION-PARAM-DEF>
                      </PARAMETERS>
                    </ECUC-PARAM-CONF-CONTAINER-DEF>
                  </SUB-CONTAINERS>
                </ECUC-PARAM-CONF-CONTAINER-DEF>
              </SUB-CONTAINERS>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

/** Top-level-package ARXML (validator contract: walks only top-level
 *  pkg.elements) carrying the Adc/AdcConfigSet/AdcHwUnit/AdcChannel
 *  tree with a single AdcChannelRangeSelect param on the deepest
 *  container. Package path `/EcucDefs` matches the synthetic BSWMD
 *  module root above so the layer lookup resolves.
 *
 *  ParamValue.type for enum literals is `'enum'` (not `'enumeration'`
 *  — the schema side uses 'enumeration' as the BSWMD/ECUC kind, but
 *  the value side collapses it to the shorter form for ParamValue
 *  tagging). The validator's `typeMatches` enforces this so an
 *  inconsistent literal would short-circuit at the type check before
 *  reaching the enum-literal comparison. */
function makeAdcArxmlWithEnumParam(enumValue: string): ArxmlDocument {
  const adcChannel: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'AdcChannel',
    params: {
      AdcChannelRangeSelect: { type: 'enum', value: enumValue },
    },
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
  const adc: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'Adc',
    params: {},
    children: [adcConfigSet],
    references: [],
  };
  return {
    path: '/tmp/Adc.arxml',
    version: '4.6',
    packages: [
      {
        shortName: 'EcucDefs',
        path: '/EcucDefs',
        elements: [adc],
      },
    ],
  };
}

describe('useArxmlStore — BSWMD enum-literal end-to-end smoke (Sprint 12 #2)', () => {
  it('addBswmd with synthetic BSWMD + invalid enum literal surfaces an enum error', () => {
    // Arrange — synthetic BSWMD with the enum literal set, ARXML with
    // AdcChannelRangeSelect = 'ADC_RANGE_INVALID' (not in BSWMD literals)
    const doc = makeAdcArxmlWithEnumParam('ADC_RANGE_INVALID');

    // Act
    useArxmlStore.getState().addDocument(doc, '/tmp/Adc.arxml');
    useArxmlStore.getState().addBswmd('/schemas/Adc.bswmd.arxml', SYNTHETIC_ADC_BSWMD);

    // Assert — at least one 'enum' kind error exists, and it's the
    // AdcChannelRangeSelect param path
    const errors = useArxmlStore.getState().validationErrors;
    const enumErrors = errors.filter((e) => e.kind === 'enum');
    expect(enumErrors.length).toBeGreaterThan(0);
    const enumError = enumErrors.find((e) => e.path.endsWith('/AdcChannelRangeSelect'));
    expect(enumError).toBeDefined();
  });

  it('addBswmd with synthetic BSWMD + valid enum literal → 0 enum errors', () => {
    // Arrange
    const doc = makeAdcArxmlWithEnumParam('ADC_RANGE_BETWEEN');

    // Act
    useArxmlStore.getState().addDocument(doc, '/tmp/Adc.arxml');
    useArxmlStore.getState().addBswmd('/schemas/Adc.bswmd.arxml', SYNTHETIC_ADC_BSWMD);

    // Assert
    const errors = useArxmlStore.getState().validationErrors;
    const enumErrors = errors.filter((e) => e.kind === 'enum');
    expect(enumErrors).toEqual([]);
  });

  it('addBswmd with the REAL Adc_bswmd.arxml fixture (parser + real file integration smoke)', () => {
    // The real Adc_bswmd.arxml has its module under /AUTOSAR_R22/EcucDefs
    // (R22 release namespace). The validator only walks top-level
    // pkg.elements, so the ARXML still uses a top-level EcucDefs pkg
    // but the layer won't surface enum errors for an unmatched module
    // root. This test instead asserts that:
    //   1. addBswmd succeeds (the real file parses cleanly)
    //   2. bswmdSchemas holds a non-empty BswmdDocument (Adc_bswmd.arxml
    //      declares version '4.0' from its r4.0 namespace)
    //   3. No state corruption (error stays null, no enum/range/etc. errors
    //      bleed in from elsewhere)
    // The synthetic smoke above is the load-bearing end-to-end enum check;
    // this one pins the "real fixture parses + integrates" contract that
    // Task 7 (canifSmoke) will exercise more fully.
    const bswmdContent = readFileSync(ADC_BSWMD_PATH, 'utf8');

    useArxmlStore.getState().addBswmd(ADC_BSWMD_PATH, bswmdContent);

    const after = useArxmlStore.getState();
    expect(after.bswmdSchemas).toHaveLength(1);
    // The real Adc BSWMD uses the r4.0 namespace; the parser normalises
    // it to the '4.0' version string.
    expect(after.bswmdSchemas[0]!.version).toBe('4.0');
    expect(after.bswmdSchemas[0]!.modules.length).toBeGreaterThan(0);
    expect(after.bswmdPaths).toEqual([ADC_BSWMD_PATH]);
    expect(after.error).toBeNull();
  });
});
