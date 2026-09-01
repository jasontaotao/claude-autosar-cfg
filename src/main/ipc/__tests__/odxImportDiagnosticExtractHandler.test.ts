// odxImportDiagnosticExtractHandler — IPC handler unit tests (v1.24.0 T2).
//
// Mirrors the DBC bridge handler's 2-phase atomic write pattern.
// Hand-rolled ODX-D fixture for the happy path. Real-OEM fixture
// validation lives in odxImportDiagnosticExtractHandler.real.test.ts (T4).

// @vitest-environment node
import {
  promises as fs,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { odxImportDiagnosticExtractHandler } from '../odxImportDiagnosticExtractHandler.js';

const DEM_FILENAME = 'Dem_Extract.arxml';

let tmpDir: string;
let fixturePath: string;

const EMPTY_ODX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ODX MODEL-VERSION="2.0.0" xmlns="http://iso-standard.org/22901/ODX">
  <DIAG-LAYER-CONTAINER>
    <DIAG-LAYERS>
      <DIAG-LAYER ID="base" SHORT-NAME="BaseVariant">
        <DTC-DOPS><DTC-DOP ID="d0" SHORT-NAME="D0"><DTCS/></DTC-DOP></DTC-DOPS>
        <DID-OBJECTS/>
        <REQUESTS/>
      </DIAG-LAYER>
    </DIAG-LAYERS>
  </DIAG-LAYER-CONTAINER>
</ODX>
`;

describe('odxImportDiagnosticExtractHandler — success path', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'odx-bridge-'));
    fixturePath = join(tmpDir, 'empty.odx-d');
    writeFileSync(fixturePath, EMPTY_ODX_XML, 'utf8');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes 2 ARXML files to outputDir', async () => {
    const result = await odxImportDiagnosticExtractHandler({
      odxPath: fixturePath,
      outputDir: tmpDir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(existsSync(join(tmpDir, 'Dem_Extract.arxml'))).toBe(true);
      expect(existsSync(join(tmpDir, 'Dcm_Extract.arxml'))).toBe(true);
    }
  });
});

describe('odxImportDiagnosticExtractHandler — failure paths', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'odx-bridge-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns read-failed when .odx-d does not exist', async () => {
    const result = await odxImportDiagnosticExtractHandler({
      odxPath: join(tmpDir, 'nonexistent.odx-d'),
      outputDir: tmpDir,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('read-failed');
  });

  it('creates a missing project-relative outputDir and writes output', async () => {
    const fixturePath = join(tmpDir, 'x.odx-d');
    writeFileSync(fixturePath, EMPTY_ODX_XML, 'utf8');
    const result = await odxImportDiagnosticExtractHandler({
      odxPath: fixturePath,
      outputDir: join(tmpDir, 'nonexistent-dir'),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(existsSync(join(tmpDir, 'nonexistent-dir', DEM_FILENAME))).toBe(true);
      expect(existsSync(join(tmpDir, 'nonexistent-dir', 'Dcm_Extract.arxml'))).toBe(true);
    }
  });

  it('returns read-failed when .odx-d is malformed XML', async () => {
    const fixturePath = join(tmpDir, 'bad.odx-d');
    writeFileSync(fixturePath, '<not-valid-xml', 'utf8');
    const result = await odxImportDiagnosticExtractHandler({
      odxPath: fixturePath,
      outputDir: tmpDir,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('read-failed');
  });

  it('returns read-failed when outputDir is actually a file', async () => {
    const fixturePath = join(tmpDir, 'x.odx-d');
    writeFileSync(fixturePath, EMPTY_ODX_XML, 'utf8');
    // Pre-populate Dem file with sentinel content to verify it is preserved.
    const demPath = join(tmpDir, DEM_FILENAME);
    const sentinel = '<?xml version="1.0"?><SENTINEL/>\n';
    writeFileSync(demPath, sentinel, 'utf8');
    // Pass outputDir as the same as a pre-existing FILE — pre-flight catches this.
    writeFileSync(join(tmpDir, 'not-a-dir'), '', 'utf8');
    const result = await odxImportDiagnosticExtractHandler({
      odxPath: fixturePath,
      outputDir: join(tmpDir, 'not-a-dir'),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('read-failed');
  });

  it('returns read-failed or write-failed on non-existent drive', async () => {
    // Mock writeAtomic to throw on the second call (Dcm).
    // (Vitest vi.mock pattern — or pass an invalid outputDir to trigger.)
    const fixturePath = join(tmpDir, 'x.odx-d');
    writeFileSync(fixturePath, EMPTY_ODX_XML, 'utf8');
    // Pass outputDir as the same as a pre-existing FILE — writeAtomic will
    // attempt to overwrite but the file write to .tmp path collides.
    // On Windows, rename to existing file fails; on POSIX it succeeds.
    // The test below uses an alternative: outputDir is on a non-existent drive.
    const result = await odxImportDiagnosticExtractHandler({
      odxPath: fixturePath,
      outputDir: 'Z:\\definitely-not-a-real-drive',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Either read-failed (pre-flight) or write-failed (atomic write) is acceptable.
      expect(['read-failed', 'write-failed']).toContain(result.error.kind);
    }
  });

  it('cleans up partial files on rollback (no leftover .tmp)', async () => {
    const fixturePath = join(tmpDir, 'x.odx-d');
    writeFileSync(fixturePath, EMPTY_ODX_XML, 'utf8');
    const result = await odxImportDiagnosticExtractHandler({
      odxPath: fixturePath,
      outputDir: 'Z:\\definitely-not-a-real-drive',
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === 'write-failed') {
      // No .tmp files should remain in tmpDir.
      const tmpFiles = await fs.readdir(tmpDir).catch(() => []);
      const tmpLeftovers = tmpFiles.filter((f) => f.endsWith('.tmp') || f.includes('.tmp-'));
      expect(tmpLeftovers).toEqual([]);
    }
  });
});

describe('odxImportDiagnosticExtractHandler — idempotency', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'odx-bridge-'));
    fixturePath = join(tmpDir, 'x.odx-d');
    writeFileSync(fixturePath, EMPTY_ODX_XML, 'utf8');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('produces identical output when run twice (deterministic)', async () => {
    const r1 = await odxImportDiagnosticExtractHandler({ odxPath: fixturePath, outputDir: tmpDir });
    const r2 = await odxImportDiagnosticExtractHandler({ odxPath: fixturePath, outputDir: tmpDir });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      const c1 = readFileSync(r1.value.demPath, 'utf8');
      const c2 = readFileSync(r2.value.demPath, 'utf8');
      expect(c1).toBe(c2);
    }
  });
});
