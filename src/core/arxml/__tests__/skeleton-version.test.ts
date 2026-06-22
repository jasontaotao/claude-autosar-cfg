// v1.8.4 Bug 1 — skeleton version must follow BSWMD doc.version.
//
// Previously skeleton.ts:88 hardcoded `version: '4.6'` for every
// generated ECUC, regardless of the source BSWMD's declared version.
// A BSWMD with `xmlns=".../schema/r5.0"` produced a skeleton written
// with the r4.6 namespace + `AUTOSAR_4-6-0.xsd` schemaLocation,
// which is invalid for the source.
//
// The fix: introduce `mapBswmdVersionToArxml(v: string): ArxmlVersion`
// at `src/core/arxml/version.ts`, default to '4.6' for BSWMD-only
// versions (notably '4.0', which BSWMD accepts but ARXML emit does
// not), and call it from `generateEcucSkeleton`.

import { describe, it, expect } from 'vitest';

import type { BswmdDocument, BswModuleDef, ContainerDef } from '../../project/bswmd.js';
import { generateEcucSkeleton } from '../skeleton.js';
import { mapBswmdVersionToArxml } from '../version.js';

function makeBswModule(shortName: string): BswModuleDef {
  return {
    shortName,
    path: `/${shortName}`,
    dialect: 'ecuc-module-def',
    moduleId: null,
    containers: [] as readonly ContainerDef[],
    providedEntries: [],
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
    multiplicityConfigClasses: [],
  };
}

function makeBswmd(version: string): BswmdDocument {
  return {
    version,
    modules: [makeBswModule('Can')],
    warnings: [],
  };
}

describe('mapBswmdVersionToArxml (v1.8.4 Bug 1 helper)', () => {
  it('passes through ArxmlVersion-supported major.minor values', () => {
    expect(mapBswmdVersionToArxml('4.2')).toBe('4.2');
    expect(mapBswmdVersionToArxml('4.4')).toBe('4.4');
    expect(mapBswmdVersionToArxml('4.6')).toBe('4.6');
    expect(mapBswmdVersionToArxml('4.7')).toBe('4.7');
    expect(mapBswmdVersionToArxml('5.0')).toBe('5.0');
  });

  it('passes through the numeric AUTOSAR form (R4.4+ releases)', () => {
    expect(mapBswmdVersionToArxml('00005')).toBe('00005');
    expect(mapBswmdVersionToArxml('00006')).toBe('00006');
    expect(mapBswmdVersionToArxml('00046')).toBe('00046');
    expect(mapBswmdVersionToArxml('00048')).toBe('00048');
    expect(mapBswmdVersionToArxml('00049')).toBe('00049');
    expect(mapBswmdVersionToArxml('00050')).toBe('00050');
    expect(mapBswmdVersionToArxml('00051')).toBe('00051');
  });

  it("passes '4.0' through (1:1 mapping for BSWMD r4.0 namespace)", () => {
    // Two of the three repo BSWMD fixtures (Adc, JWQ3399) declare
    // xmlns="http://autosar.org/schema/r4.0", which parseBswmd
    // normalises to version literal '4.0'. Per user feedback (Bug 1
    // follow-up): the ECUC emitted from an r4.0 BSWMD must carry the
    // r4.0 namespace + AUTOSAR_4-0-3.xsd schemaLocation, not silently
    // upgrade to r4.6. ARXML schemaLocation 'r4.0' has been a stable
    // AUTOSAR namespace since R3.x and remains valid for R4.x tools.
    expect(mapBswmdVersionToArxml('4.0')).toBe('4.0');
  });

  it('defaults unknown future versions (e.g. r4.8) to 4.6 — pin the silent fallback contract', () => {
    // If a future BSWMD carries a vendor-only or r4.8+ version literal
    // not yet in ArxmlVersion, skeleton generation falls back to '4.6'
    // (the v1.8.3 behaviour). Pin this so a future tightening of the
    // helper into an explicit table doesn't silently regress.
    expect(mapBswmdVersionToArxml('4.8')).toBe('4.6');
    expect(mapBswmdVersionToArxml('AUTOSAR_4-8-0.xsd')).toBe('4.6');
    expect(mapBswmdVersionToArxml('')).toBe('4.6');
  });
});

describe('generateEcucSkeleton uses doc.version (v1.8.4 Bug 1 fix)', () => {
  it('skeleton for BSWMD r4.6 carries r4.6 (regression check)', () => {
    const ar = generateEcucSkeleton(makeBswmd('4.6'), 'Can');
    expect(ar.version).toBe('4.6');
  });

  it('skeleton for BSWMD r5.0 carries r5.0', () => {
    const ar = generateEcucSkeleton(makeBswmd('5.0'), 'Can');
    expect(ar.version).toBe('5.0');
  });

  it('skeleton for BSWMD r4.2 carries r4.2 (was previously r4.6)', () => {
    const ar = generateEcucSkeleton(makeBswmd('4.2'), 'Can');
    expect(ar.version).toBe('4.2');
  });

  it('skeleton for BSWMD R22-11 (00051) carries 00051', () => {
    const ar = generateEcucSkeleton(makeBswmd('00051'), 'Can');
    expect(ar.version).toBe('00051');
  });

  it('skeleton for BSWMD R5.0 numeric (00005) carries 00005', () => {
    const ar = generateEcucSkeleton(makeBswmd('00005'), 'Can');
    expect(ar.version).toBe('00005');
  });

  it('skeleton for BSWMD r4.0 carries r4.0 (Bug 1 follow-up: 1:1 mapping, no silent r4.6 fallback)', () => {
    // Regression for v1.8.4 silent fallback: r4.0 BSWMD used to
    // emit r4.6 ECUC, breaking round-trip with vendors (Adc, JWQ3399)
    // that validate against AUTOSAR_4-0-3.xsd. The user's two real
    // fixtures in tests/fixtures/bswmd/ both declare
    // xmlns="http://autosar.org/schema/r4.0"; emit must match.
    const ar = generateEcucSkeleton(makeBswmd('4.0'), 'Can');
    expect(ar.version).toBe('4.0');
  });
});

describe('Bug 1 follow-up — end-to-end r4.0 fixture round-trip', () => {
  it('serialises r4.0 BSWMD as r4.0 ECUC (xmlns + schemaLocation)', async () => {
    // Load the real Adc BSWMD fixture (declares xmlns="...r4.0") and
    // verify the ECUC skeleton + serialised output keep the r4.0
    // namespace — not the r4.6 fallback that v1.8.4 used to emit.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { serializeArxml } = await import('../serializer.js');
    const { parseBswmd } = await import('../../project/bswmd.js');
    const fixturePath = resolve(__dirname, '../../../..', 'tests/fixtures/bswmd/Adc_bswmd.arxml');
    const xml = readFileSync(fixturePath, 'utf-8');
    const parsed = parseBswmd(xml);
    if (!parsed.ok) {
      throw new Error(
        `fixture parse failed: ${'message' in parsed.error ? parsed.error.message : parsed.error.kind}`,
      );
    }
    expect(parsed.value.version).toBe('4.0');
    const ar = generateEcucSkeleton(parsed.value, parsed.value.modules[0]!.shortName);
    expect(ar.version).toBe('4.0');
    const ser = serializeArxml(ar);
    if (!ser.ok) {
      throw new Error(`serialize failed (kind=${String(ser.error)})`);
    }
    // Two of the three repo BSWMD fixtures (Adc, JWQ3399) declare the
    // r4.0 namespace; the serialised ECUC must mirror it. Pre-fix this
    // would have produced r4.6 (the silent fallback), breaking
    // round-trip with vendors that validate against AUTOSAR_4-0-3.xsd.
    expect(ser.value).toContain('xmlns="http://autosar.org/schema/r4.0"');
    expect(ser.value).toContain('AUTOSAR_4-0-3.xsd');
    expect(ser.value).not.toContain('http://autosar.org/schema/r4.6');
  });
});
