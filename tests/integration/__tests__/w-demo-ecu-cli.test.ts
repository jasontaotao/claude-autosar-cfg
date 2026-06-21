// tests/integration/__tests__/w-demo-ecu-cli.test.ts
// v1.6.0 A+C spec §10.6 row #4 + W spec §3.4.1 — W Demo ECU loaded via CLI.
//
// Integration scenario:
//   1. CLI opens `samples/arxml/demo-ecu/demo.autosarcfg.json`
//   2. parseDemoEcuManifest validates per W §3.4.1 schema
//   3. The bundle lists 5 BSWMDs + 5 value ARXMLs
//   4. A+C read command consumes the same manifest (canonical SoT)
//
// This test does NOT spawn the CLI binary (no Electron-free runtime in
// unit test). It exercises the manifest parser that A+C imports verbatim
// per the v1.5.1 PR(5) split convention + W §3.4.1 cross-reference lock.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseDemoEcuManifest } from '../../../src/renderer/onboarding/DemoEcuManifest.js';

const FIXTURE_DIR = resolve(__dirname, '..', '..', '..', 'samples', 'arxml', 'demo-ecu');
const MANIFEST_PATH = resolve(FIXTURE_DIR, 'demo.autosarcfg.json');

describe('integration: W Demo ECU loaded via CLI (#4)', () => {
  it('the bundled manifest file exists on disk', () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
  });

  it('parses the bundled manifest with the canonical schema', () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
    const raw = readFileSync(MANIFEST_PATH, 'utf-8');
    const m = parseDemoEcuManifest(raw);
    expect(m.manifestVersion).toBe('1');
    expect(m.bswmds.length).toBeGreaterThanOrEqual(5);
    expect(m.valueArxmls.length).toBeGreaterThanOrEqual(5);
  });

  it('all 5 BSWMD files referenced by the manifest exist on disk', () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
    const raw = readFileSync(MANIFEST_PATH, 'utf-8');
    const m = parseDemoEcuManifest(raw);
    for (const relPath of m.bswmds) {
      const abs = resolve(FIXTURE_DIR, relPath);
      expect(existsSync(abs)).toBe(true);
    }
  });

  it('all 5 value-side ARXML files referenced by the manifest exist on disk', () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
    const raw = readFileSync(MANIFEST_PATH, 'utf-8');
    const m = parseDemoEcuManifest(raw);
    for (const relPath of m.valueArxmls) {
      const abs = resolve(FIXTURE_DIR, relPath);
      expect(existsSync(abs)).toBe(true);
    }
  });

  it('manifest contains 1 intentional SWS_COM_PDUID_UNIQUE violation', () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
    const raw = readFileSync(MANIFEST_PATH, 'utf-8');
    const m = parseDemoEcuManifest(raw);
    expect(m.intentionalViolations).toHaveLength(1);
    expect(m.intentionalViolations[0]?.ruleId).toBe('SWS_COM_PDUID_UNIQUE');
  });
});
