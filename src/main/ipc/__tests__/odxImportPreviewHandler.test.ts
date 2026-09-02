// odxImportPreviewHandler — additive ODX full-import preview IPC tests.
// These cases focus on orchestration, error envelopes, target-module
// discovery and deterministic hashes. Real-OEM coverage is in the
// companion `.real.test.ts`.

// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { beforeEach, afterEach, describe, expect, it } from 'vitest';

import { serializeArxml } from '../../../core/arxml/serializer.js';
import type { ArxmlContainer, ArxmlModule, ArxmlPackage } from '../../../core/arxml/types.js';
import { odxImportPreviewHandler } from '../odxImportPreviewHandler.js';
import {
  __resetOpenProjectManifestPathForTests,
  setOpenProjectManifestPath,
} from '../project-manifest-state.js';

const MINIMAL_DCM_BSWMD = `<?xml version="1.0" encoding="UTF-8"?>
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
                </ECUC-PARAM-CONF-CONTAINER-DEF>
              </CONTAINERS>
            </ECUC-MODULE-DEF>
          </ELEMENTS>
        </AR-PACKAGE>
      </AR-PACKAGES>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

const MINIMAL_DEM_BSWMD = MINIMAL_DCM_BSWMD.replace(/>Dcm</g, '>Dem<').replace(
  '>DcmConfigSet<',
  '>DemConfigSet<',
);

const ODX_ONE_VARIANT = `<?xml version="1.0" encoding="UTF-8"?>
<ODX MODEL-VERSION="2.0.0" xmlns="http://iso-standard.org/22901/ODX">
  <DIAG-LAYER-CONTAINER>
    <BASE-VARIANT ID="base">
      <SHORT-NAME>Base</SHORT-NAME>
      <DTC-DOPS/>
      <DID-OBJECTS/>
      <REQUESTS/>
    </BASE-VARIANT>
  </DIAG-LAYER-CONTAINER>
</ODX>`;

const ODX_TWO_VARIANTS = ODX_ONE_VARIANT.replace(
  '<BASE-VARIANT ID="base">',
  '<BASE-VARIANT ID="base-a"><SHORT-NAME>A</SHORT-NAME><DTC-DOPS/><DID-OBJECTS/><REQUESTS/></BASE-VARIANT><BASE-VARIANT ID="base-b">',
);

let tmpDir: string;

function moduleDoc(moduleShortName: string, containerShortName: string): string {
  const module: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: moduleShortName,
    params: {},
    children: [],
    references: [],
  };
  const container: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: containerShortName,
    params: {},
    children: [],
  };
  const childModule: ArxmlModule = { ...module, children: [container] };
  const pkg: ArxmlPackage = {
    shortName: 'P',
    path: '/P',
    elements: [childModule],
  };
  const result = serializeArxml({
    path: moduleShortName,
    version: '4.4',
    packages: [pkg],
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function writeProject(options: { bswmds?: readonly string[]; values?: readonly string[] }): string {
  const bswmds = options.bswmds ?? [];
  const values = options.values ?? [];
  for (const [index, content] of bswmds.entries()) {
    writeFileSync(join(tmpDir, `Bswmd${index}.arxml`), content, 'utf8');
  }
  for (const [index, content] of values.entries()) {
    writeFileSync(join(tmpDir, `Values${index}.arxml`), content, 'utf8');
  }
  const manifest = {
    schemaVersion: '1',
    id: 'test-project',
    name: 'test',
    valueArxmlPaths: values.map((_, index) => `Values${index}.arxml`),
    bswmdPaths: bswmds.map((_, index) => `Bswmd${index}.arxml`),
    ecucSources: {},
    scripts: [],
  };
  const manifestPath = join(tmpDir, 'project.autosarcfg.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  setOpenProjectManifestPath(manifestPath);
  return manifestPath;
}

function writeOdx(content = ODX_ONE_VARIANT): string {
  const path = join(tmpDir, 'input.odx-d');
  writeFileSync(path, content, 'utf8');
  return path;
}

describe('odxImportPreviewHandler', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'odx-preview-'));
    __resetOpenProjectManifestPathForTests();
  });

  afterEach(() => {
    __resetOpenProjectManifestPathForTests();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns read-failed when no project is open', async () => {
    const result = await odxImportPreviewHandler({ odxPath: writeOdx(), dirtyDocPaths: [] });
    expect(result).toEqual({
      ok: false,
      error: { kind: 'read-failed', message: 'No project is open' },
    });
  });

  it('returns read-failed when the ODX file is missing', async () => {
    const manifestPath = writeProject({ bswmds: [MINIMAL_DCM_BSWMD, MINIMAL_DEM_BSWMD] });
    const result = await odxImportPreviewHandler({
      odxPath: join(tmpDir, 'missing.odx-d'),
      dirtyDocPaths: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('read-failed');
    expect(existsSync(manifestPath)).toBe(true);
  });

  it('returns odx-malformed for invalid XML', async () => {
    writeProject({ bswmds: [MINIMAL_DCM_BSWMD, MINIMAL_DEM_BSWMD] });
    const result = await odxImportPreviewHandler({
      odxPath: writeOdx('<not-valid-xml'),
      dirtyDocPaths: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('odx-malformed');
  });

  it('returns odx-too-large when the ODX exceeds the 32 MiB cap', async () => {
    writeProject({ bswmds: [MINIMAL_DCM_BSWMD, MINIMAL_DEM_BSWMD] });
    const odxPath = writeOdx();
    const size = 32 * 1024 * 1024 + 1;
    const sparse = Buffer.alloc(size, 0x20);
    writeFileSync(odxPath, sparse, 'latin1');
    const result = await odxImportPreviewHandler({ odxPath, dirtyDocPaths: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('odx-too-large');
  });

  it('returns odx-no-variant when the document has no importable layer', async () => {
    writeProject({ bswmds: [MINIMAL_DCM_BSWMD, MINIMAL_DEM_BSWMD] });
    const noVariant = ODX_ONE_VARIANT.replace(
      '<BASE-VARIANT ID="base">',
      '<PROTOCOL ID="base">',
    ).replace('</BASE-VARIANT>', '</PROTOCOL>');
    const result = await odxImportPreviewHandler({
      odxPath: writeOdx(noVariant),
      dirtyDocPaths: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('odx-no-variant');
  });

  it('returns variant selection data when multiple variants omit variantId', async () => {
    writeProject({ bswmds: [MINIMAL_DCM_BSWMD, MINIMAL_DEM_BSWMD] });
    const result = await odxImportPreviewHandler({
      odxPath: writeOdx(ODX_TWO_VARIANTS),
      dirtyDocPaths: [],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.variants).toEqual([
        { kind: 'BASE-VARIANT', odxId: 'base-a', shortName: 'A' },
        { kind: 'BASE-VARIANT', odxId: 'base-b', shortName: 'Base' },
      ]);
      expect(result.value.selectedVariant).toBeUndefined();
      expect(result.value.rows).toEqual([]);
      expect(result.value.previewHash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.value.stats).toEqual({
        services: 0,
        dids: 0,
        dtcs: 0,
        sessions: 0,
        securityLevels: 0,
      });
    }
  });

  it('returns odx-variant-not-found for an unknown explicit variant', async () => {
    writeProject({ bswmds: [MINIMAL_DCM_BSWMD, MINIMAL_DEM_BSWMD] });
    const result = await odxImportPreviewHandler({
      odxPath: writeOdx(ODX_TWO_VARIANTS),
      dirtyDocPaths: [],
      variantId: 'missing',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('odx-variant-not-found');
  });

  it('returns odx-bswmd-not-loaded when a required BSWMD is absent', async () => {
    writeProject({ bswmds: [MINIMAL_DCM_BSWMD] });
    const result = await odxImportPreviewHandler({ odxPath: writeOdx(), dirtyDocPaths: [] });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toMatchObject({ kind: 'odx-bswmd-not-loaded', module: 'Dem' });
  });

  it('blocks preview when an existing target module document is dirty', async () => {
    const dcmDoc = moduleDoc('Dcm', 'ManualContainer');
    writeProject({
      bswmds: [MINIMAL_DCM_BSWMD, MINIMAL_DEM_BSWMD],
      values: [dcmDoc],
    });
    const result = await odxImportPreviewHandler({
      odxPath: writeOdx(),
      dirtyDocPaths: [join(tmpDir, 'Values0.arxml')],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject({
        kind: 'odx-target-dirty',
        docPath: join(tmpDir, 'Values0.arxml'),
      });
    }
  });

  it('returns odx-module-ambiguous when the same module occurs in two documents', async () => {
    const dcmDoc = moduleDoc('Dcm', 'ManualContainer');
    writeProject({
      bswmds: [MINIMAL_DCM_BSWMD, MINIMAL_DEM_BSWMD],
      values: [dcmDoc, dcmDoc],
    });
    const result = await odxImportPreviewHandler({ odxPath: writeOdx(), dirtyDocPaths: [] });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toMatchObject({ kind: 'odx-module-ambiguous', module: 'Dcm' });
  });

  it('previews a fresh project deterministically without mutating it', async () => {
    writeProject({ bswmds: [MINIMAL_DCM_BSWMD, MINIMAL_DEM_BSWMD] });
    const odxPath = writeOdx();
    const first = await odxImportPreviewHandler({ odxPath, dirtyDocPaths: [] });
    const second = await odxImportPreviewHandler({ odxPath, dirtyDocPaths: [] });
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.selectedVariant).toEqual({
      kind: 'BASE-VARIANT',
      odxId: 'base',
      shortName: 'Base',
    });
    expect(first.value.targetModules).toEqual({
      dcm: { exists: false, dirty: false },
      dem: { exists: false, dirty: false },
    });
    expect(first.value.rows.length).toBeGreaterThan(0);
    expect(first.value.rows.every((row) => row.category === 'added')).toBe(true);
    expect(existsSync(join(tmpDir, '.autosarcfg'))).toBe(false);
  });

  it('ignores invalid provenance manifests as no-history', async () => {
    writeProject({ bswmds: [MINIMAL_DCM_BSWMD, MINIMAL_DEM_BSWMD] });
    const stateDir = join(tmpDir, '.autosarcfg');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, 'odx-import-manifest.json'), 'not-json', 'utf8');
    const result = await odxImportPreviewHandler({ odxPath: writeOdx(), dirtyDocPaths: [] });
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value.warnings.some((w) => w.code === 'odx-manifest-ignored')).toBe(true);
  });
});

describe('odxImportPreviewHandler — real fixture', () => {
  it('previews the bundled Vector CANdelaStudio ODX fixture', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'odx-preview-real-'));
    __resetOpenProjectManifestPathForTests();
    try {
      writeProject({
        bswmds: [MINIMAL_DCM_BSWMD, MINIMAL_DEM_BSWMD],
      });
      const result = await odxImportPreviewHandler({
        odxPath: resolve(process.cwd(), 'samples/odx/Demo_Cdd.odx-d'),
        dirtyDocPaths: [],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.stats).toEqual({
        services: 95,
        dids: 34,
        dtcs: 99,
        sessions: 3,
        securityLevels: 2,
      });
      expect(result.value.selectedVariant).toMatchObject({ kind: 'BASE-VARIANT' });
    } finally {
      __resetOpenProjectManifestPathForTests();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
