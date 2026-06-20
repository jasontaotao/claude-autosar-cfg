// @vitest-environment jsdom
//
// Sprint A — P0-A2 fix tests: openProject must accept the `bswmds` field
// from the IPC `project:open` response and parse each entry's content
// into `bswmdSchemas` + `bswmdPaths`, mirroring what `addBswmd` does for
// the dialog path.
//
// Pre-Sprint-A behaviour: the renderer's `openProject` call in
// `useProjectActions.openProjectFromDialog` only forwarded `docs`, so
// `result.bswmds` from IPC was silently dropped and `state.bswmdSchemas`
// stayed empty after every project open. That left ProjectPanel's
// `📋 0/0` chip stuck on zero even when the manifest referenced real
// BSWMD files. The fix: widen the action signature, parse + push on
// success, surface a localized error on parse failure, and clear any
// prior `bswmdSchemas` / `bswmdPaths` so a stale project doesn't leak
// into a freshly-opened one.
//
// Test pins:
//   1. openProject with `bswmds` parses each entry and pushes the
//      resulting (schema, absolute-path) pair into bswmdSchemas /
//      bswmdPaths, using the IPC-provided absolute `path` field (the
//      same key shape addBswmd produces).
//   2. openProject clears any pre-existing bswmdSchemas / bswmdPaths
//      so closeProject-then-openProject doesn't leak schemas across
//      projects.
//   3. openProject with an unparseable BSWMD in the bundle surfaces a
//      parseBswmdFailed-style error and leaves the rest of the bundle
//      pushed (partial-load = best-effort: bad entry is dropped with a
//      banner, good entries still register).
//   4. openProject without `bswmds` (back-compat: New project flow
//      passes nothing today) leaves bswmdSchemas empty AND keeps any
//      pre-existing values from leaking if previously cleared.

import { describe, it, expect, beforeEach } from 'vitest';

import type { BswmdDocument } from '@core/project/bswmd.js';

import { MANIFEST_SCHEMA_VERSION } from '../../../shared/project.js';
import type { ProjectManifest } from '../../../shared/project.js';
import { useArxmlStore } from '../useArxmlStore.js';

// ---------------------------------------------------------------------------
// Minimal valid BSWMD (autosar-standard ECUC-MODULE-DEF dialect).
// parseBswmd only needs well-formed XML + an <AUTOSAR> root + an
// <AR-PACKAGES> branch with at least one <ECUC-MODULE-DEF> child.
// ---------------------------------------------------------------------------

const MIN_BSWMD_CAN = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Can</SHORT-NAME>
          <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
          <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

const MIN_BSWMD_ECUC = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>EcuC</SHORT-NAME>
          <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
          <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

const MALFORMED_BSWMD = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
`;

function sampleManifest(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    id: '00000000-0000-0000-0000-0000000000aa',
    name: 'P0-A2 Test Project',
    valueArxmlPaths: [],
    bswmdPaths: [],
    ...overrides,
  };
}

beforeEach(() => {
  useArxmlStore.getState().clear();
});

describe('useArxmlStore — openProject with bswmds (Sprint A / P0-A2)', () => {
  it('parses each bswmd entry and pushes (schema, absolute path) into the store', () => {
    // Arrange
    const manifest = sampleManifest({
      bswmdPaths: ['bswmd/Can.arxml', 'bswmd/EcuC.arxml'],
    });
    const bswmds = [
      { rel: 'bswmd/Can.arxml', path: 'D:/proj/bswmd/Can.arxml', content: MIN_BSWMD_CAN },
      { rel: 'bswmd/EcuC.arxml', path: 'D:/proj/bswmd/EcuC.arxml', content: MIN_BSWMD_ECUC },
    ];

    // Act
    useArxmlStore.getState().openProject({
      manifestPath: 'D:/proj/P.autosarcfg.json',
      manifest,
      docs: [],
      bswmds,
    });

    // Assert — schemas are paired with the ABSOLUTE paths IPC returned,
    // not with the relative manifest entries.
    const after = useArxmlStore.getState();
    expect(after.bswmdSchemas).toHaveLength(2);
    expect(after.bswmdPaths).toEqual([
      'D:/proj/bswmd/Can.arxml',
      'D:/proj/bswmd/EcuC.arxml',
    ]);
    // The schema index 0 corresponds to Can module.
    const firstSchema = after.bswmdSchemas[0] as BswmdDocument;
    expect(firstSchema.modules.map((m) => m.shortName)).toEqual(['Can']);
  });

  it('clears any pre-existing bswmdSchemas/bswmdPaths before loading the new bundle', () => {
    // Arrange — pre-load a stale schema into the store (simulating a
    // previous project's leftover state).
    useArxmlStore.getState().addBswmd('/stale/leftover.arxml', MIN_BSWMD_CAN);
    expect(useArxmlStore.getState().bswmdSchemas).toHaveLength(1);

    // Act — open a NEW project with its own bswmds. The stale schema
    // must be dropped so the new project starts clean.
    useArxmlStore.getState().openProject({
      manifestPath: 'D:/proj/P.autosarcfg.json',
      manifest: sampleManifest({ bswmdPaths: ['bswmd/Can.arxml'] }),
      docs: [],
      bswmds: [
        { rel: 'bswmd/Can.arxml', path: 'D:/proj/bswmd/Can.arxml', content: MIN_BSWMD_CAN },
      ],
    });

    // Assert — only the new project's schema is present.
    const after = useArxmlStore.getState();
    expect(after.bswmdPaths).toEqual(['D:/proj/bswmd/Can.arxml']);
    expect(after.bswmdSchemas).toHaveLength(1);
  });

  it('surfaces a parseBswmdFailed error for unparseable entries and skips them', () => {
    // Arrange — one good, one bad.
    const bswmds = [
      { rel: 'bswmd/Can.arxml', path: 'D:/proj/bswmd/Can.arxml', content: MIN_BSWMD_CAN },
      { rel: 'bswmd/Broken.arxml', path: 'D:/proj/bswmd/Broken.arxml', content: MALFORMED_BSWMD },
    ];

    // Act
    useArxmlStore.getState().openProject({
      manifestPath: 'D:/proj/P.autosarcfg.json',
      manifest: sampleManifest({ bswmdPaths: ['bswmd/Can.arxml', 'bswmd/Broken.arxml'] }),
      docs: [],
      bswmds,
    });

    // Assert — the good entry registered, the bad one was skipped,
    // and a localized parse-failure error is on the store.
    const after = useArxmlStore.getState();
    expect(after.bswmdSchemas).toHaveLength(1);
    expect(after.bswmdPaths).toEqual(['D:/proj/bswmd/Can.arxml']);
    expect(after.error).not.toBeNull();
    // The error string is localized via t(locale, 'app.error.parseBswmdFailed'),
    // which interpolates the parser message. We don't pin the exact
    // wording (locale-sensitive), only that it's set.
  });

  it('accepts no bswmds field at all (back-compat: New project flow never sends one)', () => {
    // Act — openProject with only docs, no bswmds key.
    useArxmlStore.getState().openProject({
      manifestPath: 'D:/proj/P.autosarcfg.json',
      manifest: sampleManifest(),
      docs: [],
    });

    // Assert — store is clean.
    const after = useArxmlStore.getState();
    expect(after.bswmdSchemas).toEqual([]);
    expect(after.bswmdPaths).toEqual([]);
    expect(after.error).toBeNull();
  });

  it('pairs the bswmd paths to schemas by array order (parallel arrays)', () => {
    // The ProjectPanel chip lookup relies on parallel-array ordering:
    // bswmdPaths[i] corresponds to bswmdSchemas[i]. The IPC bundle
    // ordering is authoritative, so we preserve it verbatim.
    const bswmds = [
      { rel: 'a/A.arxml', path: 'D:/proj/a/A.arxml', content: MIN_BSWMD_CAN },
      { rel: 'b/B.arxml', path: 'D:/proj/b/B.arxml', content: MIN_BSWMD_ECUC },
      { rel: 'c/C.arxml', path: 'D:/proj/c/C.arxml', content: MIN_BSWMD_CAN },
    ];

    useArxmlStore.getState().openProject({
      manifestPath: 'D:/proj/P.autosarcfg.json',
      manifest: sampleManifest({ bswmdPaths: ['a/A.arxml', 'b/B.arxml', 'c/C.arxml'] }),
      docs: [],
      bswmds,
    });

    const after = useArxmlStore.getState();
    expect(after.bswmdPaths).toEqual([
      'D:/proj/a/A.arxml',
      'D:/proj/b/B.arxml',
      'D:/proj/c/C.arxml',
    ]);
    expect((after.bswmdSchemas[1] as BswmdDocument).modules[0]?.shortName).toBe('EcuC');
  });
});