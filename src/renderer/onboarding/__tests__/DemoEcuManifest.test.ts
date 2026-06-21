// src/renderer/onboarding/__tests__/DemoEcuManifest.test.ts
// v1.6.0 W — DemoEcuManifestFile schema + path-containment + perf gate.
//
// Contract (locked W spec §3.4.1):
//   - 4 required fields: manifestVersion, bswmds, valueArxmls, intentionalViolations
//   - manifestVersion MUST be '1' (no silent default)
//   - All bswmds / valueArxmls entries are relative paths (no absolute, no `..` traversal)
//   - Duplicates within bswmds or valueArxmls are de-duplicated (preserve order)
//   - Parse ≤ 50 ms for the bundled Demo ECU (~1 KB)
//
// TDD: this file pins the schema BEFORE the manifest file ships.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  parseDemoEcuManifest,
  DEMO_ECU_MANIFEST_RELATIVE_PATH,
} from '../DemoEcuManifest.js';

const SAMPLE = JSON.stringify({
  manifestVersion: '1',
  bswmds: [
    'bswmd/Bsw_Com_Bswmd.arxml',
    'bswmd/Bsw_ComM_Bswmd.arxml',
    'bswmd/Bsw_CanIf_Bswmd.arxml',
    'bswmd/Bsw_EcuC_Bswmd.arxml',
    'bswmd/Bsw_PduR_Bswmd.arxml',
  ],
  valueArxmls: [
    'EcuC_Config.arxml',
    'Com_Config.arxml',
    'CanIf_Config.arxml',
    'ComM_Config.arxml',
    'PduR_Config.arxml',
  ],
  intentionalViolations: [
    {
      ruleId: 'SWS_COM_PDUID_UNIQUE',
      path: '/Com/ComConfig/ComIPdu/ComIPdu_1/ComPduId',
    },
  ],
});

describe('parseDemoEcuManifest (v1.6.0 W)', () => {
  it('accepts the canonical 5-module Demo ECU manifest', () => {
    const m = parseDemoEcuManifest(SAMPLE);
    expect(m.manifestVersion).toBe('1');
    expect(m.bswmds).toHaveLength(5);
    expect(m.valueArxmls).toHaveLength(5);
    expect(m.intentionalViolations).toHaveLength(1);
  });

  it('rejects unknown manifestVersion', () => {
    expect(() =>
      parseDemoEcuManifest(JSON.stringify({ manifestVersion: '2', bswmds: [], valueArxmls: [], intentionalViolations: [] })),
    ).toThrow(/manifestVersion/);
  });

  it('rejects missing manifestVersion', () => {
    expect(() =>
      parseDemoEcuManifest(JSON.stringify({ bswmds: [], valueArxmls: [], intentionalViolations: [] })),
    ).toThrow(/manifestVersion/);
  });

  it('rejects missing bswmds', () => {
    expect(() =>
      parseDemoEcuManifest(
        JSON.stringify({ manifestVersion: '1', valueArxmls: [], intentionalViolations: [] }),
      ),
    ).toThrow(/bswmds/);
  });

  it('rejects absolute paths in bswmds', () => {
    expect(() =>
      parseDemoEcuManifest(
        JSON.stringify({
          manifestVersion: '1',
          bswmds: ['/etc/passwd'],
          valueArxmls: [],
          intentionalViolations: [],
        }),
      ),
    ).toThrow(/absolute|relative|traversal/);
  });

  it('rejects parent-traversal in bswmds', () => {
    expect(() =>
      parseDemoEcuManifest(
        JSON.stringify({
          manifestVersion: '1',
          bswmds: ['../../etc/passwd'],
          valueArxmls: [],
          intentionalViolations: [],
        }),
      ),
    ).toThrow(/absolute|relative|traversal|\.\./);
  });

  it('rejects parent-traversal in valueArxmls', () => {
    expect(() =>
      parseDemoEcuManifest(
        JSON.stringify({
          manifestVersion: '1',
          bswmds: [],
          valueArxmls: ['../secret.arxml'],
          intentionalViolations: [],
        }),
      ),
    ).toThrow(/absolute|relative|traversal|\.\./);
  });

  it('de-duplicates bswmd entries preserving insertion order', () => {
    const m = parseDemoEcuManifest(
      JSON.stringify({
        manifestVersion: '1',
        bswmds: ['a.arxml', 'b.arxml', 'a.arxml', 'c.arxml', 'b.arxml'],
        valueArxmls: [],
        intentionalViolations: [],
      }),
    );
    expect(m.bswmds).toEqual(['a.arxml', 'b.arxml', 'c.arxml']);
  });

  it('accepts an empty intentionalViolations array', () => {
    const m = parseDemoEcuManifest(
      JSON.stringify({ manifestVersion: '1', bswmds: [], valueArxmls: [], intentionalViolations: [] }),
    );
    expect(m.intentionalViolations).toEqual([]);
  });

  it('parses the bundled Demo ECU manifest file (if shipped)', () => {
    const fixturePath = resolve(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'samples',
      'arxml',
      'demo-ecu',
      'demo.autosarcfg.json',
    );
    let raw: string;
    try {
      raw = readFileSync(fixturePath, 'utf-8');
    } catch {
      // Fixture not yet shipped — this test will activate on PR(W-2)
      // commit when the fixture lands on disk.
      return;
    }
    const m = parseDemoEcuManifest(raw);
    expect(m.manifestVersion).toBe('1');
    expect(m.bswmds.length).toBeGreaterThanOrEqual(5);
    expect(m.valueArxmls.length).toBeGreaterThanOrEqual(5);
  });

  it('parses a 1 KB manifest in well under 50 ms', () => {
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) {
      parseDemoEcuManifest(SAMPLE);
    }
    const elapsed = performance.now() - t0;
    expect(elapsed / 50).toBeLessThan(50);
  });

  it('exposes the canonical relative path constant', () => {
    expect(DEMO_ECU_MANIFEST_RELATIVE_PATH).toBe('samples/arxml/demo-ecu/demo.autosarcfg.json');
  });
});