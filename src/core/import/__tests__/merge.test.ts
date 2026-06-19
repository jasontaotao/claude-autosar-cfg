// Sprint 14 ECUC ARXML Import — buildMergedView tests.
// Spec §8.2 merge.test.ts — ≥6 cases.

import { describe, it, expect } from 'vitest';

import { buildMergedView } from '../merge.js';
import type { ArxmlDocument, ArxmlModule } from '../../arxml/types.js';
import type {
  ImportResolution,
  ImportSession,
  ModuleResolution,
  ModuleSelection,
} from '../types.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const MOD_TAG = 'ECUC-MODULE-CONFIGURATION-VALUES';

function makeModule(shortName: string): ArxmlModule {
  return {
    kind: 'module',
    tagName: MOD_TAG,
    shortName,
    params: {},
    children: [],
    references: [],
  };
}

function makeDoc(path: string, modules: ArxmlModule[]): ArxmlDocument {
  return {
    path,
    version: '4.6',
    packages: [
      {
        shortName: 'Pkg',
        path: '/Pkg',
        elements: modules,
      },
    ],
  };
}

function makeSelection(overrides: Partial<ModuleSelection> = {}): ModuleSelection {
  return {
    mergedModulePath: '/[import:0]/Pkg/Can',
    sourceDocIndex: 0,
    moduleShortName: 'Can',
    selected: true,
    collidesWithTarget: false,
    targetModulePath: null,
    ...overrides,
  };
}

function makeResolution(
  mergedModulePath: string,
  resolution: ImportResolution,
): ModuleResolution {
  return { mergedModulePath, resolution };
}

function makeSession(parts: Partial<ImportSession>): ImportSession {
  return {
    id: 'sess-1',
    incomingDocs: [],
    originalPaths: [],
    selections: [],
    resolutions: [],
    activeModuleForDiff: null,
    createdAt: 0,
    ...parts,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Sprint 14 — merge: buildMergedView', () => {
  it('case 1: single doc, single module, no resolutions — view is empty-merged when none selected', () => {
    // Arrange
    const target = makeDoc('/target.arxml', [makeModule('Can')]);
    const session = makeSession({
      incomingDocs: [makeDoc('/incoming.arxml', [makeModule('Can')])],
      originalPaths: ['/incoming.arxml'],
      selections: [
        makeSelection({ mergedModulePath: '/[import:0]/Pkg/Can', selected: false }),
      ],
    });

    // Act
    const view = buildMergedView([target], session);

    // Assert — only target modules surfaced; incoming unselected ones
    // are kept in the view metadata for round-tripping, not rendered
    // as merged modules.
    expect(view.targetDocuments).toEqual([target]);
    // selected=false → not in mergedModules
    expect(view.mergedModules.find((m) => m.shortName === 'Can')).toBeUndefined();
  });

  it('case 2: multi-doc, distinct modules, no collision — both render in merged view with import prefix', () => {
    // Arrange
    const target = makeDoc('/target.arxml', []);
    const incoming1 = makeDoc('/a.arxml', [makeModule('A')]);
    const incoming2 = makeDoc('/b.arxml', [makeModule('B')]);
    const session = makeSession({
      incomingDocs: [incoming1, incoming2],
      originalPaths: ['/a.arxml', '/b.arxml'],
      selections: [
        makeSelection({
          mergedModulePath: '/[import:0]/Pkg/A',
          sourceDocIndex: 0,
          moduleShortName: 'A',
          selected: true,
        }),
        makeSelection({
          mergedModulePath: '/[import:1]/Pkg/B',
          sourceDocIndex: 1,
          moduleShortName: 'B',
          selected: true,
        }),
      ],
    });

    // Act
    const view = buildMergedView([target], session);

    // Assert
    expect(view.mergedModules).toHaveLength(2);
    const names = view.mergedModules.map((m) => m.shortName).sort();
    expect(names).toEqual(['A', 'B']);
    // The [import:N] prefix is preserved
    expect(view.mergedModules.some((m) => m.mergedModulePath.startsWith('/[import:0]/'))).toBe(true);
    expect(view.mergedModules.some((m) => m.mergedModulePath.startsWith('/[import:1]/'))).toBe(true);
  });

  it('case 3: collision with resolution=overwrite — incoming takes the slot', () => {
    // Arrange
    const target = makeDoc('/target.arxml', [makeModule('Can')]);
    const incoming = makeDoc('/incoming.arxml', [makeModule('Can')]);
    const mergedPath = '/[import:0]/Pkg/Can';
    const session = makeSession({
      incomingDocs: [incoming],
      originalPaths: ['/incoming.arxml'],
      selections: [
        makeSelection({
          mergedModulePath: mergedPath,
          sourceDocIndex: 0,
          moduleShortName: 'Can',
          selected: true,
          collidesWithTarget: true,
          targetModulePath: '/Pkg/Can',
        }),
      ],
      resolutions: [makeResolution(mergedPath, 'overwrite')],
    });

    // Act
    const view = buildMergedView([target], session);

    // Assert — merged view carries the incoming module as the chosen
    // representation; collision flag surfaces in the metadata.
    const m = view.mergedModules.find((x) => x.shortName === 'Can');
    expect(m).toBeDefined();
    expect(m?.collidesWithTarget).toBe(true);
    expect(m?.targetModulePath).toBe('/Pkg/Can');
  });

  it('case 4: collision with resolution=keep-both — both exist in view; incoming carries _imported suffix', () => {
    // Arrange
    const target = makeDoc('/target.arxml', [makeModule('Can')]);
    const incoming = makeDoc('/incoming.arxml', [makeModule('Can')]);
    const mergedPath = '/[import:0]/Pkg/Can';
    const session = makeSession({
      incomingDocs: [incoming],
      originalPaths: ['/incoming.arxml'],
      selections: [
        makeSelection({
          mergedModulePath: mergedPath,
          sourceDocIndex: 0,
          moduleShortName: 'Can',
          selected: true,
          collidesWithTarget: true,
        }),
      ],
      resolutions: [makeResolution(mergedPath, 'keep-both')],
    });

    // Act
    const view = buildMergedView([target], session);

    // Assert — the chosen name for incoming is Can_imported
    const incomingEntry = view.mergedModules.find((x) => x.shortName === 'Can_imported');
    expect(incomingEntry).toBeDefined();
    expect(incomingEntry?.collidesWithTarget).toBe(true);
  });

  it('case 5: collision with resolution=skip — module absent from view', () => {
    // Arrange
    const target = makeDoc('/target.arxml', [makeModule('Can')]);
    const incoming = makeDoc('/incoming.arxml', [makeModule('Can')]);
    const mergedPath = '/[import:0]/Pkg/Can';
    const session = makeSession({
      incomingDocs: [incoming],
      originalPaths: ['/incoming.arxml'],
      selections: [
        makeSelection({
          mergedModulePath: mergedPath,
          sourceDocIndex: 0,
          moduleShortName: 'Can',
          selected: true,
          collidesWithTarget: true,
        }),
      ],
      resolutions: [makeResolution(mergedPath, 'skip')],
    });

    // Act
    const view = buildMergedView([target], session);

    // Assert — skip ⇒ not in mergedModules
    expect(view.mergedModules.find((x) => x.shortName === 'Can')).toBeUndefined();
    expect(view.mergedModules.find((x) => x.shortName === 'Can_imported')).toBeUndefined();
  });

  it('case 6: missing resolution defaults to overwrite (commit-time confirm flow)', () => {
    // Arrange — user did not open the diff, so no resolution in the
    // map. buildMergedView should still surface the module, treating
    // the missing entry as 'overwrite'.
    const target = makeDoc('/target.arxml', [makeModule('Can')]);
    const incoming = makeDoc('/incoming.arxml', [makeModule('Can')]);
    const mergedPath = '/[import:0]/Pkg/Can';
    const session = makeSession({
      incomingDocs: [incoming],
      originalPaths: ['/incoming.arxml'],
      selections: [
        makeSelection({
          mergedModulePath: mergedPath,
          sourceDocIndex: 0,
          moduleShortName: 'Can',
          selected: true,
          collidesWithTarget: true,
        }),
      ],
      // no resolutions entry
    });

    // Act
    const view = buildMergedView([target], session);

    // Assert — module shows up with its metadata; default is overwrite
    // which the caller's commit-confirm flow will surface to the user.
    const m = view.mergedModules.find((x) => x.shortName === 'Can');
    expect(m).toBeDefined();
    expect(m?.selected).toBe(true);
  });

  it('preserves the originalIncomingDocs reference (for round-trip / undoLastCommit)', () => {
    // Arrange
    const target = makeDoc('/target.arxml', []);
    const incoming = makeDoc('/incoming.arxml', [makeModule('A')]);
    const session = makeSession({
      incomingDocs: [incoming],
      originalPaths: ['/incoming.arxml'],
      selections: [
        makeSelection({
          mergedModulePath: '/[import:0]/Pkg/A',
          sourceDocIndex: 0,
          moduleShortName: 'A',
          selected: true,
        }),
      ],
    });

    // Act
    const view = buildMergedView([target], session);

    // Assert
    expect(view.originalIncomingDocs).toEqual([incoming]);
  });

  it('returns an empty mergedModules array for an empty session', () => {
    const target = makeDoc('/target.arxml', []);
    const session = makeSession({});

    const view = buildMergedView([target], session);

    expect(view.mergedModules).toEqual([]);
    expect(view.targetDocuments).toEqual([target]);
  });
});
