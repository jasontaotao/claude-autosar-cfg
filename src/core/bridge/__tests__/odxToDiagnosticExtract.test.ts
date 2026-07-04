// odxToDiagnosticExtract — pure mapper unit tests (v1.24.0 T1).
//
// Tests pin the contract: given an OdxSummary, produce 2 standalone
// ARXML file contents (Dem + Dcm) WITHOUT any IO. The IPC handler
// (T2) writes the strings to disk; T1 stays pure for testability.

import { describe, it, expect } from 'vitest';

import type { OdxSummary } from '../../../shared/types.js';
import { odxToDiagnosticExtract } from '../odxToDiagnosticExtract.js';

const emptyOdx: OdxSummary = {
  dtcCount: 0,
  didCount: 0,
  routineCount: 0,
  dtcs: [],
  dids: [],
  routines: [],
};

describe('odxToDiagnosticExtract — empty OdxSummary', () => {
  it('returns 0-count stats', () => {
    const result = odxToDiagnosticExtract({ odx: emptyOdx });
    expect(result.stats).toEqual({ dtcCount: 0, didCount: 0, routineCount: 0 });
  });

  it('returns demContent with empty ELEMENTS block', () => {
    const result = odxToDiagnosticExtract({ odx: emptyOdx });
    expect(result.demContent).toContain('<ELEMENTS>');
    expect(result.demContent).toContain('</ELEMENTS>');
    expect(result.demContent).not.toContain('<DEM-EVENT-PARAMETER>');
  });

  it('returns dcmContent with empty ELEMENTS block', () => {
    const result = odxToDiagnosticExtract({ odx: emptyOdx });
    expect(result.dcmContent).toContain('<ELEMENTS>');
    expect(result.dcmContent).toContain('</ELEMENTS>');
    expect(result.dcmContent).not.toContain('<DCM-DSP-DID>');
    expect(result.dcmContent).not.toContain('<DCM-DSP-ROUTINE>');
  });
});

const sampleOdx: OdxSummary = {
  dtcCount: 2,
  didCount: 1,
  routineCount: 1,
  dtcs: [
    {
      id: 'DTC_001',
      shortName: 'DTC_EngineOverheat',
      troubleCode: '0x123456',
      displayCode: '123456',
      text: 'Engine coolant temperature too high',
    },
    {
      id: 'DTC_002',
      shortName: 'DTC_BatteryLow',
      troubleCode: '0x789ABC',
      displayCode: '',
      text: 'Battery voltage < 11V',
    },
  ],
  dids: [{ id: 'DID_VIN', shortName: 'DID_VehicleId' }],
  routines: [{ id: 'REQ_ERASE', shortName: 'REQ_EraseMemory' }],
};

describe('odxToDiagnosticExtract — populated OdxSummary', () => {
  it('returns correct counts', () => {
    const result = odxToDiagnosticExtract({ odx: sampleOdx });
    expect(result.stats).toEqual({ dtcCount: 2, didCount: 1, routineCount: 1 });
  });

  it('emits one DEM-EVENT-PARAMETER per DTC', () => {
    const result = odxToDiagnosticExtract({ odx: sampleOdx });
    const matches = result.demContent.match(/<DEM-EVENT-PARAMETER>/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it('emits DTC with SHORT-NAME + EVENT-KIND + DISPLAY-CODE + DTC-VALUE', () => {
    const result = odxToDiagnosticExtract({ odx: sampleOdx });
    expect(result.demContent).toContain('<SHORT-NAME>DTC_EngineOverheat</SHORT-NAME>');
    expect(result.demContent).toContain('<EVENT-KIND>DEM_EVENT_KIND_SWC</EVENT-KIND>');
    expect(result.demContent).toContain('<DISPLAY-CODE>123456</DISPLAY-CODE>');
    expect(result.demContent).toContain('<DTC-VALUE>0x123456</DTC-VALUE>');
  });

  it('falls back to troubleCode when displayCode is empty', () => {
    const result = odxToDiagnosticExtract({ odx: sampleOdx });
    // DTC_002 has displayCode=''; should use troubleCode 0x789ABC
    expect(result.demContent).toContain('<DISPLAY-CODE>0x789ABC</DISPLAY-CODE>');
  });

  it('emits one DCM-DSP-DID per DID + one DCM-DSP-ROUTINE per Routine', () => {
    const result = odxToDiagnosticExtract({ odx: sampleOdx });
    const didMatches = result.dcmContent.match(/<DCM-DSP-DID>/g) ?? [];
    const routineMatches = result.dcmContent.match(/<DCM-DSP-ROUTINE>/g) ?? [];
    expect(didMatches.length).toBe(1);
    expect(routineMatches.length).toBe(1);
  });

  it('emits XML-escaped TEXT when present', () => {
    const result = odxToDiagnosticExtract({ odx: sampleOdx });
    expect(result.demContent).toContain('<TEXT>Battery voltage &lt; 11V</TEXT>');
  });

  it('does NOT emit TEXT block when text is empty', () => {
    const odxNoText: OdxSummary = {
      ...sampleOdx,
      dtcs: [{ id: 'D', shortName: 'D', troubleCode: '0x1', displayCode: '1', text: '' }],
    };
    const result = odxToDiagnosticExtract({ odx: odxNoText });
    expect(result.demContent).not.toContain('<TEXT>');
  });

  it('preserves multi-byte UTF-8 in DTC text without entity-escape', () => {
    const odxCn: OdxSummary = {
      ...sampleOdx,
      dtcs: [{ id: 'D', shortName: 'D', troubleCode: '0x1', displayCode: '1', text: '电池SOC' }],
    };
    const result = odxToDiagnosticExtract({ odx: odxCn });
    expect(result.demContent).toContain('<TEXT>电池SOC</TEXT>');
  });

  it('emits XML-escaped special chars in SHORT-NAME', () => {
    const odxSpecial: OdxSummary = {
      ...sampleOdx,
      dtcs: [
        {
          id: 'D',
          shortName: 'DTC<test>&"\'',
          troubleCode: '0x1',
          displayCode: '1',
          text: '',
        },
      ],
    };
    const result = odxToDiagnosticExtract({ odx: odxSpecial });
    expect(result.demContent).toContain(
      '<SHORT-NAME>DTC&lt;test&gt;&amp;&quot;&apos;</SHORT-NAME>',
    );
  });
});
