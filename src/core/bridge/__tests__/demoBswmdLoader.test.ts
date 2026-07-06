// v1.26.0 — Demo BSWMD loader (parses ARXML strings into BswModuleDef map).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import { DCM_MODULE_SHORT_NAME } from '../dcmConstants.js';
import { parseDemoBswmds } from '../demoBswmdLoader.js';

const DEMO_BSWMD_DIR = resolve(__dirname, '../../../../samples/arxml/demo-ecu/bswmd');

function loadDemoBswmd(moduleShortName: string): string {
  return readFileSync(resolve(DEMO_BSWMD_DIR, `Bsw_${moduleShortName}_Bswmd.arxml`), 'utf-8');
}

describe('parseDemoBswmds', () => {
  it('parses all 5 demo-ecu BSWMDs into a ReadonlyMap keyed by module shortName', () => {
    const input = new Map<string, string>([
      ['Com', loadDemoBswmd('Com')],
      ['CanIf', loadDemoBswmd('CanIf')],
      ['ComM', loadDemoBswmd('ComM')],
      ['EcuC', loadDemoBswmd('EcuC')],
      ['PduR', loadDemoBswmd('PduR')],
    ]);
    const result = parseDemoBswmds(input);
    expect(result.size).toBe(5);
    expect(result.has('Com')).toBe(true);
    expect(result.has('CanIf')).toBe(true);
    expect(result.has('ComM')).toBe(true);
    expect(result.has('EcuC')).toBe(true);
    expect(result.has('PduR')).toBe(true);
  });

  it('parses all 6 demo-ecu BSWMDs including the new Dcm module', () => {
    const input = new Map<string, string>([
      ['Com', loadDemoBswmd('Com')],
      ['CanIf', loadDemoBswmd('CanIf')],
      ['ComM', loadDemoBswmd('ComM')],
      ['EcuC', loadDemoBswmd('EcuC')],
      ['PduR', loadDemoBswmd('PduR')],
      [DCM_MODULE_SHORT_NAME, loadDemoBswmd(DCM_MODULE_SHORT_NAME)],
    ]);
    const result = parseDemoBswmds(input);
    expect(result.size).toBe(6);
    expect(result.has(DCM_MODULE_SHORT_NAME)).toBe(true);
  });
});

describe('parseDemoBswmds — edge cases', () => {
  it('returns empty map for empty input', () => {
    expect(parseDemoBswmds(new Map()).size).toBe(0);
  });

  it('throws when ARXML string is malformed', () => {
    const input = new Map<string, string>([['Com', '<not-xml/>']]);
    expect(() => parseDemoBswmds(input)).toThrow(/Failed to parse BSWMD for module 'Com'/);
  });

  it('throws when BSWMD contains 0 ECUC-MODULE-DEFs', () => {
    // Construct an empty but well-formed ARXML that resolves to 0 modules.
    const emptyBswmd = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <AR-PACKAGES><AR-PACKAGE><SHORT-NAME>Empty</SHORT-NAME></AR-PACKAGE></AR-PACKAGES>
</AUTOSAR>`;
    const input = new Map<string, string>([['Com', emptyBswmd]]);
    expect(() => parseDemoBswmds(input)).toThrow(/expected exactly 1 ECUC-MODULE-DEF/);
  });
});
