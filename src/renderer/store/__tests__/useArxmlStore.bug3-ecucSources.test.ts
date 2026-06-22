// @vitest-environment jsdom
//
// Bug 3 follow-up tests — `sourceBswmdPath` round-trip.
//
// User report (2026-06-22): "重新打开软件就又不行了，根本没有相关数值被记录下来".
// After restart the ProjectPanel chip-count always reads 0/N even though
// the user had created N ECUC docs from a BSWMD via the BSWMD-to-ECUC
// skeleton flow. Root cause: `sourceBswmdPath` was a TypeScript-only
// field on `ArxmlDocument` that the ARXML serialiser never wrote to
// disk and the parser never restored. The fix stores provenance in
// `ProjectManifest.ecucSources` (key: relative ECUC path; value:
// relative BSWMD path) and rehydrates `sourceBswmdPath` at every
// `openProject`.
//
// Test pins:
//   1. `loadManifest` / `saveManifest` round-trip preserves
//      `ecucSources`. Mirrors the existing scripts[] and path arrays.
//   2. `parseManifestShape` filters orphan entries: keys not in
//      `valueArxmlPaths` or values not in `bswmdPaths` are silently
//      dropped so a stale manifest from a renamed/removed BSWMD still
//      opens (strict per-entry rejection would brick existing projects).
//   3. `addDocumentWithSource` writes the (ecucRel, bswmdRel) pair to
//      `project.ecucSources` so the manifest stays consistent with the
//      in-memory cache.
//   4. `openProject` hydrates `sourceBswmdPath` on each loaded doc
//      from `manifest.ecucSources` so the ProjectPanel chip reads N/N
//      after restart (pre-fix it read 0/N).
//   5. Legacy manifests without an `ecucSources` field still load
//      cleanly and the ECUC docs get `sourceBswmdPath = undefined`
//      (matches the pre-fix behaviour; no breakage on rollback).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadManifest, saveManifest } from '../../../core/project/manifest.js';
import type { ProjectManifest } from '../../../shared/project.js';
import { MANIFEST_SCHEMA_VERSION } from '../../../shared/project.js';
import { useArxmlStore } from '../useArxmlStore.js';

// Minimal round-trip manifest for the schema layer. BSWMDs and ECUCs
// reference one another through `ecucSources`.
function makeManifest(opts: {
  readonly ecucPaths?: readonly string[];
  readonly bswmdPaths?: readonly string[];
  readonly ecucSources?: Readonly<Record<string, string>>;
}): ProjectManifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    id: '00000000-0000-0000-0000-000000000000',
    name: 'Bug 3 sample',
    valueArxmlPaths: opts.ecucPaths ?? ['Can_EcucValues.arxml'],
    bswmdPaths: opts.bswmdPaths ?? ['Can_bswmd.arxml'],
    ecucSources: opts.ecucSources ?? {},
    scripts: [],
  };
}

// Minimal ECUC skeleton XML — 1 module named "Can" under a "Can"
// package. Parser is the production `parseArxml`; the result's
// `version` is whatever the XML declares. The exact namespace isn't
// load-bearing for Bug 3 (we only care about `sourceBswmdPath`).
const ECUC_SKELETON_XML = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Can</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES>
          <SHORT-NAME>Can</SHORT-NAME>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>
`;

const MINIMAL_BSWMD_XML = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>Can</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Can</SHORT-NAME>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>
`;

describe('Bug 3 — manifest.ecucSources round-trip', () => {
  it('loadManifest / saveManifest preserves ecucSources', () => {
    const original = makeManifest({
      ecucPaths: ['Can_EcucValues.arxml', 'CanIf_EcucValues.arxml'],
      bswmdPaths: ['Can_bswmd.arxml', 'CanIf_bswmd.arxml'],
      ecucSources: {
        'Can_EcucValues.arxml': 'Can_bswmd.arxml',
        'CanIf_EcucValues.arxml': 'CanIf_bswmd.arxml',
      },
    });
    const json = saveManifest(original);
    const result = loadManifest(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ecucSources).toEqual(original.ecucSources);
  });

  it('drops orphan ecucSources entries (key not in valueArxmlPaths)', () => {
    // User renamed Can_EcucValues.arxml → CanNew_EcucValues.arxml in
    // the manifest's valueArxmlPaths but forgot to update
    // ecucSources. The orphan entry must be dropped silently so the
    // manifest still opens (strict rejection would brick the project).
    const raw = {
      ...makeManifest({ ecucPaths: ['CanNew_EcucValues.arxml'] }),
      ecucSources: {
        'CanOld_EcucValues.arxml': 'Can_bswmd.arxml',
        'CanNew_EcucValues.arxml': 'Can_bswmd.arxml',
      },
    };
    const result = loadManifest(JSON.stringify(raw));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ecucSources).toEqual({
      'CanNew_EcucValues.arxml': 'Can_bswmd.arxml',
    });
  });

  it('drops orphan ecucSources entries (value not in bswmdPaths)', () => {
    const raw = {
      ...makeManifest({}),
      ecucSources: {
        'Can_EcucValues.arxml': 'Removed_bswmd.arxml',
      },
    };
    const result = loadManifest(JSON.stringify(raw));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ecucSources).toEqual({});
  });

  it('loads legacy manifests without ecucSources as {}', () => {
    // Pre-Bug-3 manifests have no ecucSources field at all. They must
    // still open cleanly; consumers guard with `?? {}` so the absence
    // is transparent downstream.
    const raw = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      id: '00000000-0000-0000-0000-000000000000',
      name: 'legacy',
      valueArxmlPaths: ['Can_EcucValues.arxml'],
      bswmdPaths: ['Can_bswmd.arxml'],
      scripts: [],
    };
    const result = loadManifest(JSON.stringify(raw));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ecucSources).toEqual({});
  });

  it('rejects malformed ecucSources (non-object)', () => {
    const raw = {
      ...makeManifest({}),
      ecucSources: 'not-an-object' as unknown as Record<string, string>,
    };
    const result = loadManifest(JSON.stringify(raw));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('invalid-shape');
  });
});

describe('Bug 3 — store hydrates sourceBswmdPath from manifest', () => {
  beforeEach(() => {
    useArxmlStore.setState(useArxmlStore.getInitialState());
  });
  afterEach(() => {
    useArxmlStore.setState(useArxmlStore.getInitialState());
  });

  it('hydrates sourceBswmdPath for each ECUC doc listed in ecucSources', () => {
    // The user created Can_EcucValues.arxml from Can_bswmd.arxml, then
    // saved the project (ecucSources persisted), then restarted the
    // app. openProject must rehydrate the in-memory sourceBswmdPath
    // so the ProjectPanel chip counts ECUC docs correctly.
    const manifest = makeManifest({
      ecucSources: { 'Can_EcucValues.arxml': 'Can_bswmd.arxml' },
    });
    useArxmlStore.getState().openProject({
      manifestPath: 'D:/proj/manifest.json',
      manifest,
      docs: [
        {
          rel: 'Can_EcucValues.arxml',
          path: 'D:/proj/Can_EcucValues.arxml',
          content: ECUC_SKELETON_XML,
        },
      ],
      bswmds: [
        { rel: 'Can_bswmd.arxml', path: 'D:/proj/Can_bswmd.arxml', content: MINIMAL_BSWMD_XML },
      ],
    });

    const state = useArxmlStore.getState();
    expect(state.documents).toHaveLength(1);
    expect(state.documents[0]?.sourceBswmdPath).toBe('D:/proj/Can_bswmd.arxml');
  });

  it('leaves sourceBswmdPath undefined when manifest has no ecucSources entry', () => {
    // Backward-compat: a legacy manifest without ecucSources must
    // still open. The ECUC doc's sourceBswmdPath is undefined, which
    // matches the pre-Bug-3 behaviour and keeps the ProjectPanel chip
    // at 0/N for that BSWMD row (no regression).
    const manifest = makeManifest({}); // empty ecucSources
    useArxmlStore.getState().openProject({
      manifestPath: 'D:/proj/manifest.json',
      manifest,
      docs: [
        {
          rel: 'Can_EcucValues.arxml',
          path: 'D:/proj/Can_EcucValues.arxml',
          content: ECUC_SKELETON_XML,
        },
      ],
      bswmds: [
        { rel: 'Can_bswmd.arxml', path: 'D:/proj/Can_bswmd.arxml', content: MINIMAL_BSWMD_XML },
      ],
    });

    const state = useArxmlStore.getState();
    expect(state.documents).toHaveLength(1);
    expect(state.documents[0]?.sourceBswmdPath).toBeUndefined();
  });
});

describe('Bug 3 — addDocumentWithSource persists provenance to manifest', () => {
  beforeEach(() => {
    useArxmlStore.setState(useArxmlStore.getInitialState());
  });
  afterEach(() => {
    useArxmlStore.setState(useArxmlStore.getInitialState());
  });

  it('records ecucSources[ecucRel] = bswmdRel when adding a new doc', () => {
    // First open an empty project so the store has a manifest in
    // scope. Then add a doc via addDocumentWithSource and confirm
    // the manifest's ecucSources map now contains the (rel, rel) pair.
    const manifest = makeManifest({});
    useArxmlStore.getState().openProject({
      manifestPath: 'D:/proj/manifest.json',
      manifest,
      docs: [],
      bswmds: [
        { rel: 'Can_bswmd.arxml', path: 'D:/proj/Can_bswmd.arxml', content: MINIMAL_BSWMD_XML },
      ],
    });

    const newDoc = {
      path: 'D:/proj/Can_EcucValues.arxml',
      version: '4.6' as const,
      packages: [],
    };
    useArxmlStore.getState().addDocumentWithSource(newDoc, 'D:/proj/Can_bswmd.arxml');

    const after = useArxmlStore.getState();
    expect(after.project?.ecucSources).toEqual({
      'Can_EcucValues.arxml': 'Can_bswmd.arxml',
    });
  });
});
