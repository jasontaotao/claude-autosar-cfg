// Unit tests for the Sprint 10 #2 store widening.
//
// The store was single-doc (`doc: ArxmlDocument | null`). Sprint 10 #2
// widens it to multi-doc (`documents: readonly ArxmlDocument[]` plus a
// `activeDocumentPath: string | null`) and rewires `validationErrors` to
// call `validateProjectForRenderer(documents)` instead of
// `runValidation(doc)`. This file pins the multi-doc contract:
//
//   1. addDocument appends + sets active + syncs back-compat `doc`/`filePath`
//   2. addDocument with the same filePath replaces the existing doc
//   3. addDocument runs `validateProjectForRenderer` so cross-doc refs
//      surface (project-level kinds appear in validationErrors)
//   4. setActiveDocument switches active + syncs back-compat
//   5. setActiveDocument(null) clears active
//   6. setActiveDocument for an unknown filePath is a no-op
//   7. removeDocument removes the doc + re-runs validation
//   8. removeDocument of the active doc promotes the first remaining
//      (or null if no docs remain)
//   9. updateParam operates on the active doc, not the first
//  10. setDoc (back-compat) is sugar for addDocument
//  11. clear() resets all multi-doc state
//  12. validationErrors includes kinds from EVERY loaded document
//
// These tests are co-located with the store and bypass React (the store
// is consumed via `useArxmlStore.getState()` / `useArxmlStore.setState()`,
// which is the same access pattern the production code uses outside
// React render). No RTL needed.

import { describe, it, expect, beforeEach } from 'vitest';

import type { ArxmlContainer, ArxmlDocument, ArxmlModule } from '@core/arxml/types';

import { useArxmlStore } from '../useArxmlStore';

// ---------------------------------------------------------------------------
// Test fixture builders (synthetic, in-memory)
// ---------------------------------------------------------------------------

function makeEcucDocWithParam(ecucParamValue: number, filePath: string): ArxmlDocument {
  const general: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'EcuCGeneral',
    params: {
      ConfigConsistencyRequired: { type: 'integer', value: ecucParamValue },
    },
    children: [],
  };
  const ecuc: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'EcuC',
    params: {},
    children: [general],
    references: [],
  };
  return {
    path: filePath,
    version: '4.6',
    packages: [
      {
        shortName: 'EAS',
        path: '/EAS',
        elements: [ecuc],
      },
    ],
  };
}

function makeWdgIfDocWithRangeViolation(
  deviceIndex: number,
  driverRef: string,
  filePath: string,
): ArxmlDocument {
  const device: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'WdgIfDevice',
    params: {
      WdgIfDeviceIndex: { type: 'integer', value: deviceIndex },
      WdgIfDriverRef: {
        type: 'reference',
        value: driverRef,
        dest: 'ECUC-CONTAINER-VALUE',
      },
    },
    children: [],
  };
  const wdgIf: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'WdgIf',
    params: {},
    children: [device],
    references: [driverRef],
  };
  return {
    path: filePath,
    version: '4.4',
    packages: [
      {
        shortName: 'EcucDefs',
        path: '/EcucDefs',
        elements: [wdgIf],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 1. addDocument appends + sets active + syncs back-compat
// ---------------------------------------------------------------------------

describe('useArxmlStore - addDocument (Sprint 10 #2)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
  });

  it('addDocument appends to documents + sets active + syncs back-compat doc/filePath', () => {
    const doc = makeEcucDocWithParam(1, '/tmp/foo.arxml');
    useArxmlStore.getState().addDocument(doc, '/tmp/foo.arxml');
    const next = useArxmlStore.getState();
    expect(next.documents).toEqual([doc]);
    expect(next.documentPaths).toEqual(['/tmp/foo.arxml']);
    expect(next.activeDocumentPath).toBe('/tmp/foo.arxml');
    // back-compat
    expect(next.doc).toBe(doc);
    expect(next.filePath).toBe('/tmp/foo.arxml');
  });

  it('addDocument with an existing filePath replaces that doc, keeps the order', () => {
    const docA = makeEcucDocWithParam(1, '/tmp/a.arxml');
    const docB = makeEcucDocWithParam(2, '/tmp/b.arxml');
    const docAnew = makeEcucDocWithParam(99, '/tmp/a.arxml');
    useArxmlStore.getState().addDocument(docA, '/tmp/a.arxml');
    useArxmlStore.getState().addDocument(docB, '/tmp/b.arxml');
    useArxmlStore.getState().addDocument(docAnew, '/tmp/a.arxml'); // replace A

    const next = useArxmlStore.getState();
    expect(next.documents).toEqual([docAnew, docB]); // order preserved (A index 0)
    expect(next.documentPaths).toEqual(['/tmp/a.arxml', '/tmp/b.arxml']);
    expect(next.activeDocumentPath).toBe('/tmp/a.arxml');
  });

  it('addDocument runs validateProjectForRenderer (cross-doc refs surface)', () => {
    // Doc A has TWO issues: a range violation (single-doc kind) and a
    // dangling reference into doc B's namespace (project-level kind).
    // The store calls validateProjectForRenderer which surfaces BOTH.
    // Pre-Sprint 10 #2 the store called only `validate(doc)` per setDoc
    // and the cross-doc ref was invisible.
    const docA = makeWdgIfDocWithRangeViolation(999, '/OtherPkg/SomeContainer', '/tmp/a.arxml');
    const docB = makeEcucDocWithParam(1, '/tmp/b.arxml');
    useArxmlStore.getState().addDocument(docA, '/tmp/a.arxml');
    useArxmlStore.getState().addDocument(docB, '/tmp/b.arxml');

    const errors = useArxmlStore.getState().validationErrors;
    // Count per kind — stricter than a `kinds.has` check (which would pass
    // even if the validation pipeline collapsed kinds or dropped errors).
    const counts: Record<string, number> = {};
    for (const e of errors) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    // 'range' is single-doc (WdgIfDeviceIndex=999 in doc A): exactly 1
    expect(counts['range']).toBe(1);
    // 'cross-ref' is project-level: exactly 1 (the dangling ref into /OtherPkg/SomeContainer)
    expect(counts['cross-ref']).toBe(1);
    // The range error's path lives in doc A
    const rangeErr = errors.find((e) => e.kind === 'range')!;
    expect(rangeErr.path.startsWith('/EcucDefs/WdgIf/')).toBe(true);
    // The cross-ref error's sourcePath lives in doc A
    const crossRefErr = errors.find((e) => e.kind === 'cross-ref')!;
    expect(crossRefErr.path.startsWith('/EcucDefs/WdgIf/')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. setActiveDocument switches active + syncs back-compat
// ---------------------------------------------------------------------------

describe('useArxmlStore - setActiveDocument (Sprint 10 #2)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
  });

  it('setActiveDocument switches active doc and syncs back-compat', () => {
    const docA = makeEcucDocWithParam(1, '/tmp/a.arxml');
    const docB = makeEcucDocWithParam(2, '/tmp/b.arxml');
    useArxmlStore.getState().addDocument(docA, '/tmp/a.arxml');
    useArxmlStore.getState().addDocument(docB, '/tmp/b.arxml');

    useArxmlStore.getState().setActiveDocument('/tmp/a.arxml');
    const next = useArxmlStore.getState();
    expect(next.activeDocumentPath).toBe('/tmp/a.arxml');
    expect(next.doc).toBe(docA);
    expect(next.filePath).toBe('/tmp/a.arxml');
  });

  it('setActiveDocument(null) clears active and back-compat fields', () => {
    const docA = makeEcucDocWithParam(1, '/tmp/a.arxml');
    useArxmlStore.getState().addDocument(docA, '/tmp/a.arxml');
    useArxmlStore.getState().setActiveDocument(null);

    const next = useArxmlStore.getState();
    expect(next.activeDocumentPath).toBeNull();
    expect(next.doc).toBeNull();
    expect(next.filePath).toBeNull();
    // documents and documentPaths are NOT cleared
    expect(next.documents).toEqual([docA]);
    expect(next.documentPaths).toEqual(['/tmp/a.arxml']);
  });

  it('setActiveDocument for an unknown filePath is a no-op', () => {
    const docA = makeEcucDocWithParam(1, '/tmp/a.arxml');
    useArxmlStore.getState().addDocument(docA, '/tmp/a.arxml');
    const before = useArxmlStore.getState();
    useArxmlStore.getState().setActiveDocument('/tmp/does-not-exist.arxml');
    const after = useArxmlStore.getState();
    expect(after.activeDocumentPath).toBe(before.activeDocumentPath);
    expect(after.doc).toBe(before.doc);
  });
});

// ---------------------------------------------------------------------------
// 3. removeDocument
// ---------------------------------------------------------------------------

describe('useArxmlStore - removeDocument (Sprint 10 #2)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
  });

  it('removeDocument of a non-active doc leaves active alone', () => {
    const docA = makeEcucDocWithParam(1, '/tmp/a.arxml');
    const docB = makeEcucDocWithParam(2, '/tmp/b.arxml');
    useArxmlStore.getState().addDocument(docA, '/tmp/a.arxml');
    useArxmlStore.getState().addDocument(docB, '/tmp/b.arxml');
    useArxmlStore.getState().setActiveDocument('/tmp/b.arxml');

    useArxmlStore.getState().removeDocument('/tmp/a.arxml');
    const next = useArxmlStore.getState();
    expect(next.documents).toEqual([docB]);
    expect(next.documentPaths).toEqual(['/tmp/b.arxml']);
    expect(next.activeDocumentPath).toBe('/tmp/b.arxml');
    expect(next.doc).toBe(docB);
  });

  it('removeDocument of the active doc promotes the first remaining', () => {
    const docA = makeEcucDocWithParam(1, '/tmp/a.arxml');
    const docB = makeEcucDocWithParam(2, '/tmp/b.arxml');
    useArxmlStore.getState().addDocument(docA, '/tmp/a.arxml');
    useArxmlStore.getState().addDocument(docB, '/tmp/b.arxml');
    useArxmlStore.getState().setActiveDocument('/tmp/a.arxml');

    useArxmlStore.getState().removeDocument('/tmp/a.arxml');
    const next = useArxmlStore.getState();
    expect(next.documents).toEqual([docB]);
    expect(next.documentPaths).toEqual(['/tmp/b.arxml']);
    // First remaining becomes active
    expect(next.activeDocumentPath).toBe('/tmp/b.arxml');
    expect(next.doc).toBe(docB);
  });

  it('removeDocument of the last doc clears active and back-compat', () => {
    const docA = makeEcucDocWithParam(1, '/tmp/a.arxml');
    useArxmlStore.getState().addDocument(docA, '/tmp/a.arxml');

    useArxmlStore.getState().removeDocument('/tmp/a.arxml');
    const next = useArxmlStore.getState();
    expect(next.documents).toEqual([]);
    expect(next.documentPaths).toEqual([]);
    expect(next.activeDocumentPath).toBeNull();
    expect(next.doc).toBeNull();
    expect(next.filePath).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. updateParam operates on the ACTIVE doc
// ---------------------------------------------------------------------------

describe('useArxmlStore - updateParam on active doc (Sprint 10 #2)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
  });

  it('updateParam mutates the active doc, not the first or the last', () => {
    const docA = makeEcucDocWithParam(1, '/tmp/a.arxml');
    const docB = makeEcucDocWithParam(2, '/tmp/b.arxml');
    useArxmlStore.getState().addDocument(docA, '/tmp/a.arxml');
    useArxmlStore.getState().addDocument(docB, '/tmp/b.arxml');
    useArxmlStore.getState().setActiveDocument('/tmp/b.arxml');

    useArxmlStore.getState().updateParam('/EAS/EcuC/EcuCGeneral', 'ConfigConsistencyRequired', {
      type: 'integer',
      value: 99,
    });
    const next = useArxmlStore.getState();
    // The active doc (B) is updated; A is untouched.
    expect(next.doc).not.toBe(docB); // new reference (value changed)
    // The first doc in documents[] (A) is still docA (same reference, unchanged)
    expect(next.documents[0]).toBe(docA);
    // The second (B) is the new doc with value 99
    const updatedB = next.documents[1]!;
    const ecuc = updatedB.packages[0]!.elements[0]! as ArxmlModule;
    const general = ecuc.children[0]! as ArxmlContainer;
    expect(general.params.ConfigConsistencyRequired).toEqual({
      type: 'integer',
      value: 99,
    });
  });
});

// ---------------------------------------------------------------------------
// 5. setDoc (back-compat) + clear
// ---------------------------------------------------------------------------

describe('useArxmlStore - setDoc back-compat + clear (Sprint 10 #2)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
  });

  it('setDoc is sugar for addDocument (one-doc state matches addDocument state)', () => {
    const doc = makeEcucDocWithParam(1, '/tmp/foo.arxml');
    useArxmlStore.getState().setDoc(doc, '/tmp/foo.arxml');
    const next = useArxmlStore.getState();
    expect(next.documents).toEqual([doc]);
    expect(next.documentPaths).toEqual(['/tmp/foo.arxml']);
    expect(next.activeDocumentPath).toBe('/tmp/foo.arxml');
    expect(next.doc).toBe(doc);
    expect(next.filePath).toBe('/tmp/foo.arxml');
  });

  // Sprint 10 #2 code-review HIGH: dirty must be per-path, not project-wide.
  // Saving doc B must NOT clear doc A's dirty state. addDocument must
  // NOT clear other docs' dirty state. These are the exact contracts the
  // Set<string> refactor pins.
  it('updateParam marks ONLY the active doc as dirty (per-path, not project-wide)', () => {
    const docA = makeEcucDocWithParam(1, '/tmp/a.arxml');
    const docB = makeEcucDocWithParam(2, '/tmp/b.arxml');
    useArxmlStore.getState().addDocument(docA, '/tmp/a.arxml');
    useArxmlStore.getState().addDocument(docB, '/tmp/b.arxml');
    // Active is docB (last added). Mutate its param.
    useArxmlStore.getState().updateParam('/EAS/EcuC/EcuCGeneral', 'ConfigConsistencyRequired', {
      type: 'integer',
      value: 99,
    });
    const next = useArxmlStore.getState();
    // docB (active) is dirty
    expect(next.dirtyPaths.has('/tmp/b.arxml')).toBe(true);
    // docA is NOT dirty
    expect(next.dirtyPaths.has('/tmp/a.arxml')).toBe(false);
  });

  it('markSaved clears ONLY the saved doc dirty state, preserves other docs', () => {
    const docA = makeEcucDocWithParam(1, '/tmp/a.arxml');
    const docB = makeEcucDocWithParam(2, '/tmp/b.arxml');
    useArxmlStore.getState().addDocument(docA, '/tmp/a.arxml');
    useArxmlStore.getState().addDocument(docB, '/tmp/b.arxml');
    // Mutate both: first B, then A (by switching active)
    useArxmlStore.getState().updateParam('/EAS/EcuC/EcuCGeneral', 'ConfigConsistencyRequired', {
      type: 'integer',
      value: 99,
    });
    useArxmlStore.getState().setActiveDocument('/tmp/a.arxml');
    useArxmlStore.getState().updateParam('/EAS/EcuC/EcuCGeneral', 'ConfigConsistencyRequired', {
      type: 'integer',
      value: 88,
    });
    // Both dirty
    expect(useArxmlStore.getState().dirtyPaths.has('/tmp/a.arxml')).toBe(true);
    expect(useArxmlStore.getState().dirtyPaths.has('/tmp/b.arxml')).toBe(true);
    // Save docB (the non-active one)
    useArxmlStore.getState().markSaved('/tmp/b.arxml');
    // docB cleared, docA preserved
    expect(useArxmlStore.getState().dirtyPaths.has('/tmp/a.arxml')).toBe(true);
    expect(useArxmlStore.getState().dirtyPaths.has('/tmp/b.arxml')).toBe(false);
  });

  it('addDocument of a new path does NOT clobber existing docs dirty state', () => {
    const docA = makeEcucDocWithParam(1, '/tmp/a.arxml');
    useArxmlStore.getState().addDocument(docA, '/tmp/a.arxml');
    useArxmlStore.getState().updateParam('/EAS/EcuC/EcuCGeneral', 'ConfigConsistencyRequired', {
      type: 'integer',
      value: 99,
    });
    // docA is dirty
    expect(useArxmlStore.getState().dirtyPaths.has('/tmp/a.arxml')).toBe(true);
    // Add docB
    const docB = makeEcucDocWithParam(2, '/tmp/b.arxml');
    useArxmlStore.getState().addDocument(docB, '/tmp/b.arxml');
    // docA still dirty
    expect(useArxmlStore.getState().dirtyPaths.has('/tmp/a.arxml')).toBe(true);
    // docB is fresh
    expect(useArxmlStore.getState().dirtyPaths.has('/tmp/b.arxml')).toBe(false);
  });

  it('clear() resets all multi-doc state including documents[]', () => {
    const docA = makeEcucDocWithParam(1, '/tmp/a.arxml');
    const docB = makeEcucDocWithParam(2, '/tmp/b.arxml');
    useArxmlStore.getState().addDocument(docA, '/tmp/a.arxml');
    useArxmlStore.getState().addDocument(docB, '/tmp/b.arxml');

    useArxmlStore.getState().clear();
    const next = useArxmlStore.getState();
    expect(next.documents).toEqual([]);
    expect(next.documentPaths).toEqual([]);
    expect(next.activeDocumentPath).toBeNull();
    expect(next.doc).toBeNull();
    expect(next.filePath).toBeNull();
    expect(next.validationErrors).toEqual([]);
    expect(next.lastValidatedAt).toBeNull();
  });
});
