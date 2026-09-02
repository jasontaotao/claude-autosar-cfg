// odxToDiagnosticExtract — pure mapper unit tests (v1.24.0 T1).
//
// Tests pin the contract: given an OdxSummary, produce 2 standalone
// ARXML file contents (Dem + Dcm) WITHOUT any IO. The IPC handler
// (T2) writes the strings to disk; T1 stays pure for testability.

import { describe, it, expect } from 'vitest';

import type { BswModuleDef, ContainerDef, ParamDef } from '../../project/bswmd/types.js';
import type { OdxSummary } from '../../../shared/types.js';
import { odxToDiagnosticExtract } from '../odxToDiagnosticExtract.js';

function container(path: string, over: Partial<ContainerDef> = {}): ContainerDef {
  return {
    shortName: '',
    path,
    lowerMultiplicity: 0,
    upperMultiplicity: 'infinite',
    subContainers: [],
    parameters: [],
    references: [],
    choices: [],
    ...over,
  };
}

function intParam(shortName: string, path: string): ParamDef {
  return {
    shortName,
    path,
    kind: 'integer',
    defaultValue: null,
    minValue: null,
    maxValue: null,
    minLength: null,
    maxLength: null,
    enumerationLiterals: [],
  };
}

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
    // v1.27.2 PATCH — output switched from `<DCM-DSP-DID>` data-spec
    // elements to `<ECUC-CONTAINER-VALUE>` service-container instances
    // wrapped in `<ECUC-MODULE-CONFIGURATION-VALUES>`. Empty OdxSummary
    // still emits the module wrapper but no container-value children.
    expect(result.dcmContent).not.toContain('<ECUC-CONTAINER-VALUE>');
    expect(result.dcmContent).toContain('<ECUC-MODULE-CONFIGURATION-VALUES>');
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

  it('emits one DemDTC ECUC container per DTC', () => {
    const result = odxToDiagnosticExtract({ odx: sampleOdx });
    const matches = result.demContent.match(/<ECUC-CONTAINER-VALUE>/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it('emits DTC with SHORT-NAME + LONG-NAME + DemDtcValue', () => {
    const result = odxToDiagnosticExtract({ odx: sampleOdx });
    expect(result.demContent).toContain('<SHORT-NAME>DTC_EngineOverheat</SHORT-NAME>');
    expect(result.demContent).toContain(
      '<DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/AUTOSAR_R22/EcucDefs/Dem/DemConfigSet/DemDTC/DemDtcValue</DEFINITION-REF>',
    );
    expect(result.demContent).toContain('<VALUE>1193046</VALUE>');
  });

  it('parses 0x-prefixed legacy DTC values as hexadecimal', () => {
    const result = odxToDiagnosticExtract({ odx: sampleOdx });
    expect(result.demContent).toContain('<VALUE>7903932</VALUE>');
  });

  it('emits one ECUC-CONTAINER-VALUE per DID + one ECUC-CONTAINER-VALUE per Routine (v1.27.2 shape)', () => {
    const result = odxToDiagnosticExtract({ odx: sampleOdx });
    // v1.27.2 PATCH — switched from `<DCM-DSP-DID>` / `<DCM-DSP-ROUTINE>`
    // data-spec elements (1 each) to `<ECUC-CONTAINER-VALUE>` service-
    // container instances (1 each) wrapped in
    // `<ECUC-MODULE-CONFIGURATION-VALUES>`. The DID / Routine counts
    // are preserved; the element name changes.
    const containerMatches = result.dcmContent.match(/<ECUC-CONTAINER-VALUE>/g) ?? [];
    const containerRefMatches =
      result.dcmContent.match(/DEST="ECUC-PARAM-CONF-CONTAINER-DEF"/g) ?? [];
    expect(containerMatches.length).toBe(2);
    expect(containerRefMatches.length).toBe(2);
    // Module wrapper is present, anchored to the Dcm module shortName.
    expect(result.dcmContent).toContain('<ECUC-MODULE-CONFIGURATION-VALUES>');
    expect(result.dcmContent).toContain('<SHORT-NAME>Dcm</SHORT-NAME>');
  });

  it('emits XML-escaped LONG-NAME text when present', () => {
    const result = odxToDiagnosticExtract({ odx: sampleOdx });
    expect(result.demContent).toContain('<L-4 L="EN">Battery voltage &lt; 11V</L-4>');
  });

  it('does NOT emit TEXT block when text is empty', () => {
    const odxNoText: OdxSummary = {
      ...sampleOdx,
      dtcs: [{ id: 'D', shortName: 'D', troubleCode: '0x1', displayCode: '1', text: '' }],
    };
    const result = odxToDiagnosticExtract({ odx: odxNoText });
    expect(result.demContent).not.toContain('<LONG-NAME>');
  });

  it('preserves multi-byte UTF-8 in DTC text without entity-escape', () => {
    const odxCn: OdxSummary = {
      ...sampleOdx,
      dtcs: [{ id: 'D', shortName: 'D', troubleCode: '0x1', displayCode: '1', text: '电池SOC' }],
    };
    const result = odxToDiagnosticExtract({ odx: odxCn });
    expect(result.demContent).toContain('<L-4 L="EN">电池SOC</L-4>');
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

// (v1.24.x PATCH T2) — DID with optional DIAG-CODED-TYPE data.

const sampleOdxWithData: OdxSummary = {
  dtcCount: 0,
  didCount: 2,
  routineCount: 0,
  dtcs: [],
  dids: [
    {
      id: 'DID_001',
      shortName: 'DID_F186',
      data: { dataType: 'A_UINT32', encoding: 'NONE', bitLength: 16 },
    },
    {
      id: 'DID_002',
      shortName: 'DID_VIN',
      // No data — backward-compat (legacy hand-crafted fixtures).
    },
  ],
  routines: [],
};

describe('odxToDiagnosticExtract — DID data (v1.24.x PATCH)', () => {
  it('emits <DCM-DSP-DID-DATA> with all 3 fields when data has bitLength', () => {
    const result = odxToDiagnosticExtract({ odx: sampleOdxWithData });
    // v1.27.2 PATCH — indentation increased by 2 spaces because the
    // DCM-DSP-DID-DATA block is now nested inside an
    // ECUC-MODULE-CONFIGURATION-VALUES wrapper. The data fields
    // themselves are unchanged.
    expect(result.dcmContent).toContain(
      '<DCM-DSP-DID-DATA>\n          <DIAG-CODED-TYPE>A_UINT32</DIAG-CODED-TYPE>\n          <BASE-TYPE-ENCODING>NONE</BASE-TYPE-ENCODING>\n          <BIT-LENGTH>16</BIT-LENGTH>\n        </DCM-DSP-DID-DATA>',
    );
  });

  it('emits <DCM-DSP-DID-DATA> without <BIT-LENGTH> when data.bitLength is undefined', () => {
    const odxNoBitLength: OdxSummary = {
      ...sampleOdxWithData,
      dids: [
        { id: 'DID_X', shortName: 'DID_X', data: { dataType: 'A_ASCIISTRING', encoding: 'NONE' } },
      ],
    };
    const result = odxToDiagnosticExtract({ odx: odxNoBitLength });
    expect(result.dcmContent).toContain('<DIAG-CODED-TYPE>A_ASCIISTRING</DIAG-CODED-TYPE>');
    expect(result.dcmContent).toContain('<BASE-TYPE-ENCODING>NONE</BASE-TYPE-ENCODING>');
    expect(result.dcmContent).not.toContain('<BIT-LENGTH>');
  });

  it('does NOT emit <DCM-DSP-DID-DATA> block when data is undefined (backward-compat, v1.27.2 shape)', () => {
    // DID_002 in sampleOdxWithData has no data field.
    const result = odxToDiagnosticExtract({ odx: sampleOdxWithData });
    // v1.27.2 PATCH — the `<DCM-DSP-DID-DATA>` inner block is preserved
    // verbatim inside each `<ECUC-CONTAINER-VALUE>` of `<DcmDspDid>` type.
    // The forward-compat invariant: count `<DCM-DSP-DID-DATA>` blocks
    // (should be 1, only for DID_F186), and confirm DID_VIN's container
    // does NOT contain a data block.
    const matches = result.dcmContent.match(/<DCM-DSP-DID-DATA>/g) ?? [];
    expect(matches.length).toBe(1);
    // DID_VIN should still appear as an ECUC-CONTAINER-VALUE with just SHORT-NAME.
    expect(result.dcmContent).toContain('<SHORT-NAME>DID_VIN</SHORT-NAME>');
    // Anchor DID_VIN's own block: forbid a DCM-DSP-DID-DATA child inside it.
    const vinBlock = result.dcmContent
      .split('</ECUC-CONTAINER-VALUE>')
      .find((block) => block.includes('<SHORT-NAME>DID_VIN</SHORT-NAME>'));
    expect(vinBlock).toBeDefined();
    expect(vinBlock).not.toContain('<DCM-DSP-DID-DATA>');
  });
});

describe('odxToDiagnosticExtract — Dcm BSWMD definition refs', () => {
  it('emits full-path fallback definition refs for Dcm containers', () => {
    const result = odxToDiagnosticExtract({ odx: sampleOdx });
    expect(result.dcmContent).toContain(
      '<DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspDid</DEFINITION-REF>',
    );
    expect(result.dcmContent).not.toContain('DEST="DCM-DSP-DID"');
    expect(result.dcmContent).toContain(
      '<DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspRoutine</DEFINITION-REF>',
    );
    expect(result.dcmContent).toContain(
      '<DEFINITION-REF DEST="ECUC-MODULE-DEF">/AUTOSAR_R22/EcucDefs/Dcm</DEFINITION-REF>',
    );
  });

  it('emits DID and Routine identifier parameters with full definition paths', () => {
    const odxWithIds: OdxSummary = {
      ...sampleOdx,
      dids: [{ id: 'DID_001', shortName: 'DID_F186', identifier: 62342 }],
      routines: [{ id: 'REQ_ERASE', shortName: 'REQ_EraseMemory', identifier: 61184 }],
    };
    const result = odxToDiagnosticExtract({ odx: odxWithIds });
    expect(result.dcmContent).toContain(
      '<DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidIdentifier</DEFINITION-REF>',
    );
    expect(result.dcmContent).toContain('<VALUE>62342</VALUE>');
    expect(result.dcmContent).toContain(
      '<DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/AUTOSAR_R22/EcucDefs/Dcm/DcmConfigSet/DcmDsp/DcmDspRoutine/DcmDspRoutineIdentifier</DEFINITION-REF>',
    );
    expect(result.dcmContent).toContain('<VALUE>61184</VALUE>');
  });

  it('omits identifier parameters when identifiers are absent', () => {
    const result = odxToDiagnosticExtract({ odx: sampleOdx });
    expect(result.dcmContent).not.toContain('<ECUC-NUMERICAL-PARAM-VALUE>');
  });

  it('resolves refs from a threaded BSWMD instead of the fallback prefix', () => {
    const dcmDspDid = container('/AUTOSAR/Dcm/DcmConfigSet/DcmDsp/DcmDspDid', {
      shortName: 'DcmDspDid',
      parameters: [
        intParam(
          'DcmDspDidIdentifier',
          '/AUTOSAR/Dcm/DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidIdentifier',
        ),
      ],
    });
    const dcmDspRoutine = container('/AUTOSAR/Dcm/DcmConfigSet/DcmDsp/DcmDspRoutine', {
      shortName: 'DcmDspRoutine',
      parameters: [
        intParam(
          'DcmDspRoutineIdentifier',
          '/AUTOSAR/Dcm/DcmConfigSet/DcmDsp/DcmDspRoutine/DcmDspRoutineIdentifier',
        ),
      ],
    });
    const customRootDcmBswmd: BswModuleDef = {
      shortName: 'Dcm',
      path: '/AUTOSAR/Dcm',
      dialect: 'ecuc-module-def',
      moduleId: null,
      containers: [
        container('/AUTOSAR/Dcm/DcmConfigSet', {
          shortName: 'DcmConfigSet',
          subContainers: [
            container('/AUTOSAR/Dcm/DcmConfigSet/DcmDsp', {
              shortName: 'DcmDsp',
              subContainers: [dcmDspDid, dcmDspRoutine],
            }),
          ],
        }),
      ],
      providedEntries: [],
      lowerMultiplicity: 1,
      upperMultiplicity: 1,
    };
    const result = odxToDiagnosticExtract({
      odx: {
        ...sampleOdx,
        dids: [{ id: 'DID_001', shortName: 'DID_F186', identifier: 62342 }],
        routines: [{ id: 'REQ_ERASE', shortName: 'REQ_EraseMemory', identifier: 61184 }],
      },
      bswmds: new Map([['Dcm', customRootDcmBswmd]]),
    });
    expect(result.dcmContent).toContain('/AUTOSAR/Dcm/DcmConfigSet/DcmDsp/DcmDspDid');
    expect(result.dcmContent).toContain(
      '/AUTOSAR/Dcm/DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidIdentifier',
    );
    expect(result.dcmContent).not.toContain('/AUTOSAR_R22/EcucDefs/Dcm');
  });
});

describe('odxToDiagnosticExtract — Dem ECUC structure', () => {
  it('wraps DTC events in ECUC-MODULE-CONFIGURATION-VALUES', () => {
    const result = odxToDiagnosticExtract({ odx: sampleOdx });
    expect(result.demContent).toContain('<ECUC-MODULE-CONFIGURATION-VALUES>');
    expect(result.demContent).toContain(
      '<DEFINITION-REF DEST="ECUC-MODULE-DEF">/AUTOSAR_R22/EcucDefs/Dem</DEFINITION-REF>',
    );
    expect(result.demContent).not.toContain('<DEM-EVENT-PARAMETER>');
  });

  it('emits DemDTC containers with DemDtcValue numeric parameters', () => {
    const result = odxToDiagnosticExtract({ odx: sampleOdx });
    expect(result.demContent).toContain(
      '<DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/AUTOSAR_R22/EcucDefs/Dem/DemConfigSet/DemDTC</DEFINITION-REF>',
    );
    expect(result.demContent).toContain(
      '<DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/AUTOSAR_R22/EcucDefs/Dem/DemConfigSet/DemDTC/DemDtcValue</DEFINITION-REF>',
    );
    expect(result.demContent).toContain('<VALUE>1193046</VALUE>');
  });

  it('parses decimal TROUBLE-CODE values as decimal', () => {
    const odxDecimal: OdxSummary = {
      ...sampleOdx,
      dtcs: [{ id: 'D', shortName: 'DTC0A7D01', troubleCode: '687361', displayCode: 'P0A7D01', text: 'P0A7D01' }],
    };
    const result = odxToDiagnosticExtract({ odx: odxDecimal });
    expect(result.demContent).toContain('<VALUE>687361</VALUE>');
  });

  it('omits parameter values when TROUBLE-CODE is unparseable', () => {
    const odxBad: OdxSummary = {
      ...sampleOdx,
      dtcs: [{ id: 'D', shortName: 'D', troubleCode: '', displayCode: '', text: '' }],
    };
    const result = odxToDiagnosticExtract({ odx: odxBad });
    expect(result.demContent).not.toContain('<ECUC-NUMERICAL-PARAM-VALUE>');
  });

  it('preserves DTC text as LONG-NAME and omits it when empty', () => {
    const result = odxToDiagnosticExtract({ odx: sampleOdx });
    expect(result.demContent).toContain('<LONG-NAME>');
    const odxNoText: OdxSummary = {
      ...sampleOdx,
      dtcs: [{ id: 'D', shortName: 'D', troubleCode: '0x1', displayCode: '1', text: '' }],
    };
    const noTextResult = odxToDiagnosticExtract({ odx: odxNoText });
    expect(noTextResult.demContent).not.toContain('<LONG-NAME>');
  });
});
