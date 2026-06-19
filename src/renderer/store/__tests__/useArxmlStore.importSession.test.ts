// @vitest-environment jsdom
//
// Sprint 14 ECUC ARXML Import — Phase 3 store tests.
//
// Covers T6-T9 from the plan. Each task is gated on the previous one
// (startImport must exist before the others). The test file is built
// up RED → GREEN per task; the implementation in `useArxmlStore.ts`
// mirrors the same ordering.
//
// State machine (spec §6.3):
//   null → startImport → session + viewMode='import-merged'
//   session + openDiff → activeModuleForDiff set
//   session + commitImport → documents updated, session null, viewMode='single'
//   session + cancelImport → session null, viewMode='single', docs unchanged

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArxmlContainer, ArxmlDocument, ArxmlModule } from '@core/arxml/types';
import type { ImportError, ImportResolution } from '@core/import/types';

import { useArxmlStore } from '../useArxmlStore';

function makeContainer(shortName: string): ArxmlContainer {
  return {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName,
    params: {},
    children: [],
  };
}

function makeModule(shortName: string, containerShortName?: string): ArxmlModule {
  return {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName,
    params: {},
    children: containerShortName !== undefined ? [makeContainer(containerShortName)] : [],
    references: [],
  };
}

function makeDoc(filePath: string, modules: readonly ArxmlModule[]): ArxmlDocument {
  return {
    path: filePath,
    version: '4.6',
    packages: [
      {
        shortName: 'EAS',
        path: '/EAS',
        elements: modules.map((m) => m as ArxmlModule),
      },
    ],
  };
}

describe('useArxmlStore — ImportSession (Sprint 14 / Phase 3)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
  });

  // -------------------------------------------------------------------------
  // T6 — startImport
  // -------------------------------------------------------------------------

  describe('T6 — startImport', () => {
    it('startImport builds a session: incomingDocs + originalPaths + selections + viewMode', () => {
      const store = useArxmlStore.getState();
      const doc = makeDoc('/in/Can.arxml', [makeModule('Can', 'CanConfig')]);
      store.startImport([doc], ['/in/Can.arxml']);

      const next = useArxmlStore.getState();
      expect(next.importSession).not.toBeNull();
      if (next.importSession === null) throw new Error('expected importSession');
      expect(next.importSession.incomingDocs).toEqual([doc]);
      expect(next.importSession.originalPaths).toEqual(['/in/Can.arxml']);
      expect(next.importSession.selections).toHaveLength(1);
      const sel = next.importSession.selections[0]!;
      expect(sel.mergedModulePath).toBe('/[import:0]/EAS/Can');
      expect(sel.sourceDocIndex).toBe(0);
      expect(sel.moduleShortName).toBe('Can');
      expect(sel.selected).toBe(true);
      // No collision when no target doc loaded.
      expect(sel.collidesWithTarget).toBe(false);
      expect(sel.targetModulePath).toBeNull();
      expect(next.importSession.resolutions).toEqual([]);
      expect(next.importSession.activeModuleForDiff).toBeNull();
      expect(next.importSession.id).toMatch(/^import-/);
      expect(typeof next.importSession.createdAt).toBe('number');
      expect(next.viewMode).toBe('import-merged');
    });

    it('startImport does NOT mutate the loaded target documents', () => {
      const store = useArxmlStore.getState();
      const target = makeDoc('/proj/Target.arxml', [makeModule('Adc', 'AdcConfig')]);
      store.setDoc(target, '/proj/Target.arxml');
      const incoming = makeDoc('/in/Can.arxml', [makeModule('Can', 'CanConfig')]);
      const targetBefore = useArxmlStore.getState().documents[0];
      store.startImport([incoming], ['/in/Can.arxml']);
      const next = useArxmlStore.getState();
      // Target doc still in store, same reference (immutable).
      expect(next.documents).toHaveLength(1);
      expect(next.documents[0]).toBe(targetBefore);
      // Incoming NOT added to the document set (importSession holds it).
      expect(next.documentPaths).toEqual(['/proj/Target.arxml']);
    });

    it('startImport detects collisions against existing target modules', () => {
      const store = useArxmlStore.getState();
      const target = makeDoc('/proj/Target.arxml', [makeModule('Can', 'TargetCanConfig')]);
      store.setDoc(target, '/proj/Target.arxml');
      const incoming = makeDoc('/in/Can.arxml', [makeModule('Can', 'IncomingCanConfig')]);
      store.startImport([incoming], ['/in/Can.arxml']);
      const next = useArxmlStore.getState();
      const sel = next.importSession?.selections[0]!;
      expect(sel.collidesWithTarget).toBe(true);
      expect(sel.targetModulePath).toBe('/EAS/Can');
    });

    it('startImport iterates every module in every incoming doc (multi-module)', () => {
      const store = useArxmlStore.getState();
      const incoming = makeDoc('/in/Can.arxml', [
        makeModule('Can', 'CanConfig'),
        makeModule('Adc', 'AdcConfig'),
      ]);
      store.startImport([incoming], ['/in/Can.arxml']);
      const next = useArxmlStore.getState();
      expect(next.importSession?.selections).toHaveLength(2);
      const shortNames = next.importSession?.selections.map((s) => s.moduleShortName).sort();
      expect(shortNames).toEqual(['Adc', 'Can']);
    });
  });

  // -------------------------------------------------------------------------
  // T7 — selectModule / resolveModule / openDiff / closeDiff / undoInternal
  // -------------------------------------------------------------------------

  describe('T7 — selections / resolutions / openDiff / undoInternal', () => {
    function setupSession(): void {
      const store = useArxmlStore.getState();
      const incoming = makeDoc('/in/Can.arxml', [makeModule('Can', 'CanConfig')]);
      store.startImport([incoming], ['/in/Can.arxml']);
    }

    it('selectModule flips the selected flag for the matching selection', () => {
      setupSession();
      const path = useArxmlStore.getState().importSession!.selections[0]!.mergedModulePath;
      useArxmlStore.getState().selectModule(path, false);
      expect(useArxmlStore.getState().importSession!.selections[0]!.selected).toBe(false);
      useArxmlStore.getState().selectModule(path, true);
      expect(useArxmlStore.getState().importSession!.selections[0]!.selected).toBe(true);
    });

    it('resolveModule adds or replaces a resolution for the given merged path', () => {
      setupSession();
      const path = useArxmlStore.getState().importSession!.selections[0]!.mergedModulePath;
      useArxmlStore.getState().resolveModule(path, 'keep-existing');
      expect(useArxmlStore.getState().importSession!.resolutions).toEqual([
        { mergedModulePath: path, resolution: 'keep-existing' },
      ]);
      useArxmlStore.getState().resolveModule(path, 'overwrite');
      const rs = useArxmlStore.getState().importSession!.resolutions;
      expect(rs).toHaveLength(1);
      expect(rs[0]!.resolution).toBe('overwrite');
    });

    it('resolveModule accepts an optional containerResolutions map and stores it', () => {
      setupSession();
      const path = useArxmlStore.getState().importSession!.selections[0]!.mergedModulePath;
      const containerMap = new Map<string, ImportResolution>([
        ['/EAS/Can/CanConfig', 'keep-both'],
      ]);
      useArxmlStore.getState().resolveModule(path, 'overwrite', containerMap);
      const r = useArxmlStore.getState().importSession!.resolutions[0]!;
      expect(r.containerResolutions).toBe(containerMap);
    });

    it('openDiff sets activeModuleForDiff; closeDiff clears it', () => {
      setupSession();
      const path = useArxmlStore.getState().importSession!.selections[0]!.mergedModulePath;
      expect(useArxmlStore.getState().importSession!.activeModuleForDiff).toBeNull();
      useArxmlStore.getState().openDiff(path);
      expect(useArxmlStore.getState().importSession!.activeModuleForDiff).toBe(path);
      useArxmlStore.getState().closeDiff();
      expect(useArxmlStore.getState().importSession!.activeModuleForDiff).toBeNull();
    });

    it('undoInternal pops the most recent resolution change and reverts it', () => {
      setupSession();
      const path = useArxmlStore.getState().importSession!.selections[0]!.mergedModulePath;
      useArxmlStore.getState().resolveModule(path, 'overwrite');
      useArxmlStore.getState().resolveModule(path, 'keep-existing');
      expect(useArxmlStore.getState().importSession!.resolutions[0]!.resolution).toBe(
        'keep-existing',
      );
      useArxmlStore.getState().undoInternal();
      // back to 'overwrite'
      expect(useArxmlStore.getState().importSession!.resolutions[0]!.resolution).toBe('overwrite');
    });

    it('undoInternal is a no-op when the undoStack is empty', () => {
      setupSession();
      const before = useArxmlStore.getState().importSession;
      useArxmlStore.getState().undoInternal();
      const after = useArxmlStore.getState().importSession;
      // No state change.
      expect(after).toBe(before);
    });
  });

  // -------------------------------------------------------------------------
  // T8 — commitImport (atomic snapshot+rollback)
  // -------------------------------------------------------------------------

  describe('T8 — commitImport', () => {
    it('commitImport returns no-modules-selected when no module is selected', () => {
      const store = useArxmlStore.getState();
      const incoming = makeDoc('/in/Can.arxml', [makeModule('Can', 'CanConfig')]);
      store.startImport([incoming], ['/in/Can.arxml']);
      // unselect everything
      for (const sel of useArxmlStore.getState().importSession!.selections) {
        useArxmlStore.getState().selectModule(sel.mergedModulePath, false);
      }
      const result = useArxmlStore.getState().commitImport();
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('expected fail');
      const err: ImportError = result.error;
      expect(err.kind).toBe('no-modules-selected');
      // importSession preserved.
      expect(useArxmlStore.getState().importSession).not.toBeNull();
    });

    it('commitImport updates documents, clears session, sets viewMode="single", dirtyPaths += sourceFilesTouched', () => {
      const store = useArxmlStore.getState();
      const target = makeDoc('/proj/Target.arxml', [makeModule('Adc', 'AdcConfig')]);
      store.setDoc(target, '/proj/Target.arxml');
      const incoming = makeDoc('/in/Can.arxml', [makeModule('Can', 'CanConfig')]);
      store.startImport([incoming], ['/in/Can.arxml']);
      const result = useArxmlStore.getState().commitImport();
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('expected ok');
      expect(result.value.sourceFilesTouched).toEqual(['/proj/Target.arxml']);

      const next = useArxmlStore.getState();
      expect(next.importSession).toBeNull();
      expect(next.viewMode).toBe('single');
      expect(next.dirtyPaths.has('/proj/Target.arxml')).toBe(true);
      // target doc has 2 modules now (Adc + Can).
      const targetDoc = next.documents.find((d) => d.path === '/proj/Target.arxml');
      const modules = targetDoc?.packages[0]?.elements.filter((e) => e.kind === 'module') ?? [];
      expect(modules).toHaveLength(2);
      // lastCommitSnapshot saved (1 entry — the pre-commit target).
      expect(next.lastCommitSnapshot).not.toBeNull();
      expect(next.lastCommitSnapshot!.has('/proj/Target.arxml')).toBe(true);
    });

    it('commitImport rollback via spy: when apply throws, importSession + documents are preserved', async () => {
      const patchModule = await import('@core/import/patch.js');
      const spy = vi
        .spyOn(patchModule, 'applyPatchesToDocument')
        .mockImplementation((_doc, _ops) => {
          throw new Error('forced patch failure for rollback test');
        });
      try {
        const store = useArxmlStore.getState();
        const target = makeDoc('/proj/Target.arxml', [makeModule('Adc', 'AdcConfig')]);
        store.setDoc(target, '/proj/Target.arxml');
        const docsBefore = useArxmlStore.getState().documents;
        const incoming = makeDoc('/in/Can.arxml', [makeModule('Can', 'CanConfig')]);
        store.startImport([incoming], ['/in/Can.arxml']);
        const result = useArxmlStore.getState().commitImport();
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error('expected fail');
        expect(result.error.kind).toBe('patch-apply-failed');
        if (result.error.kind !== 'patch-apply-failed') {
          throw new Error('expected patch-apply-failed');
        }
        expect(result.error.sourceFile).toBe('/proj/Target.arxml');
        const next = useArxmlStore.getState();
        // importSession preserved, docs unchanged.
        expect(next.importSession).not.toBeNull();
        expect(next.documents).toBe(docsBefore);
        // lastCommitSnapshot stays null.
        expect(next.lastCommitSnapshot).toBeNull();
      } finally {
        spy.mockRestore();
      }
    });
  });

  // -------------------------------------------------------------------------
  // T9 — cancelImport / undoLastCommit / isDirty extension
  // -------------------------------------------------------------------------

  describe('T9 — cancelImport / undoLastCommit / isDirty', () => {
    it('cancelImport clears the session and returns viewMode to "single"', () => {
      const store = useArxmlStore.getState();
      const incoming = makeDoc('/in/Can.arxml', [makeModule('Can', 'CanConfig')]);
      store.startImport([incoming], ['/in/Can.arxml']);
      expect(useArxmlStore.getState().importSession).not.toBeNull();
      useArxmlStore.getState().cancelImport();
      const next = useArxmlStore.getState();
      expect(next.importSession).toBeNull();
      expect(next.viewMode).toBe('single');
    });

    it('cancelImport does not mutate loaded target documents', () => {
      const store = useArxmlStore.getState();
      const target = makeDoc('/proj/Target.arxml', [makeModule('Adc', 'AdcConfig')]);
      store.setDoc(target, '/proj/Target.arxml');
      const incoming = makeDoc('/in/Can.arxml', [makeModule('Can', 'CanConfig')]);
      store.startImport([incoming], ['/in/Can.arxml']);
      const docsBefore = useArxmlStore.getState().documents;
      useArxmlStore.getState().cancelImport();
      const next = useArxmlStore.getState();
      expect(next.documents).toBe(docsBefore);
      // No dirty state added.
      expect(next.dirtyPaths.size).toBe(0);
    });

    it('undoLastCommit restores documents from lastCommitSnapshot and clears dirtyPaths for those files', () => {
      const store = useArxmlStore.getState();
      const target = makeDoc('/proj/Target.arxml', [makeModule('Adc', 'AdcConfig')]);
      store.setDoc(target, '/proj/Target.arxml');
      const incoming = makeDoc('/in/Can.arxml', [makeModule('Can', 'CanConfig')]);
      store.startImport([incoming], ['/in/Can.arxml']);
      const r = useArxmlStore.getState().commitImport();
      expect(r.ok).toBe(true);
      expect(useArxmlStore.getState().dirtyPaths.has('/proj/Target.arxml')).toBe(true);
      const modulesAfter = useArxmlStore
        .getState()
        .documents.find((d) => d.path === '/proj/Target.arxml')!
        .packages[0]!.elements.filter((e) => e.kind === 'module');
      expect(modulesAfter).toHaveLength(2);

      useArxmlStore.getState().undoLastCommit();
      const next = useArxmlStore.getState();
      expect(next.dirtyPaths.has('/proj/Target.arxml')).toBe(false);
      const modulesUndone = next.documents
        .find((d) => d.path === '/proj/Target.arxml')!
        .packages[0]!.elements.filter((e) => e.kind === 'module');
      expect(modulesUndone).toHaveLength(1);
      expect(next.lastCommitSnapshot).toBeNull();
    });

    it('undoLastCommit is a no-op when there is no snapshot', () => {
      const store = useArxmlStore.getState();
      const target = makeDoc('/proj/Target.arxml', [makeModule('Adc', 'AdcConfig')]);
      store.setDoc(target, '/proj/Target.arxml');
      const docsBefore = useArxmlStore.getState().documents;
      useArxmlStore.getState().undoLastCommit();
      expect(useArxmlStore.getState().documents).toBe(docsBefore);
    });

    it('isDirty() returns true when importSession is non-null (no dirtyPaths)', () => {
      const store = useArxmlStore.getState();
      expect(useArxmlStore.getState().isDirty()).toBe(false);
      const incoming = makeDoc('/in/Can.arxml', [makeModule('Can', 'CanConfig')]);
      store.startImport([incoming], ['/in/Can.arxml']);
      expect(useArxmlStore.getState().isDirty()).toBe(true);
      useArxmlStore.getState().cancelImport();
      expect(useArxmlStore.getState().isDirty()).toBe(false);
    });

    it('isDirty() returns true when dirtyPaths is non-empty (no importSession)', () => {
      const store = useArxmlStore.getState();
      const target = makeDoc('/proj/Target.arxml', [makeModule('Adc', 'AdcConfig')]);
      store.setDoc(target, '/proj/Target.arxml');
      useArxmlStore
        .getState()
        .updateParam('/EAS/Adc/AdcConfig', 'p', { type: 'integer', value: 1 });
      expect(useArxmlStore.getState().isDirty()).toBe(true);
    });
  });
});
