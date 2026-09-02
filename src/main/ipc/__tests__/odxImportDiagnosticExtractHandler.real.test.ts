// odxImportDiagnosticExtractHandler — real-OEM fixture validation (v1.24.0 T4).
//
// SHIP-BLOCKING. Uses samples/odx/Demo_Cdd.odx-d (Vector CANdelaStudio
// export, 897 KB) to validate the end-to-end bridge pipeline.
//
// Expected counts come from v1.22.0 T4's validation against the same
// file. Concrete DTC _258 values come from v1.22.0 T4's regression
// test. If this test fails, fix the mapper/handler — NOT the test.

// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

import { odxImportDiagnosticExtractHandler } from '../odxImportDiagnosticExtractHandler.js';

const FIXTURE_PATH = resolve(process.cwd(), 'samples/odx/Demo_Cdd.odx-d');

const NESTED_DCM_BSWMD = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>AUTOSAR</SHORT-NAME>
      <AR-PACKAGES>
        <AR-PACKAGE>
          <SHORT-NAME>Custom</SHORT-NAME>
          <ELEMENTS>
                <ECUC-MODULE-DEF>
                  <SHORT-NAME>Dcm</SHORT-NAME>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <CONTAINERS>
                    <ECUC-PARAM-CONF-CONTAINER-DEF>
                      <SHORT-NAME>DcmConfigSet</SHORT-NAME>
                      <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                      <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                      <CONTAINERS>
                        <ECUC-PARAM-CONF-CONTAINER-DEF>
                          <SHORT-NAME>DcmDsp</SHORT-NAME>
                          <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                          <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                          <CONTAINERS>
                            <ECUC-PARAM-CONF-CONTAINER-DEF>
                              <SHORT-NAME>DcmDspDid</SHORT-NAME>
                              <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                              <UPPER-MULTIPLICITY>65535</UPPER-MULTIPLICITY>
                              <PARAMETERS>
                                <ECUC-INTEGER-PARAM-DEF>
                                  <SHORT-NAME>DcmDspDidIdentifier</SHORT-NAME>
                                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                                </ECUC-INTEGER-PARAM-DEF>
                              </PARAMETERS>
                            </ECUC-PARAM-CONF-CONTAINER-DEF>
                            <ECUC-PARAM-CONF-CONTAINER-DEF>
                              <SHORT-NAME>DcmDspRoutine</SHORT-NAME>
                              <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
                              <UPPER-MULTIPLICITY>65535</UPPER-MULTIPLICITY>
                              <PARAMETERS>
                                <ECUC-INTEGER-PARAM-DEF>
                                  <SHORT-NAME>DcmDspRoutineIdentifier</SHORT-NAME>
                                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                                </ECUC-INTEGER-PARAM-DEF>
                              </PARAMETERS>
                            </ECUC-PARAM-CONF-CONTAINER-DEF>
                          </CONTAINERS>
                        </ECUC-PARAM-CONF-CONTAINER-DEF>
                      </CONTAINERS>
                    </ECUC-PARAM-CONF-CONTAINER-DEF>
                  </CONTAINERS>
                </ECUC-MODULE-DEF>
          </ELEMENTS>
        </AR-PACKAGE>
      </AR-PACKAGES>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

describe('odxImportDiagnosticExtractHandler — real-OEM fixture (v1.24.0 T4)', () => {
  it('produces 99 DemEvents / 4 DcmRoutines / 34 DcmDids from Demo_Cdd.odx-d', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'odx-bridge-real-'));
    try {
      const result = await odxImportDiagnosticExtractHandler({
        odxPath: FIXTURE_PATH,
        outputDir: tmpDir,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Counts (per v1.22.0 T4).
      expect(result.value.stats).toEqual({
        dtcCount: 99,
        didCount: 34,
        routineCount: 4,
      });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('threads bswmdDir into the mapper and preserves fallback output without it', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'odx-bridge-real-'));
    const bswmdDir = join(tmpDir, 'bswmd');
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(bswmdDir, { recursive: true });
    writeFileSync(join(bswmdDir, 'Dcm.bswmd.arxml'), NESTED_DCM_BSWMD, 'utf8');
    try {
      const withoutBswmds = await odxImportDiagnosticExtractHandler({
        odxPath: FIXTURE_PATH,
        outputDir: tmpDir,
      });
      expect(withoutBswmds.ok).toBe(true);
      if (!withoutBswmds.ok) return;
      const { readFileSync } = await import('node:fs');
      const fallback = readFileSync(withoutBswmds.value.dcmPath, 'utf8');
      expect(fallback).toContain('/AUTOSAR_R22/EcucDefs/Dcm');

      const withBswmds = await odxImportDiagnosticExtractHandler({
        odxPath: FIXTURE_PATH,
        outputDir: tmpDir,
        bswmdDir,
      });
      expect(withBswmds.ok).toBe(true);
      if (!withBswmds.ok) return;
      const resolved = readFileSync(withBswmds.value.dcmPath, 'utf8');
      expect(resolved).toContain('/AUTOSAR/Custom/Dcm/DcmConfigSet/DcmDsp/DcmDspDid');
      expect(resolved).toContain('/AUTOSAR/Custom/Dcm/DcmConfigSet/DcmDsp/DcmDspDid/DcmDspDidIdentifier');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('emits concrete DTC _258 in standard DemDTC ECUC form', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'odx-bridge-real-'));
    try {
      const result = await odxImportDiagnosticExtractHandler({
        odxPath: FIXTURE_PATH,
        outputDir: tmpDir,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const { readFileSync } = await import('node:fs');
      const demContent = readFileSync(result.value.demPath, 'utf8');
      expect(demContent).toContain('<SHORT-NAME>DTC0A7D01</SHORT-NAME>');
      expect(demContent).toContain(
        '<DEFINITION-REF DEST="ECUC-INTEGER-PARAM-DEF">/AUTOSAR_R22/EcucDefs/Dem/DemConfigSet/DemDTC/DemDtcValue</DEFINITION-REF>',
      );
      expect(demContent).toContain('<VALUE>687361</VALUE>');
      expect(demContent).toMatch(/<L-4 L="EN">P0A7D01/);
      expect(demContent).not.toContain('<DEM-EVENT-PARAMETER>');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// v1.24.x PATCH — T3 real-OEM DID data regression (SHIP-BLOCKING).
// Pins concrete <DCM-DSP-DID-DATA> output against the real
// Vector CANdelaStudio export (samples/odx/Demo_Cdd.odx-d). All
// 34 0x22 REQUESTs have a DID-value PARAM whose <DIAG-CODED-TYPE>
// has BASE-DATA-TYPE=A_UINT32 + BIT-LENGTH=16, with no explicit
// BASE-TYPE-ENCODING (the mapper emits 'NONE' as default).
// Pre-flight confirmed: RQ_CellVolt_JG_Read (DID 258, REQUEST ID
// _444, lines 10137-10180 in Demo_Cdd.odx-d).
describe('odxImportDiagnosticExtractHandler — v1.24.x PATCH DID data (T3 real-OEM)', () => {
  it('emits <DCM-DSP-DID-DATA> for all 34 DIDs from Demo_Cdd.odx-d', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'odx-bridge-real-'));
    try {
      const result = await odxImportDiagnosticExtractHandler({
        odxPath: FIXTURE_PATH,
        outputDir: tmpDir,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const { readFileSync } = await import('node:fs');
      const dcmContent = readFileSync(result.value.dcmPath, 'utf8');
      // One <DCM-DSP-DID-DATA> block per DID with data.
      const matches = dcmContent.match(/<DCM-DSP-DID-DATA>/g) ?? [];
      expect(matches.length).toBe(result.value.stats.didCount);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('pins concrete DIAG-CODED-TYPE for RQ_CellVolt_JG_Read (DID 258) from Demo_Cdd.odx-d', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'odx-bridge-real-'));
    try {
      const result = await odxImportDiagnosticExtractHandler({
        odxPath: FIXTURE_PATH,
        outputDir: tmpDir,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const { readFileSync } = await import('node:fs');
      const dcmContent = readFileSync(result.value.dcmPath, 'utf8');
      // Concrete pre-flight values (Demo_Cdd.odx-d lines 10142-10180):
      //   REQUEST SHORT-NAME     = RQ_CellVolt_JG_Read
      //   DID-value PARAM        = SEMANTIC=ID, CODED-VALUE=258, BYTE-POSITION=1
      //   DIAG-CODED-TYPE        = BASE-DATA-TYPE=A_UINT32 (xsi:type=STANDARD-LENGTH-TYPE)
      //                            BIT-LENGTH=16, no explicit BASE-TYPE-ENCODING
      //                            (mapper default 'NONE' is emitted).
      expect(dcmContent).toContain('<SHORT-NAME>RQ_CellVolt_JG_Read</SHORT-NAME>');
      expect(dcmContent).toContain('<DIAG-CODED-TYPE>A_UINT32</DIAG-CODED-TYPE>');
      expect(dcmContent).toContain('<BASE-TYPE-ENCODING>NONE</BASE-TYPE-ENCODING>');
      expect(dcmContent).toContain('<BIT-LENGTH>16</BIT-LENGTH>');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
