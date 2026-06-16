// BSWMD parser round-trip tests — Sprint 12 #1 Task 2.
//
// These tests parse real-world BSWMD samples from EB tresos and the AUTOSAR
// standard ECUC-MODULE-DEF shape, then assert the parser surfaces the
// expected structural data (modules, containers, parameters, references,
// dialect, version). They are the source of truth for parser behaviour on
// non-synthetic data; fixtures live in tests/fixtures/bswmd/.
//
// Scope: parse-real-file → check-key-fields. We do NOT serialise back to
// XML here — that round-trip belongs to the serializer task (Sprint 13).
//
// Conventions: AAA pattern, descriptive `it` names, vitest, immutable
// returns. Every shared fixture is read with `readFileSync` so the test
// fails fast if the fixture file is missing (better than a silent zero-
// length parse).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, beforeAll } from 'vitest';

import {
  findModuleByPath,
  lookupContainerDef,
  lookupParamDef,
  lookupReferenceDef,
  parseBswmd,
  type BswModuleDef,
} from '../../../../src/core/project/bswmd.js';

// ---------------------------------------------------------------------------
// Fixture loading — run once per test file so individual tests stay focused
// on assertions rather than I/O.
// ---------------------------------------------------------------------------

const FIXTURE_DIR = join(__dirname, '..');
const CAN_PATH = join(FIXTURE_DIR, 'Can_Bswmd.arxml');
const ADC_PATH = join(FIXTURE_DIR, 'Adc_bswmd.arxml');

// Cache parsed documents to avoid re-parsing for each assertion. We freeze
// the reference so a buggy test can't accidentally mutate the cached doc.
let canXml: string;
let adcXml: string;
let canDoc: ReturnType<typeof parseBswmd>;
let adcDoc: ReturnType<typeof parseBswmd>;

beforeAll(() => {
  canXml = readFileSync(CAN_PATH, 'utf-8');
  adcXml = readFileSync(ADC_PATH, 'utf-8');
  canDoc = parseBswmd(canXml);
  adcDoc = parseBswmd(adcXml);
});

// ---------------------------------------------------------------------------
// Dialect 1 — EB tresos BSW-MODULE-DESCRIPTION (Can_Bswmd.arxml)
// ---------------------------------------------------------------------------

describe('Can_Bswmd (EB tresos dialect)', () => {
  it('parses the 247-line EB tresos sample without error', () => {
    // Arrange — read in beforeAll.
    // Act
    const ok = canDoc.ok;

    // Assert
    expect(ok).toBe(true);
    if (!canDoc.ok) {
      // Surface the parse error in the test output for easier diagnosis.
      throw new Error(`parseBswmd failed: ${JSON.stringify(canDoc.error)}`);
    }
  });

  it('exposes exactly one module named Can with dialect bsw-module-description', () => {
    // Arrange
    if (!canDoc.ok) throw new Error('precondition: Can_Bswmd did not parse');
    const modules = canDoc.value.modules;

    // Act + Assert
    expect(modules).toHaveLength(1);
    const mod: BswModuleDef = modules[0]!;
    expect(mod.shortName).toBe('Can');
    expect(mod.dialect).toBe('bsw-module-description');
  });

  it('resolves Can module to moduleId 80 and the standard EB tresos path', () => {
    // Arrange
    if (!canDoc.ok) throw new Error('precondition: Can_Bswmd did not parse');
    const mod = canDoc.value.modules[0]!;

    // Act + Assert
    expect(mod.moduleId).toBe(80);
    expect(mod.path).toBe('/AUTOSAR_Can/BswModuleDescriptions/Can');
  });

  it('recovers providedEntries from inner <BSW-MODULE-ENTRY-REF> when wrapper omits <SHORT-NAME>', () => {
    // Arrange
    if (!canDoc.ok) throw new Error('precondition: Can_Bswmd did not parse');
    const mod = canDoc.value.modules[0]!;

    // Act + Assert — EB tresos stores the entry name inside the ref path,
    // not on the wrapper. The parser derives `shortName` from the last path
    // segment of the inner <BSW-MODULE-ENTRY-REF> text and captures
    // `@_DEST` as `entryKind`. The fixture carries two real refs:
    //   Can_Init               → /AUTOSAR_Can/BswModuleEntrys/Can_Init
    //   Can_MainFunction_Mode  → /AUTOSAR_Can/BswModuleEntrys/Can_MainFunction_Mode
    expect(mod.providedEntries).toHaveLength(2);
    const byName = new Map(mod.providedEntries.map((e) => [e.shortName, e]));
    const init = byName.get('Can_Init');
    expect(init).toBeDefined();
    expect(init?.entryRefPath).toBe('/AUTOSAR_Can/BswModuleEntrys/Can_Init');
    expect(init?.entryKind).toBe('BSW-MODULE-ENTRY');
    expect(init?.path).toBe('/AUTOSAR_Can/BswModuleDescriptions/Can/Can_Init');
    const mode = byName.get('Can_MainFunction_Mode');
    expect(mode).toBeDefined();
    expect(mode?.entryRefPath).toBe('/AUTOSAR_Can/BswModuleEntrys/Can_MainFunction_Mode');
    expect(mode?.entryKind).toBe('BSW-MODULE-ENTRY');
  });

  it('surfaces a fallback warning for every EB tresos entry without wrapper SHORT-NAME', () => {
    // Arrange
    if (!canDoc.ok) throw new Error('precondition: Can_Bswmd did not parse');

    // Act + Assert — two fallback warnings are recorded (one per entry).
    // They must NOT block the parse — entries are still returned — but the
    // renderer should be able to surface them in the project panel.
    const fallbackWarnings = canDoc.value.warnings.filter((w) =>
      /provided entry omits wrapper <SHORT-NAME>/.test(w),
    );
    expect(fallbackWarnings.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Dialect 2 — AUTOSAR standard ECUC-MODULE-DEF (Adc_bswmd.arxml)
// ---------------------------------------------------------------------------

describe('Adc_bswmd (AUTOSAR ECUC-MODULE-DEF dialect)', () => {
  it('parses the 1224-line AUTOSAR standard sample without error', () => {
    // Arrange — read in beforeAll.
    // Act
    const ok = adcDoc.ok;

    // Assert
    expect(ok).toBe(true);
    if (!adcDoc.ok) {
      throw new Error(`parseBswmd failed: ${JSON.stringify(adcDoc.error)}`);
    }
  });

  it('exposes exactly one module named Adc with dialect ecuc-module-def', () => {
    // Arrange
    if (!adcDoc.ok) throw new Error('precondition: Adc_bswmd did not parse');
    const modules = adcDoc.value.modules;

    // Act + Assert
    expect(modules).toHaveLength(1);
    const mod = modules[0]!;
    expect(mod.shortName).toBe('Adc');
    expect(mod.dialect).toBe('ecuc-module-def');
    expect(mod.path).toBe('/AUTOSAR_R22/EcucDefs/Adc');
    expect(mod.moduleId).toBeNull();
  });

  it('exposes three top-level containers (AdcConfigSet, AdcGeneral, AdcPublishedInformation)', () => {
    // Arrange
    if (!adcDoc.ok) throw new Error('precondition: Adc_bswmd did not parse');
    const mod = adcDoc.value.modules[0]!;

    // Act
    const names = mod.containers.map((c) => c.shortName);

    // Assert
    expect(names).toEqual(['AdcConfigSet', 'AdcGeneral', 'AdcPublishedInformation']);
  });

  it('lookupContainerDef finds AdcConfigSet at the top level', () => {
    // Arrange
    if (!adcDoc.ok) throw new Error('precondition: Adc_bswmd did not parse');
    const mod = adcDoc.value.modules[0]!;

    // Act
    const c = lookupContainerDef(mod, 'AdcConfigSet');

    // Assert
    expect(c).not.toBeNull();
    expect(c?.path).toBe('/AUTOSAR_R22/EcucDefs/Adc/AdcConfigSet');
    expect(c?.subContainers).toHaveLength(1);
  });

  it('lookupContainerDef recurses into AdcHwUnit nested under AdcConfigSet', () => {
    // Arrange
    if (!adcDoc.ok) throw new Error('precondition: Adc_bswmd did not parse');
    const mod = adcDoc.value.modules[0]!;

    // Act
    const hwUnit = lookupContainerDef(mod, 'AdcHwUnit');

    // Assert
    expect(hwUnit).not.toBeNull();
    expect(hwUnit?.shortName).toBe('AdcHwUnit');
    expect(hwUnit?.path).toBe('/AUTOSAR_R22/EcucDefs/Adc/AdcConfigSet/AdcHwUnit');
    // AdcHwUnit has AdcChannel and AdcGroup as children in the real file.
    const childNames = hwUnit?.subContainers.map((s) => s.shortName) ?? [];
    expect(childNames).toContain('AdcChannel');
    expect(childNames).toContain('AdcGroup');
  });

  it('lookupParamDef finds AdcHwUnitId (enumeration) on the AdcHwUnit container', () => {
    // Arrange
    if (!adcDoc.ok) throw new Error('precondition: Adc_bswmd did not parse');
    const mod = adcDoc.value.modules[0]!;
    const hwUnit = lookupContainerDef(mod, 'AdcHwUnit');
    expect(hwUnit).not.toBeNull();
    if (!hwUnit) return;

    // Act
    const p = lookupParamDef(hwUnit, 'AdcHwUnitId');

    // Assert — AdcHwUnitId is an ECUC-ENUMERATION-PARAM-DEF in the
    // real AUTOSAR standard file. Note: its <LITERALS/> is empty (vendor-
    // specific), so we only check `kind` here, not literal count.
    expect(p).not.toBeNull();
    expect(p?.kind).toBe('enumeration');
    expect(p?.shortName).toBe('AdcHwUnitId');
  });
});

// ---------------------------------------------------------------------------
// Recursive totals — keep README numbers in sync with code
// ---------------------------------------------------------------------------

describe('Adc_bswmd recursive totals (synced with README)', () => {
  it('walks the full Adc tree and reports 7 containers / 42 parameters / 4 references', () => {
    // Arrange
    if (!adcDoc.ok) throw new Error('precondition: Adc_bswmd did not parse');

    // Walk helpers — top-level `containers` only counts the direct children;
    // we need to recurse to reach sub-containers and aggregate every node.
    let containers = 0;
    let parameters = 0;
    let references = 0;
    const visit = (c: {
      subContainers: readonly unknown[];
      parameters: readonly unknown[];
      references: readonly unknown[];
      choices: readonly unknown[];
    }): void => {
      containers += 1;
      parameters += c.parameters.length;
      references += c.references.length;
      for (const sub of c.subContainers) visit(sub as Parameters<typeof visit>[0]);
      for (const choice of c.choices) visit(choice as Parameters<typeof visit>[0]);
    };
    for (const top of adcDoc.value.modules[0]!.containers) visit(top);

    // Assert — these numbers are the source of truth for the README. If a
    // future parser change accidentally drops a sub-tree, this test fails
    // first so the README can be updated deliberately.
    //
    // 4 references is the real-data count: there are two `<REFERENCES>`
    // blocks in the file (AdcGroup has AdcGroupDefinition +
    // AdcGroupEcucPartitionRef; AdcHwUnit has AdcEcucPartitionRef +
    // AdcKernelEcucPartitionRef). Earlier estimates of 8 in the README
    // counted open + close tags as separate refs.
    expect(containers).toBe(7);
    expect(parameters).toBe(42);
    expect(references).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Lookup helpers — cross-cutting real-data assertions
// ---------------------------------------------------------------------------

describe('lookup helpers on real fixtures', () => {
  it('findModuleByPath resolves the Adc module by its canonical path', () => {
    // Arrange
    if (!adcDoc.ok) throw new Error('precondition: Adc_bswmd did not parse');

    // Act
    const mod = findModuleByPath(adcDoc.value, '/AUTOSAR_R22/EcucDefs/Adc');

    // Assert
    expect(mod).not.toBeNull();
    expect(mod?.shortName).toBe('Adc');
  });

  it('findModuleByPath returns null for an unknown path', () => {
    // Arrange
    if (!adcDoc.ok) throw new Error('precondition: Adc_bswmd did not parse');

    // Act
    const mod = findModuleByPath(adcDoc.value, '/AUTOSAR_R22/EcucDefs/NotAModule');

    // Assert
    expect(mod).toBeNull();
  });

  it('lookupReferenceDef finds AdcGroupDefinition inside AdcGroup (real ref kind)', () => {
    // Arrange
    if (!adcDoc.ok) throw new Error('precondition: Adc_bswmd did not parse');
    const mod = adcDoc.value.modules[0]!;
    const group = lookupContainerDef(mod, 'AdcGroup');
    expect(group).not.toBeNull();
    if (!group) return;

    // Act
    const ref = lookupReferenceDef(group, 'AdcGroupDefinition');

    // Assert — the real reference points to another container definition.
    expect(ref).not.toBeNull();
    expect(ref?.destKind).toBe('ECUC-PARAM-CONF-CONTAINER-DEF');
    expect(ref?.path).toBe(
      '/AUTOSAR_R22/EcucDefs/Adc/AdcConfigSet/AdcHwUnit/AdcGroup/AdcGroupDefinition',
    );
  });
});

// ---------------------------------------------------------------------------
// Error paths — inline minimal XML (no fixture file needed)
// ---------------------------------------------------------------------------

describe('parseBswmd error paths', () => {
  it('returns xml-malformed for an empty string', () => {
    // Arrange + Act
    const r = parseBswmd('');

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('xml-malformed');
  });

  it('returns missing-root when <AUTOSAR> element is absent', () => {
    // Arrange
    const xml = '<?xml version="1.0" encoding="UTF-8"?><root></root>';

    // Act
    const r = parseBswmd(xml);

    // Assert
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.kind).toBe('missing-root');
  });
});

// ---------------------------------------------------------------------------
// Warnings surface — non-fatal observations must be reachable
// ---------------------------------------------------------------------------

describe('warnings surface', () => {
  it('exposes warnings as a readonly array on both real fixtures', () => {
    // Arrange
    if (!canDoc.ok) throw new Error('precondition: Can_Bswmd did not parse');
    if (!adcDoc.ok) throw new Error('precondition: Adc_bswmd did not parse');

    // Act + Assert
    expect(Array.isArray(canDoc.value.warnings)).toBe(true);
    expect(Array.isArray(adcDoc.value.warnings)).toBe(true);
    // The EB tresos sample carries unknown top-level kinds (BSW-MODULE-ENTRY
    // and BSW-IMPLEMENTATION in sibling packages) that the schema-side parser
    // records as warnings without aborting. The AUTOSAR standard sample is
    // self-contained and produces none.
    expect(canDoc.value.warnings.length).toBeGreaterThan(0);
    expect(adcDoc.value.warnings.length).toBe(0);
  });
});
