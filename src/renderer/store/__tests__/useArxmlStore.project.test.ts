// Sprint 11 Phase 1 — store project state tests.
//
// Pins the loose-mode back-compat contract (project === null = today's
// behavior, all 329 prior tests rely on this) AND the project-mode
// contract (openProject / closeProject / project-sync add+remove).

import { describe, it, expect, beforeEach } from 'vitest';

import { parseArxml } from '@core/arxml/parser';
import type { ArxmlDocument } from '@core/arxml/types';

import { loadManifest, saveManifest } from '../../../core/project/manifest.js';
import { MANIFEST_SCHEMA_VERSION } from '../../../shared/project.js';
import type { ProjectManifest } from '../../../shared/project.js';
import { useArxmlStore } from '../useArxmlStore.js';

// ---------------------------------------------------------------------------
// Minimal valid ARXML string. The parser only cares about well-formed XML
// + a single ECUC-MODULE-CONFIGURATION-VALUES, so a tiny stub suffices.
// ---------------------------------------------------------------------------

const MIN_ARXML = `<?xml version="1.0" encoding="UTF-8"?>
<AUTOSAR xmlns="http://autosar.org/schema/r4.6"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://autosar.org/schema/r4.6 AUTOSAR_4-6-0.xsd">
  <AR-PACKAGES>
    <AR-PACKAGE>
      <SHORT-NAME>EcucDefs</SHORT-NAME>
      <ELEMENTS>
        <ECUC-MODULE-CONFIGURATION-VALUES>
          <SHORT-NAME>CanIf</SHORT-NAME>
          <DEFINITION-REF DEST="ECUC-MODULE-DEF">/EcucDefs/CanIf</DEFINITION-REF>
        </ECUC-MODULE-CONFIGURATION-VALUES>
      </ELEMENTS>
    </AR-PACKAGE>
  </AR-PACKAGES>
</AUTOSAR>`;

function sampleManifest(overrides: Partial<ProjectManifest> = {}): ProjectManifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Test Project',
    valueArxmlPaths: [],
    bswmdPaths: [],
    ...overrides,
  };
}

beforeEach(() => {
  // Reset store between tests — keeps test isolation independent of
  // earlier loose-mode tests that may have loaded docs.
  useArxmlStore.getState().clear();
});

// ---------------------------------------------------------------------------
// Loose-mode initial state (back-compat baseline)
// ---------------------------------------------------------------------------

describe('useArxmlStore — project state (loose mode)', () => {
  it('initializes project === null and projectPath === null', () => {
    const state = useArxmlStore.getState();
    expect(state.project).toBeNull();
    expect(state.projectPath).toBeNull();
  });

  it('addDocument with project null leaves project null (loose back-compat)', () => {
    // Arrange
    const store = useArxmlStore.getState();
    expect(store.project).toBeNull();

    // Act
    store.addDocument(
      // parse-once is too much setup; just provide a stub that the
      // store will reject on validate. The path-relevant assertion is
      // that project state remains null.
      // To avoid forcing a parser import, we use the same minimal
      // string the tests below rely on.
      parseArxmlOrThrow(MIN_ARXML),
      '/path/to/CanIf.arxml',
    );

    // Assert
    const after = useArxmlStore.getState();
    expect(after.project).toBeNull();
    expect(after.projectPath).toBeNull();
    expect(after.documentPaths).toEqual(['/path/to/CanIf.arxml']);
  });

  it('removeDocument with project null leaves project null', () => {
    // Arrange — load a doc first
    const store = useArxmlStore.getState();
    store.addDocument(parseArxmlOrThrow(MIN_ARXML), '/path/to/CanIf.arxml');

    // Act
    useArxmlStore.getState().removeDocument('/path/to/CanIf.arxml');

    // Assert
    const after = useArxmlStore.getState();
    expect(after.project).toBeNull();
    expect(after.projectPath).toBeNull();
    expect(after.documentPaths).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// openProject
// ---------------------------------------------------------------------------

describe('useArxmlStore — openProject', () => {
  it('sets project + projectPath and replaces document set from manifest', () => {
    // Arrange
    const manifest = sampleManifest({
      valueArxmlPaths: ['/proj/CanIf.arxml', '/proj/Com.arxml'],
    });
    const bundle = [
      { rel: '/proj/CanIf.arxml', path: '/proj/CanIf.arxml', content: MIN_ARXML },
      { rel: '/proj/Com.arxml', path: '/proj/Com.arxml', content: MIN_ARXML },
    ];

    // Act
    useArxmlStore.getState().openProject({
      manifestPath: '/proj/test.autosarcfg.json',
      manifest,
      docs: bundle,
    });

    // Assert
    const after = useArxmlStore.getState();
    expect(after.project).toEqual(manifest);
    expect(after.projectPath).toBe('/proj/test.autosarcfg.json');
    expect(after.documentPaths).toEqual(['/proj/CanIf.arxml', '/proj/Com.arxml']);
    expect(after.documents).toHaveLength(2);
    expect(after.activeDocumentPath).toBe('/proj/CanIf.arxml');
  });

  it('clears dirtyPaths on open (fresh load = nothing dirty)', () => {
    // Arrange — pre-existing dirty doc
    useArxmlStore.getState().addDocument(parseArxmlOrThrow(MIN_ARXML), '/unrelated.arxml');
    useArxmlStore
      .getState()
      .updateParam('/EcucDefs/CanIf', 'NewParam', { type: 'integer', value: 42 });
    expect(useArxmlStore.getState().dirtyPaths.size).toBeGreaterThan(0);

    // Act
    useArxmlStore.getState().openProject({
      manifestPath: '/proj/p.json',
      manifest: sampleManifest(),
      docs: [],
    });

    // Assert
    expect(useArxmlStore.getState().dirtyPaths.size).toBe(0);
  });

  it('skips doc entries referenced by manifest but missing from bundle', () => {
    // Arrange — manifest lists 2 paths but bundle only has 1
    const manifest = sampleManifest({
      valueArxmlPaths: ['/proj/CanIf.arxml', '/proj/Missing.arxml'],
    });
    const bundle = [{ rel: '/proj/CanIf.arxml', path: '/proj/CanIf.arxml', content: MIN_ARXML }];

    // Act
    useArxmlStore.getState().openProject({
      manifestPath: '/proj/p.json',
      manifest,
      docs: bundle,
    });

    // Assert
    const after = useArxmlStore.getState();
    expect(after.documents).toHaveLength(1);
    expect(after.documentPaths).toEqual(['/proj/CanIf.arxml']);
    // Manifest still references Missing.arxml — Save Project will
    // produce a read-failed when re-opening unless the user adds it.
    expect(after.project?.valueArxmlPaths).toEqual(['/proj/CanIf.arxml', '/proj/Missing.arxml']);
  });

  it('pairs manifest entries by rel, not by basename (collision safety)', () => {
    // Sprint 11 Phase 1 (code-review H1): two docs that share a
    // basename must pair back to the correct manifest slot. The
    // implementation uses `rel` for matching; this test pins the
    // behaviour so a future refactor back to basename / path-based
    // matching will be caught.
    const manifest = sampleManifest({
      valueArxmlPaths: ['subdir1/EcuC.arxml', 'subdir2/EcuC.arxml'],
    });
    const bundle = [
      { rel: 'subdir1/EcuC.arxml', path: '/proj/subdir1/EcuC.arxml', content: MIN_ARXML },
      { rel: 'subdir2/EcuC.arxml', path: '/proj/subdir2/EcuC.arxml', content: MIN_ARXML },
    ];

    // Act
    useArxmlStore.getState().openProject({
      manifestPath: '/proj/p.json',
      manifest,
      docs: bundle,
    });

    // Assert — both docs loaded, in manifest order, paired by rel
    const after = useArxmlStore.getState();
    expect(after.documentPaths).toEqual(['/proj/subdir1/EcuC.arxml', '/proj/subdir2/EcuC.arxml']);
    expect(after.documents).toHaveLength(2);
  });

  it('re-validates after openProject (lastValidatedAt updates)', () => {
    // Arrange
    const before = useArxmlStore.getState().lastValidatedAt;

    // Act
    useArxmlStore.getState().openProject({
      manifestPath: '/proj/p.json',
      manifest: sampleManifest(),
      docs: [],
    });

    // Assert
    const after = useArxmlStore.getState().lastValidatedAt;
    expect(after).not.toBeNull();
    if (before !== null && after !== null) {
      expect(after).toBeGreaterThanOrEqual(before);
    }
  });
});

// ---------------------------------------------------------------------------
// closeProject
// ---------------------------------------------------------------------------

describe('useArxmlStore — closeProject', () => {
  it('clears project + projectPath but preserves documents and dirty state', () => {
    // Arrange — open a project with 1 doc, mark dirty
    useArxmlStore.getState().openProject({
      manifestPath: '/proj/p.json',
      manifest: sampleManifest({ valueArxmlPaths: ['/proj/CanIf.arxml'] }),
      docs: [{ rel: '/proj/CanIf.arxml', path: '/proj/CanIf.arxml', content: MIN_ARXML }],
    });
    useArxmlStore
      .getState()
      .updateParam('/EcucDefs/CanIf', 'NewParam', { type: 'integer', value: 42 });
    expect(useArxmlStore.getState().dirtyPaths.size).toBeGreaterThan(0);

    // Act
    useArxmlStore.getState().closeProject();

    // Assert
    const after = useArxmlStore.getState();
    expect(after.project).toBeNull();
    expect(after.projectPath).toBeNull();
    expect(after.documentPaths).toEqual(['/proj/CanIf.arxml']);
    expect(after.documents).toHaveLength(1);
    expect(after.dirtyPaths.size).toBeGreaterThan(0); // preserved
  });

  it('is a no-op when no project is open (loose mode)', () => {
    // Arrange
    useArxmlStore.getState().addDocument(parseArxmlOrThrow(MIN_ARXML), '/x.arxml');
    const before = useArxmlStore.getState();

    // Act
    useArxmlStore.getState().closeProject();

    // Assert — nothing changed
    const after = useArxmlStore.getState();
    expect(after.project).toBe(before.project);
    expect(after.projectPath).toBe(before.projectPath);
    expect(after.documentPaths).toEqual(before.documentPaths);
  });
});

// ---------------------------------------------------------------------------
// Project sync (addDocument / removeDocument with project open)
// ---------------------------------------------------------------------------

describe('useArxmlStore — project sync on add/remove', () => {
  it('addDocument with project open appends path to project.valueArxmlPaths', () => {
    // Arrange
    useArxmlStore.getState().openProject({
      manifestPath: '/proj/p.json',
      manifest: sampleManifest(),
      docs: [],
    });

    // Act
    useArxmlStore.getState().addDocument(parseArxmlOrThrow(MIN_ARXML), '/proj/NewDoc.arxml');

    // Assert — Sprint 16b T6: manifest stores the RELATIVE form
    // (relativised against dirname(projectPath) = /proj). documentPaths
    // keeps the absolute path; that's the on-disk source.
    const after = useArxmlStore.getState();
    expect(after.project?.valueArxmlPaths).toEqual(['NewDoc.arxml']);
    expect(after.documentPaths).toEqual(['/proj/NewDoc.arxml']);
  });

  it('addDocument with project open does NOT duplicate already-present path', () => {
    // Arrange — manifest already lists the relative form (T6 contract).
    useArxmlStore.getState().openProject({
      manifestPath: '/proj/p.json',
      manifest: sampleManifest({ valueArxmlPaths: ['A.arxml'] }),
      docs: [{ rel: 'A.arxml', path: '/proj/A.arxml', content: MIN_ARXML }],
    });

    // Act — replace same path
    useArxmlStore.getState().addDocument(parseArxmlOrThrow(MIN_ARXML), '/proj/A.arxml');

    // Assert — path list still single, relativised form preserved.
    const after = useArxmlStore.getState();
    expect(after.project?.valueArxmlPaths).toEqual(['A.arxml']);
    expect(after.documentPaths).toEqual(['/proj/A.arxml']);
  });

  it('removeDocument with project open drops path from project.valueArxmlPaths', () => {
    // Arrange
    useArxmlStore.getState().openProject({
      manifestPath: '/proj/p.json',
      manifest: sampleManifest({ valueArxmlPaths: ['/proj/A.arxml', '/proj/B.arxml'] }),
      docs: [
        { rel: '/proj/A.arxml', path: '/proj/A.arxml', content: MIN_ARXML },
        { rel: '/proj/B.arxml', path: '/proj/B.arxml', content: MIN_ARXML },
      ],
    });

    // Act
    useArxmlStore.getState().removeDocument('/proj/A.arxml');

    // Assert
    const after = useArxmlStore.getState();
    expect(after.project?.valueArxmlPaths).toEqual(['/proj/B.arxml']);
    expect(after.documentPaths).toEqual(['/proj/B.arxml']);
  });
});

// ---------------------------------------------------------------------------
// clear (Sprint 11 — must also reset project state)
// ---------------------------------------------------------------------------

describe('useArxmlStore — clear resets project state', () => {
  it('clears project + projectPath alongside everything else', () => {
    // Arrange
    useArxmlStore.getState().openProject({
      manifestPath: '/proj/p.json',
      manifest: sampleManifest(),
      docs: [{ rel: '/proj/A.arxml', path: '/proj/A.arxml', content: MIN_ARXML }],
    });
    expect(useArxmlStore.getState().project).not.toBeNull();

    // Act
    useArxmlStore.getState().clear();

    // Assert
    const after = useArxmlStore.getState();
    expect(after.project).toBeNull();
    expect(after.projectPath).toBeNull();
    expect(after.documents).toEqual([]);
    expect(after.documentPaths).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// markSaved still works under project mode (back-compat pin)
// ---------------------------------------------------------------------------

describe('useArxmlStore — markSaved in project mode', () => {
  it('drops only the saved filePath from dirtyPaths, preserving project state', () => {
    // Arrange
    useArxmlStore.getState().openProject({
      manifestPath: '/proj/p.json',
      manifest: sampleManifest({ valueArxmlPaths: ['/proj/A.arxml', '/proj/B.arxml'] }),
      docs: [
        { rel: '/proj/A.arxml', path: '/proj/A.arxml', content: MIN_ARXML },
        { rel: '/proj/B.arxml', path: '/proj/B.arxml', content: MIN_ARXML },
      ],
    });
    useArxmlStore
      .getState()
      .updateParam('/EcucDefs/CanIf', 'NewParam', { type: 'integer', value: 42 });

    // Act
    useArxmlStore.getState().markSaved('/proj/A.arxml');

    // Assert — project state untouched, only A dropped from dirty
    const after = useArxmlStore.getState();
    expect(after.project).not.toBeNull();
    expect(after.project?.valueArxmlPaths).toEqual(['/proj/A.arxml', '/proj/B.arxml']);
  });
});

// ---------------------------------------------------------------------------
// Sprint 16b T6 — Project reopen round-trip (abs → rel path)
// ---------------------------------------------------------------------------

describe('useArxmlStore — T6 project reopen round-trip (abs → rel path)', () => {
  it('addDocument + saveManifest + loadManifest round-trip succeeds with relative paths', () => {
    // 1. Project open at D:/proj/MyProj.autosarcfg.json
    // 2. addDocument with absolute filePath D:/proj/ecuc/Can_EcucValues.arxml
    // 3. project.valueArxmlPaths must contain the RELATIVE form
    //    './ecuc/Can_EcucValues.arxml', NOT the absolute
    // 4. saveManifest(...) → loadManifest(...) round-trip accepts (no 'absolute' error)

    // Arrange — open a project, but DON'T pre-populate the document set
    // (the user will add the file via the OS picker, which yields the
    // absolute on-disk path).
    useArxmlStore.getState().openProject({
      manifestPath: 'D:/proj/MyProj.autosarcfg.json',
      manifest: sampleManifest(),
      docs: [],
    });

    // Act — add a doc with the absolute Windows path
    useArxmlStore
      .getState()
      .addDocument(parseArxmlOrThrow(MIN_ARXML), 'D:/proj/ecuc/Can_EcucValues.arxml');

    // Assert — the manifest stores the RELATIVE form, not the absolute
    const afterAdd = useArxmlStore.getState();
    expect(afterAdd.project?.valueArxmlPaths).toEqual(['ecuc/Can_EcucValues.arxml']);
    // documentPaths keeps the absolute path (that's the on-disk source)
    expect(afterAdd.documentPaths).toEqual(['D:/proj/ecuc/Can_EcucValues.arxml']);

    // Round-trip the manifest through save → load
    const saved = saveManifest(afterAdd.project!);
    const reloaded = loadManifest(saved);

    // Assert — loadManifest accepts the saved form (no 'absolute' error).
    // The reloaded manifest's valueArxmlPaths still carries the relative
    // form, ready for the next project:open call.
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(reloaded.value.valueArxmlPaths).toEqual(['ecuc/Can_EcucValues.arxml']);
    }
  });

  it('removeDocument removes the relative entry when given an absolute filePath', () => {
    // When the user removes a doc by absolute filePath, the manifest's
    // relative entry must also be removed (not just the in-memory doc).

    // Arrange — open a project and add a doc
    useArxmlStore.getState().openProject({
      manifestPath: 'D:/proj/MyProj.autosarcfg.json',
      manifest: sampleManifest(),
      docs: [],
    });
    useArxmlStore
      .getState()
      .addDocument(parseArxmlOrThrow(MIN_ARXML), 'D:/proj/ecuc/Can_EcucValues.arxml');
    // Sanity — manifest stored the relative form
    expect(useArxmlStore.getState().project?.valueArxmlPaths).toEqual([
      'ecuc/Can_EcucValues.arxml',
    ]);

    // Act — remove by absolute filePath
    useArxmlStore.getState().removeDocument('D:/proj/ecuc/Can_EcucValues.arxml');

    // Assert — manifest entry was removed
    const after = useArxmlStore.getState();
    expect(after.documentPaths).toEqual([]);
    expect(after.project?.valueArxmlPaths).toEqual([]);
  });

  it('POSIX: addDocument with absolute path relativises to the project dir', () => {
    // Arrange
    useArxmlStore.getState().openProject({
      manifestPath: '/proj/MyProj.autosarcfg.json',
      manifest: sampleManifest(),
      docs: [],
    });

    // Act
    useArxmlStore
      .getState()
      .addDocument(parseArxmlOrThrow(MIN_ARXML), '/proj/ecuc/Can_EcucValues.arxml');

    // Assert
    const after = useArxmlStore.getState();
    expect(after.project?.valueArxmlPaths).toEqual(['ecuc/Can_EcucValues.arxml']);
  });

  it('cross-drive addDocument keeps path absolute and save rejects it (documented edge)', () => {
    // Edge case: filePath on a different Windows drive than the manifest
    // directory can't be relativized. Documented behaviour: the path is
    // kept absolute in the manifest and the next save round-trip will
    // fail loudly with an 'invalid-path' / 'absolute' error so the user
    // notices the mistake.

    // Arrange
    useArxmlStore.getState().openProject({
      manifestPath: 'D:/proj/MyProj.autosarcfg.json',
      manifest: sampleManifest(),
      docs: [],
    });

    // Act
    useArxmlStore
      .getState()
      .addDocument(parseArxmlOrThrow(MIN_ARXML), 'E:/otherproj/ecuc/Can_EcucValues.arxml');

    // Assert — manifest kept the absolute path (no relativisation possible)
    const after = useArxmlStore.getState();
    expect(after.project?.valueArxmlPaths).toEqual(['E:/otherproj/ecuc/Can_EcucValues.arxml']);

    // Round-trip exposes the issue: saveManifest → loadManifest returns
    // an 'absolute' error so the user sees a real problem.
    const saved = saveManifest(after.project!);
    const reloaded = loadManifest(saved);
    expect(reloaded.ok).toBe(false);
    if (!reloaded.ok && reloaded.error.kind === 'invalid-path') {
      expect(reloaded.error.reason).toBe('absolute');
    } else {
      throw new Error(`expected invalid-path/absolute, got ${JSON.stringify(reloaded)}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Helper — parser import (avoids top-level parseArxml in test file)
// ---------------------------------------------------------------------------

function parseArxmlOrThrow(content: string): ArxmlDocument {
  const result = parseArxml(content);
  if (!result.ok) throw new Error(`parse failed: ${result.error.kind}`);
  return result.value;
}
