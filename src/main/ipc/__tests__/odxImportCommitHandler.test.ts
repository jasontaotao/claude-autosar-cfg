// odxImportCommitHandler — commit orchestration tests for ODX full import.
// The tests verify mismatch defense, manifest registration, module merge,
// and provenance persistence. Error envelope kinds mirror preview.

// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { serializeArxml } from '../../../core/arxml/serializer.js';
import type { ArxmlContainer, ArxmlModule, ArxmlPackage } from '../../../core/arxml/types.js';
import { odxImportCommitHandler } from '../odxImportCommitHandler.js';
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

const ODX = `<?xml version="1.0" encoding="UTF-8"?>
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
  const pkg: ArxmlPackage = {
    shortName: 'P',
    path: '/P',
    elements: [{ ...module, children: [container] }],
  };
  const result = serializeArxml({ path: moduleShortName, version: '4.4', packages: [pkg] });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function writeProject(options: { values?: readonly string[] } = {}): string {
  const values = options.values ?? [];
  const bswmds = [MINIMAL_DCM_BSWMD, MINIMAL_DEM_BSWMD];
  for (const [index, content] of bswmds.entries()) {
    writeFileSync(join(tmpDir, `Bswmd${index}.arxml`), content, 'utf8');
  }
  for (const [index, content] of values.entries()) {
    writeFileSync(join(tmpDir, `Values${index}.arxml`), content, 'utf8');
  }
  const manifest = {
    schemaVersion: '1',
    id: 'commit-project',
    name: 'commit',
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

function writeOdx(): string {
  const path = join(tmpDir, 'input.odx-d');
  writeFileSync(path, ODX, 'utf8');
  return path;
}

async function preview() {
  const result = await odxImportPreviewHandler({ odxPath: writeOdx(), dirtyDocPaths: [] });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('preview failed');
  return result.value;
}

describe('odxImportCommitHandler', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'odx-commit-'));
    __resetOpenProjectManifestPathForTests();
  });

  afterEach(() => {
    __resetOpenProjectManifestPathForTests();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns read-failed when no project is open', async () => {
    __resetOpenProjectManifestPathForTests();
    const result = await odxImportCommitHandler({
      odxPath: writeOdx(),
      variantId: 'base',
      dirtyDocPaths: [],
      previewHash: '0'.repeat(64),
      decisions: [],
    });
    expect(result).toEqual({
      ok: false,
      error: { kind: 'read-failed', message: 'No project is open' },
    });
  });

  it('returns odx-commit-mismatch when the preview hash differs', async () => {
    writeProject();
    const result = await odxImportCommitHandler({
      odxPath: writeOdx(),
      variantId: 'base',
      dirtyDocPaths: [],
      previewHash: '0'.repeat(64),
      decisions: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('odx-commit-mismatch');
    expect(existsSync(join(tmpDir, 'ecuc'))).toBe(false);
    expect(existsSync(join(tmpDir, '.autosarcfg'))).toBe(false);
  });

  it('blocks commit when an existing target is dirty', async () => {
    writeProject({ values: [moduleDoc('Dcm', 'ManualContainer')] });
    const result = await odxImportCommitHandler({
      odxPath: writeOdx(),
      variantId: 'base',
      dirtyDocPaths: [join(tmpDir, 'Values0.arxml')],
      previewHash: '0'.repeat(64),
      decisions: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('odx-target-dirty');
    expect(readFileSync(join(tmpDir, 'Values0.arxml'), 'utf8')).toContain('ManualContainer');
  });

  it('creates missing modules, updates the manifest, and writes provenance', async () => {
    writeProject();
    const value = await preview();
    const decisions = value.rows.map((row) => ({ path: row.path, decision: 'import' as const }));
    const result = await odxImportCommitHandler({
      odxPath: writeOdx(),
      variantId: value.selectedVariant?.odxId ?? 'base',
      dirtyDocPaths: [],
      previewHash: value.previewHash,
      decisions,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.applied).toBe(decisions.length);
    expect(result.value.kept).toBe(0);
    expect(result.value.deleted).toBe(0);
    expect(result.value.manifestPath).toBe(join(tmpDir, '.autosarcfg', 'odx-import-manifest.json'));
    expect(existsSync(join(tmpDir, 'ecuc', 'Dcm_EcucValues.arxml'))).toBe(true);
    expect(existsSync(join(tmpDir, 'ecuc', 'Dem_EcucValues.arxml'))).toBe(true);

    const manifest = JSON.parse(readFileSync(join(tmpDir, 'project.autosarcfg.json'), 'utf8'));
    expect(manifest.valueArxmlPaths).toContain('ecuc/Dcm_EcucValues.arxml');
    expect(manifest.valueArxmlPaths).toContain('ecuc/Dem_EcucValues.arxml');
    const provenance = JSON.parse(readFileSync(result.value.manifestPath, 'utf8'));
    expect(provenance.version).toBe(1);
    expect(provenance.variant.odxId).toBe('base');
    expect(provenance.entries.length).toBeGreaterThan(0);
  });

  it('imports into existing modules while preserving manual containers', async () => {
    writeProject({
      values: [moduleDoc('Dcm', 'ManualContainer'), moduleDoc('Dem', 'ManualDemContainer')],
    });
    const value = await preview();
    const decisions = value.rows.map((row) => ({ path: row.path, decision: 'import' as const }));
    const result = await odxImportCommitHandler({
      odxPath: writeOdx(),
      variantId: value.selectedVariant?.odxId ?? 'base',
      dirtyDocPaths: [],
      previewHash: value.previewHash,
      decisions,
    });
    expect(result.ok).toBe(true);
    const dcm = readFileSync(join(tmpDir, 'Values0.arxml'), 'utf8');
    const dem = readFileSync(join(tmpDir, 'Values1.arxml'), 'utf8');
    expect(dcm).toContain('ManualContainer');
    expect(dcm).toContain('DcmConfigSet');
    expect(dem).toContain('ManualDemContainer');
    expect(dem).toContain('DemConfigSet');
  });

  it('counts explicit keep-local and delete decisions', async () => {
    writeProject();
    const value = await preview();
    const decisions = value.rows.slice(0, 3).map((row, index) => ({
      path: row.path,
      decision:
        index === 0
          ? ('import' as const)
          : index === 1
            ? ('keep-local' as const)
            : ('delete' as const),
    }));
    const result = await odxImportCommitHandler({
      odxPath: writeOdx(),
      variantId: value.selectedVariant?.odxId ?? 'base',
      dirtyDocPaths: [],
      previewHash: value.previewHash,
      decisions,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.applied).toBe(1);
    expect(result.value.kept).toBe(1);
    expect(result.value.deleted).toBe(1);
  });
});
