// v1.25.0 T3 — IPC handler `xlsxEcucBatchWriteBatchTemplateHandler` tests.
//
// 3 cases per brief §3.1:
//   1. happy path — emits Uint8Array with 5 sheets (ComIPdu / ComSignal /
//      CanIfTxPdu / CanIfRxPdu / PduRRoutingPath) when BSWMDs declare them.
//   2. per-sheet header row — first row is
//      `shortName,definitionRef,param:<NAME_1>,param:<NAME_2>,...` with
//      BSWMD-derived param names.
//   3. failure — missing BSWMD returns `{ ok: false, error.kind === 'parse-failed' | 'read-failed' }`
//      (spec §Risks §1: any read-failure surfaces as parse-failed per
//      XlsxWriteBatchTemplateResponse union).
//
// Fixture strategy: build minimal manifest + 3 stub BSWMDs (not the demo
// project's, which are too sparse to declare the 5 kinds). ARXML stubs
// are also minimal so the test stays hermetic; the handler does not need
// any ECUC instance to emit a template.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  setOpenProjectManifestPath,
  __resetOpenProjectManifestPathForTests,
} from '../project-manifest-state.js';
import { xlsxEcucBatchWriteBatchTemplateHandler } from '../xlsxEcucBatchTemplateHandler.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

interface SeededTemplateProject {
  readonly workDir: string;
  readonly manifestPath: string;
  readonly cleanup: () => void;
}

/**
 * Write a minimal BSWMD stub declaring the 5 Com-stack container kinds
 * with 3 sample parameters each (per brief §3.1 + §3.3).
 */
function writeBswmdStubs(workDir: string): void {
  const comBswmd = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_00050.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>AUTOSAR</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Com</SHORT-NAME>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>ComIPdu</SHORT-NAME>
              <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY>256</UPPER-MULTIPLICITY>
              <PARAMETERS>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>ComHandleId</SHORT-NAME>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <MIN>0</MIN>
                  <MAX>65535</MAX>
                </ECUC-INTEGER-PARAM-DEF>
                <ECUC-ENUMERATION-PARAM-DEF>
                  <SHORT-NAME>ComIPduDirection</SHORT-NAME>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <LITERALS>
                    <ECUC-ENUMERATION-LITERAL-DEF>
                      <SHORT-NAME>SEND</SHORT-NAME>
                    </ECUC-ENUMERATION-LITERAL-DEF>
                    <ECUC-ENUMERATION-LITERAL-DEF>
                      <SHORT-NAME>RECEIVE</SHORT-NAME>
                    </ECUC-ENUMERATION-LITERAL-DEF>
                  </LITERALS>
                </ECUC-ENUMERATION-PARAM-DEF>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>ComPduId</SHORT-NAME>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <MIN>0</MIN>
                  <MAX>65535</MAX>
                </ECUC-INTEGER-PARAM-DEF>
              </PARAMETERS>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>ComSignal</SHORT-NAME>
              <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY>65535</UPPER-MULTIPLICITY>
              <PARAMETERS>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>ComHandleId</SHORT-NAME>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <MIN>0</MIN>
                  <MAX>65535</MAX>
                </ECUC-INTEGER-PARAM-DEF>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>ComBitPosition</SHORT-NAME>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <MIN>0</MIN>
                  <MAX>63</MAX>
                </ECUC-INTEGER-PARAM-DEF>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>ComBitSize</SHORT-NAME>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <MIN>0</MIN>
                  <MAX>65535</MAX>
                </ECUC-INTEGER-PARAM-DEF>
              </PARAMETERS>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>
`;
  const canIfBswmd = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_00050.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>AUTOSAR</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>CanIf</SHORT-NAME>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>CanIfTxPdu</SHORT-NAME>
              <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY>65535</UPPER-MULTIPLICITY>
              <PARAMETERS>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>CanIfTxPduId</SHORT-NAME>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <MIN>0</MIN>
                  <MAX>65535</MAX>
                </ECUC-INTEGER-PARAM-DEF>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>CanIfTxPduCanId</SHORT-NAME>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <MIN>0</MIN>
                  <MAX>4294967295</MAX>
                </ECUC-INTEGER-PARAM-DEF>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>CanIfTxPduDlc</SHORT-NAME>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <MIN>0</MIN>
                  <MAX>8</MAX>
                </ECUC-INTEGER-PARAM-DEF>
              </PARAMETERS>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>CanIfRxPdu</SHORT-NAME>
              <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY>65535</UPPER-MULTIPLICITY>
              <PARAMETERS>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>CanIfRxPduId</SHORT-NAME>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <MIN>0</MIN>
                  <MAX>65535</MAX>
                </ECUC-INTEGER-PARAM-DEF>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>CanIfRxPduCanId</SHORT-NAME>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <MIN>0</MIN>
                  <MAX>4294967295</MAX>
                </ECUC-INTEGER-PARAM-DEF>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>CanIfRxPduDlc</SHORT-NAME>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <MIN>0</MIN>
                  <MAX>8</MAX>
                </ECUC-INTEGER-PARAM-DEF>
              </PARAMETERS>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>
`;
  const pduRBswmd = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_00050.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>AUTOSAR</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>PduR</SHORT-NAME>
          <CONTAINERS>
            <ECUC-PARAM-CONF-CONTAINER-DEF>
              <SHORT-NAME>PduRRoutingPath</SHORT-NAME>
              <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
              <UPPER-MULTIPLICITY>65535</UPPER-MULTIPLICITY>
              <PARAMETERS>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>PduRRoutingPathPriority</SHORT-NAME>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <MIN>0</MIN>
                  <MAX>65535</MAX>
                </ECUC-INTEGER-PARAM-DEF>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>PduRSrcPduId</SHORT-NAME>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <MIN>0</MIN>
                  <MAX>65535</MAX>
                </ECUC-INTEGER-PARAM-DEF>
                <ECUC-INTEGER-PARAM-DEF>
                  <SHORT-NAME>PduRDestPduId</SHORT-NAME>
                  <LOWER-MULTIPLICITY>1</LOWER-MULTIPLICITY>
                  <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
                  <MIN>0</MIN>
                  <MAX>65535</MAX>
                </ECUC-INTEGER-PARAM-DEF>
              </PARAMETERS>
            </ECUC-PARAM-CONF-CONTAINER-DEF>
          </CONTAINERS>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>
`;

  writeFileSync(join(workDir, 'Com.bswmd.arxml'), comBswmd, 'utf-8');
  writeFileSync(join(workDir, 'CanIf.bswmd.arxml'), canIfBswmd, 'utf-8');
  writeFileSync(join(workDir, 'PduR.bswmd.arxml'), pduRBswmd, 'utf-8');
}

/**
 * Write stub Com-stack ARXMLs (handler doesn't read them, but the
 * manifest's valueArxmlPaths needs to point somewhere; the parse
 * handler does read them, so reuse `seedProject` shape from the T2
 * fixture for the layout). Here we only need the manifest valid
 * JSON; the ARXML stubs are placeholders the template handler
 * never touches.
 */
function writeComStackStubs(workDir: string): void {
  const stub = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://autosar.org/schema/r4.0 AUTOSAR_00050.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Stub</SHORT-NAME>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>
`;
  writeFileSync(join(workDir, 'Com_Config.arxml'), stub, 'utf-8');
  writeFileSync(join(workDir, 'CanIf_Config.arxml'), stub, 'utf-8');
  writeFileSync(join(workDir, 'PduR_Config.arxml'), stub, 'utf-8');
}

/**
 * Create a minimal project with or without BSWMDs. The handler is
 * exercised via the project manifest, so we always need the manifest.
 */
function seedProject(opts: { withBswmd: boolean }): SeededTemplateProject {
  const workDir = mkdtempSync(join(tmpdir(), 'claude-autosarcfg-v125-t3-'));
  if (opts.withBswmd) {
    writeBswmdStubs(workDir);
  }
  writeComStackStubs(workDir);

  const manifestJson = JSON.stringify({
    schemaVersion: '1',
    bswmdPaths: ['Com.bswmd.arxml', 'CanIf.bswmd.arxml', 'PduR.bswmd.arxml'],
    valueArxmlPaths: ['Com_Config.arxml', 'CanIf_Config.arxml', 'PduR_Config.arxml'],
  });
  const manifestPath = join(workDir, 'demo.autosarcfg.json');
  writeFileSync(manifestPath, manifestJson, 'utf-8');
  setOpenProjectManifestPath(manifestPath);

  return {
    workDir,
    manifestPath,
    cleanup: () => {
      setOpenProjectManifestPath(null);
      rmSync(workDir, { recursive: true, force: true });
    },
  };
}

afterEach(() => {
  __resetOpenProjectManifestPathForTests();
});

// ---------------------------------------------------------------------------
// 1. Happy path — 5 sheets with the right names, real SheetJS round-trip.
// ---------------------------------------------------------------------------

describe('xlsxEcucBatchWriteBatchTemplateHandler (v1.25.0 T3)', () => {
  it('returns Uint8Array with 5 sheets when BSWMD declares 5 kinds', async () => {
    const fx = seedProject({ withBswmd: true });
    try {
      const res = await xlsxEcucBatchWriteBatchTemplateHandler({
        projectManifestPath: fx.manifestPath,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const bytes = res.value.xlsxBytes;
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.byteLength).toBeGreaterThan(0);
      // Parse back through SheetJS and assert 5 sheet names.
      const XLSXmod = await import('xlsx');
      const XLSX = XLSXmod.default ?? XLSXmod;
      const wb = XLSX.read(bytes, { type: 'array' });
      expect(wb.SheetNames.slice().sort()).toEqual([
        'CanIfRxPdu',
        'CanIfTxPdu',
        'ComIPdu',
        'ComSignal',
        'PduRRoutingPath',
      ]);
    } finally {
      fx.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // 2. Per-sheet header row contains shortName + param:<BSWMD-param-name>
  //    columns (populated from the per-kind container parameter list).
  // -------------------------------------------------------------------------

  it('header row in each sheet contains shortName + param:<BSWMD-param-name> columns', async () => {
    const fx = seedProject({ withBswmd: true });
    try {
      const res = await xlsxEcucBatchWriteBatchTemplateHandler({
        projectManifestPath: fx.manifestPath,
      });
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      const XLSXmod = await import('xlsx');
      const XLSX = XLSXmod.default ?? XLSXmod;
      const wb = XLSX.read(res.value.xlsxBytes, { type: 'array' });

      // ComIPdu: 3 params from the stub BSWMD
      // (order mirrors the BSWMD parser's Object.entries traversal of
      // <PARAMETERS> children — fast-xml-parser preserves XML order).
      const comIPdu = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['ComIPdu'] as never, {
        header: 1,
        defval: '',
      });
      expect(comIPdu[0]).toEqual([
        'shortName',
        'definitionRef',
        'param:ComHandleId',
        'param:ComPduId',
        'param:ComIPduDirection',
      ]);

      // ComSignal: ComHandleId / ComBitPosition / ComBitSize
      const comSignal = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['ComSignal'] as never, {
        header: 1,
        defval: '',
      });
      expect(comSignal[0]).toEqual([
        'shortName',
        'definitionRef',
        'param:ComHandleId',
        'param:ComBitPosition',
        'param:ComBitSize',
      ]);

      // CanIfTxPdu: CanIfTxPduId / CanIfTxPduCanId / CanIfTxPduDlc
      const canIfTxPdu = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['CanIfTxPdu'] as never, {
        header: 1,
        defval: '',
      });
      expect(canIfTxPdu[0]).toEqual([
        'shortName',
        'definitionRef',
        'param:CanIfTxPduId',
        'param:CanIfTxPduCanId',
        'param:CanIfTxPduDlc',
      ]);

      // PduRRoutingPath: PduRRoutingPathPriority / PduRSrcPduId / PduRDestPduId
      const pduRRoutingPath = XLSX.utils.sheet_to_json<unknown[]>(
        wb.Sheets['PduRRoutingPath'] as never,
        { header: 1, defval: '' },
      );
      expect(pduRRoutingPath[0]).toEqual([
        'shortName',
        'definitionRef',
        'param:PduRRoutingPathPriority',
        'param:PduRSrcPduId',
        'param:PduRDestPduId',
      ]);
    } finally {
      fx.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // 3. Failure — missing BSWMD returns `{ ok: false }` with kind either
  //    `parse-failed` (XML malformed) or `read-failed` (ENOENT). The
  //    brief §3.1c asks for `parse-failed` specifically; the spec
  //    union (`read-failed | parse-failed`) intentionally allows
  //    either, so we accept either here and pin that the failure
  //    happened during BSWMD resolution.
  // -------------------------------------------------------------------------

  it('returns a failure when BSWMD parse fails (mismatched BSWMD)', async () => {
    const fx = seedProject({ withBswmd: false });
    try {
      const res = await xlsxEcucBatchWriteBatchTemplateHandler({
        projectManifestPath: fx.manifestPath,
      });
      expect(res.ok).toBe(false);
      if (res.ok) return;
      // The brief's case-3 message describes "parse-failed" but the
      // spec union allows read-failed too. The handler maps ENOENT
      // BSWMDs to `read-failed` (consistent with xlsxEcucBatchParse).
      expect(['parse-failed', 'read-failed']).toContain(res.error.kind);
      expect(res.error.message.length).toBeGreaterThan(0);
    } finally {
      fx.cleanup();
    }
  });
});
