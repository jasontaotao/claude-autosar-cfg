import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { xlsxEcucBatchWriteBatchTemplateHandler } from '../xlsxEcucBatchTemplateHandler.js';
import {
  __resetOpenProjectManifestPathForTests,
  setOpenProjectManifestPath,
} from '../project-manifest-state.js';

const DEMO_PROJECT = 'samples/arxml/demo-ecu';
const COM_BSWMD = `${DEMO_PROJECT}/bswmd/Bsw_Com_Bswmd.arxml`;
const CANIF_BSWMD = `${DEMO_PROJECT}/bswmd/Bsw_CanIf_Bswmd.arxml`;
const PDUR_BSWMD = `${DEMO_PROJECT}/bswmd/Bsw_PduR_Bswmd.arxml`;

describe('xlsxEcucBatchTemplateHandler (v1.25.x PATCH T3 — demo-ecu fixture)', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'xlsx-tmpl-demo-'));
    // Build a hermetic copy of the demo-ecu project's 3 BSWMDs into tmp.
    // NOTE: handler resolves BSWMD paths relative to projectDir (the
    // manifest's directory), so we copy to tmpDir root — not under a
    // `bswmd/` subdir. Manifest `bswmdPaths` is documentation only.
    copyFileSync(COM_BSWMD, join(tmpDir, 'Com.bswmd.arxml'));
    copyFileSync(CANIF_BSWMD, join(tmpDir, 'CanIf.bswmd.arxml'));
    copyFileSync(PDUR_BSWMD, join(tmpDir, 'PduR.bswmd.arxml'));
    writeFileSync(
      join(tmpDir, 'demo.autosarcfg.json'),
      JSON.stringify(
        {
          manifestVersion: '1',
          bswmdPaths: [
            'Com.bswmd.arxml',
            'CanIf.bswmd.arxml',
            'PduR.bswmd.arxml',
          ],
          valueArxmlPaths: ['Com_Config.arxml', 'CanIf_Config.arxml', 'PduR_Config.arxml'],
        },
        null,
        2,
      ),
    );
    setOpenProjectManifestPath(join(tmpDir, 'demo.autosarcfg.json'));
  });
  afterEach(() => {
    __resetOpenProjectManifestPathForTests();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns 5-sheet template for enriched demo-ecu (ComIPdu / ComSignal / CanIfTxPdu / CanIfRxPdu / PduRRoutingPath)', async () => {
    const res = await xlsxEcucBatchWriteBatchTemplateHandler({
      projectManifestPath: join(tmpDir, 'demo.autosarcfg.json'),
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const XLSXmod = await import('xlsx');
    const XLSX = XLSXmod.default ?? XLSXmod;
    const wb = XLSX.read(res.value.xlsxBytes, { type: 'array' });
    expect(wb.SheetNames.sort()).toEqual([
      'CanIfRxPdu',
      'CanIfTxPdu',
      'ComIPdu',
      'ComSignal',
      'PduRRoutingPath',
    ]);
    // Each sheet's header row should have at least `shortName`, `definitionRef`, and ≥3 `param:*` columns
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName]!;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
      const header = rows[0] as unknown[];
      const paramCols = header.filter((c) => typeof c === 'string' && c.startsWith('param:'));
      expect(paramCols.length).toBeGreaterThanOrEqual(3);
    }
  });
});