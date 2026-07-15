// @vitest-environment jsdom
//
// Bug 7 — "导入 dBC 后 com/canif/pdur 容器未更新" (session 252).
//
// User-reported symptom: after the user manually creates canif/com/pdur
// modules and applies a dBC import, the rendered Tree does not show the
// freshly-added dBC-mapped containers. The dBC apply pipeline writes 3
// ECUC value files (Com / CanIf / PduR) atomically, then `project:reload`
// re-reads the manifest + the 3 freshly-written files + all BSWMDs. The
// renderer partitions the reload response into `docs` (ECUC value files)
// and `bswmds`, then calls `useArxmlStore.openProject({ ... })` to re-
// parse the ECUC value files into the in-memory store.
//
// Pre-investigation hypothesis was a store-level hydrate bug: the post-
// reload store state would not reflect the new containers. Static review
// + fixture-driven vitest runs (3 docs × 3 bswmds in 22 distinct SANITY
// shape variants + isolated Pin A) all showed `state.documents.length`
// matches `manifest.valueArxmlPaths.length` and `state.displayDoc.packages`
// lists all 3 module shortNames — proving the store-side hydrate is
// correct.
//
// This test pins the post-reload store state for the exact shape the
// production dBC apply path produces: 3 ECUC value docs (one container
// per file pre-apply, two per file post-apply) and 3 BSWMDs (Com,
// CanIf, PduR modules). The fixture is local — no IPC, no real
// filesystem, no React render — so the test isolates the store-side
// contract from the IPC + UI layers above it.
//
// Future regression signal: if a future change to `openProject` or
// `buildCombinedDocument` breaks the post-reload hydrate, this test
// fails BEFORE the user sees the regression in dev.

import { describe, it, expect, beforeEach } from 'vitest';

import type { ArxmlElement, ArxmlModule } from '@core/arxml/types';

import { MANIFEST_SCHEMA_VERSION } from '../../../shared/project.js';
import type { ProjectManifest } from '../../../shared/project.js';
import { useArxmlStore } from '../useArxmlStore.js';

// ---------------------------------------------------------------------------
// Minimal BSWMDs — one module each (Com / CanIf / PduR).
// ---------------------------------------------------------------------------

const MIN_BSWMD_COM = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>Com</SHORT-NAME>
          <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
          <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

const MIN_BSWMD_CANIF = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>CanIf</SHORT-NAME>
          <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
          <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

const MIN_BSWMD_PDUR = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-DEF>
          <SHORT-NAME>PduR</SHORT-NAME>
          <LOWER-MULTIPLICITY>0</LOWER-MULTIPLICITY>
          <UPPER-MULTIPLICITY>1</UPPER-MULTIPLICITY>
        </ECUC-MODULE-DEF>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

// ---------------------------------------------------------------------------
// ECUC value-side ARXMLs — POST-dBC-apply state (2 containers per file).
//
// Shape: `AUTOSAR_R22 > EcucDefs > <module>` (per the user's actual
// workspace; matches the AUTOSAR standard ECUC value-side pattern that
// `foldVendorPackages` recognises). The dBC mapper added
// ComIPdu_0 / CanIfRxPduCfg_0 / PduRRoutingPath_0 alongside the
// pre-existing ComConfig / CanIfInitCfg / PduRRoutingTables.
//
// Critical: root package MUST use one of the foldable prefixes
// (`AUTOSAR(_.*)?` / `EcucDefs` / `EAS` / `JWQ_.*_PACK`) for the
// post-apply `displayDoc.packages` to list all 3 module shortNames.
// The store's combined-mode dedup (Sprint 17c T10) keys on
// `pkg.shortName`; without the fold, the 3 docs' root `EcucValues`
// shortName collides and dedup silently drops 2 of 3.
// ---------------------------------------------------------------------------

const COM_AFTER_DBC = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_00046.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>AUTOSAR_R22</SHORT-NAME>
      <AR-PACKAGES>
        <AR-PACKAGE>
          <SHORT-NAME>EcucDefs</SHORT-NAME>
          <ELEMENTS>
            <ECUC-MODULE-CONFIGURATION-VALUES>
              <SHORT-NAME>Com</SHORT-NAME>
              <DEFINITION-REF DEST="ECUC-MODULE-DEF">/EcucDefs/Com</DEFINITION-REF>
              <CONTAINERS>
                <ECUC-CONTAINER-VALUE>
                  <SHORT-NAME>ComConfig</SHORT-NAME>
                  <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/EcucDefs/Com/ComConfig</DEFINITION-REF>
                </ECUC-CONTAINER-VALUE>
                <ECUC-CONTAINER-VALUE>
                  <SHORT-NAME>ComIPdu_0</SHORT-NAME>
                  <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/EcucDefs/Com/ComIPdu</DEFINITION-REF>
                </ECUC-CONTAINER-VALUE>
              </CONTAINERS>
            </ECUC-MODULE-CONFIGURATION-VALUES>
          </ELEMENTS>
        </AR-PACKAGE>
      </AR-PACKAGES>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

const CANIF_AFTER_DBC = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_00046.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>AUTOSAR_R22</SHORT-NAME>
      <AR-PACKAGES>
        <AR-PACKAGE>
          <SHORT-NAME>EcucDefs</SHORT-NAME>
          <ELEMENTS>
            <ECUC-MODULE-CONFIGURATION-VALUES>
              <SHORT-NAME>CanIf</SHORT-NAME>
              <DEFINITION-REF DEST="ECUC-MODULE-DEF">/EcucDefs/CanIf</DEFINITION-REF>
              <CONTAINERS>
                <ECUC-CONTAINER-VALUE>
                  <SHORT-NAME>CanIfInitCfg</SHORT-NAME>
                  <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/EcucDefs/CanIf/CanIfInitCfg</DEFINITION-REF>
                </ECUC-CONTAINER-VALUE>
                <ECUC-CONTAINER-VALUE>
                  <SHORT-NAME>CanIfRxPduCfg_0</SHORT-NAME>
                  <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/EcucDefs/CanIf/CanIfRxPduCfg</DEFINITION-REF>
                </ECUC-CONTAINER-VALUE>
              </CONTAINERS>
            </ECUC-MODULE-CONFIGURATION-VALUES>
          </ELEMENTS>
        </AR-PACKAGE>
      </AR-PACKAGES>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

const PDUR_AFTER_DBC = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_00046.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>AUTOSAR_R22</SHORT-NAME>
      <AR-PACKAGES>
        <AR-PACKAGE>
          <SHORT-NAME>EcucDefs</SHORT-NAME>
          <ELEMENTS>
            <ECUC-MODULE-CONFIGURATION-VALUES>
              <SHORT-NAME>PduR</SHORT-NAME>
              <DEFINITION-REF DEST="ECUC-MODULE-DEF">/EcucDefs/PduR</DEFINITION-REF>
              <CONTAINERS>
                <ECUC-CONTAINER-VALUE>
                  <SHORT-NAME>PduRRoutingTables</SHORT-NAME>
                  <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/EcucDefs/PduR/PduRRoutingTables</DEFINITION-REF>
                </ECUC-CONTAINER-VALUE>
                <ECUC-CONTAINER-VALUE>
                  <SHORT-NAME>PduRRoutingPath_0</SHORT-NAME>
                  <DEFINITION-REF DEST="ECUC-PARAM-CONF-CONTAINER-DEF">/EcucDefs/PduR/PduRRoutingPath</DEFINITION-REF>
                </ECUC-CONTAINER-VALUE>
              </CONTAINERS>
            </ECUC-MODULE-CONFIGURATION-VALUES>
          </ELEMENTS>
        </AR-PACKAGE>
      </AR-PACKAGES>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

function sampleManifest(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    id: '00000000-0000-0000-0000-0000000000b7',
    name: 'Bug 7 dBC-apply reload test',
    valueArxmlPaths: [],
    bswmdPaths: [],
    ...overrides,
  };
}

beforeEach(() => {
  useArxmlStore.getState().clear();
});

describe('useArxmlStore — Bug 7: dBC apply + projectReload must reflect new containers (session 252)', () => {
  it('post-dBC-apply reload shape: 3 ECUC docs (2 containers each) + 3 BSWMDs hydrates correctly', () => {
    // After the dBC apply handler writes 3 ECUC files, project:reload
    // ships the freshly-written file contents in `files[]` to the
    // renderer. App.tsx partitions them into `docs` (ECUC value
    // files) + `bswmds` and calls openProject. The store must re-parse
    // every ECUC file and produce a state where:
    //   - documents.length === valueArxmlPaths.length (3)
    //   - each document's module has the freshly-added dBC container
    //   - viewMode is promoted to 'combined' (multi-doc open)
    //   - displayDoc synthesises 3 module shortNames
    //   - error is null (no missing-rels; no parse failure)
    //
    // Lookup pattern: `state.documents[i].path` is the in-document
    // root path string (always `''` for our parser shape — set to
    // empty by `parseArxml`); the file path lives in
    // `state.documentPaths[i]`. We pair them by index.
    const manifest = sampleManifest({
      valueArxmlPaths: [
        'ecuc/Com_EcucValues.arxml',
        'ecuc/CanIf_EcucValues.arxml',
        'ecuc/PduR_EcucValues.arxml',
      ],
      bswmdPaths: ['bswmd/Com.arxml', 'bswmd/CanIf.arxml', 'bswmd/PduR.arxml'],
    });
    const docs = [
      {
        rel: 'ecuc/Com_EcucValues.arxml',
        path: 'D:/proj/ecuc/Com_EcucValues.arxml',
        content: COM_AFTER_DBC,
      },
      {
        rel: 'ecuc/CanIf_EcucValues.arxml',
        path: 'D:/proj/ecuc/CanIf_EcucValues.arxml',
        content: CANIF_AFTER_DBC,
      },
      {
        rel: 'ecuc/PduR_EcucValues.arxml',
        path: 'D:/proj/ecuc/PduR_EcucValues.arxml',
        content: PDUR_AFTER_DBC,
      },
    ];
    const bswmds = [
      { rel: 'bswmd/Com.arxml', path: 'D:/proj/bswmd/Com.arxml', content: MIN_BSWMD_COM },
      {
        rel: 'bswmd/CanIf.arxml',
        path: 'D:/proj/bswmd/CanIf.arxml',
        content: MIN_BSWMD_CANIF,
      },
      { rel: 'bswmd/PduR.arxml', path: 'D:/proj/bswmd/PduR.arxml', content: MIN_BSWMD_PDUR },
    ];

    useArxmlStore.getState().openProject({
      manifestPath: 'D:/proj/P.autosarcfg.json',
      manifest,
      docs,
      bswmds,
    });

    const after = useArxmlStore.getState();

    // The 3 ECUC value files made it into the store.
    expect(after.documents).toHaveLength(3);
    expect(after.documentPaths).toHaveLength(3);
    expect(after.documentPaths).toEqual([
      'D:/proj/ecuc/Com_EcucValues.arxml',
      'D:/proj/ecuc/CanIf_EcucValues.arxml',
      'D:/proj/ecuc/PduR_EcucValues.arxml',
    ]);

    // viewMode auto-promoted (Sprint 17c T10 / Bug 5) for multi-doc open.
    expect(after.viewMode).toBe('combined');

    // 3 distinct BSWMD schemas registered.
    expect(after.bswmdSchemas).toHaveLength(3);
    expect(after.bswmdPaths).toHaveLength(3);

    // No missing-rels error and no BSWMD parse error.
    expect(after.error).toBeNull();

    // ── displayDoc assertions — this is the user-visible Tree data ──
    //
    // The fold chain is:
    //   `AUTOSAR_R22 > EcucDefs > <module>` (per doc)
    //   → fold AUTOSAR_R22 (GENERIC prefix + inner `EcucDefs` in
    //     bswmd module names)
    //   → fold EcucDefs (inner `<module>` is a BSWMD module name)
    //   → leaves <module> at the root of the per-doc display.
    //
    // The dedup pass then runs on these 3 un-wrapped module shortNames
    // (one per doc), each unique, so all 3 survive into displayDoc.packages.
    //
    // Pre-Bug-7 fix: `computeDisplayDoc` was called with
    // `get().bswmdSchemas` (stale — the *previous* store state, empty
    // on a fresh open) instead of the locally-built `bswmdSchemasOut`.
    // With the empty set `foldVendorPackages` couldn't identify
    // `AUTOSAR_R22` as foldable, left all 3 docs with that wrapper
    // shortName at the root, and the Sprint 17c T10 dedup silently
    // collapsed 3-of-3 to 1. The Tree showed 1 module instead of N.
    expect(after.displayDoc).not.toBeNull();
    if (after.displayDoc === null) throw new Error('expected displayDoc');
    const moduleElements = after.displayDoc.packages
      .flatMap((p) => p.elements)
      .filter((e): e is ArxmlModule => e.kind === 'module');
    const moduleShortNames = moduleElements.map((e) => e.shortName).sort();
    expect(moduleShortNames).toEqual(['CanIf', 'Com', 'PduR']);

    // Each module element carries both the pre-existing container
    // and the dBC-mapped container — proves the freshly-added dBC
    // containers are present in the in-memory state.
    const childShortNames = (m: ArxmlModule): string[] =>
      m.children.flatMap((c) =>
        c.kind === 'container' || c.kind === 'module' ? [c.shortName] : [],
      );
    const comModule = moduleElements.find((m) => m.shortName === 'Com');
    expect(comModule ? childShortNames(comModule) : []).toEqual(
      expect.arrayContaining(['ComConfig', 'ComIPdu_0']),
    );
    const canIfModule = moduleElements.find((m) => m.shortName === 'CanIf');
    expect(canIfModule ? childShortNames(canIfModule) : []).toEqual(
      expect.arrayContaining(['CanIfInitCfg', 'CanIfRxPduCfg_0']),
    );
    const pduRModule = moduleElements.find((m) => m.shortName === 'PduR');
    expect(pduRModule ? childShortNames(pduRModule) : []).toEqual(
      expect.arrayContaining(['PduRRoutingTables', 'PduRRoutingPath_0']),
    );

    // Avoid unused-import lint (ArxmlElement is in the type
    // predicate docstring + filter callback).
    const _arxmlElementKind: ArxmlElement['kind'] = 'module';
    void _arxmlElementKind;
  });
});
