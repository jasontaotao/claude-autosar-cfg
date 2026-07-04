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

  it('emits concrete DTC _258 with SHORT-NAME=DTC0A7D01 + DISPLAY-CODE=P0A7D01 + DTC-VALUE=687361', async () => {
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
      expect(demContent).toContain('<DISPLAY-CODE>P0A7D01</DISPLAY-CODE>');
      expect(demContent).toContain('<DTC-VALUE>687361</DTC-VALUE>');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
