// Unit tests for the Sprint 13 Stage 3.5 (Combined Tree View) store widening.
//
// The store gains a `viewMode: 'single' | 'combined'` field plus a
// derived `displayDoc` slot. In `'single'` mode `displayDoc` is the
// legacy `doc` (active document); in `'combined'` mode it is a
// synthesised virtual ArxmlDocument whose top-level packages are
// per-file basenames and child paths are prefixed with the source
// file's basename (or `[doc:N]` for same-basename duplicates).
//
// `setViewMode` toggles between the two and resets `selectedPath` so
// stale paths from the previous mode don't leak into the new view.
// `updateParam` in combined mode must route the mutation to the
// correct source document via the basename prefix on `selectedPath`.
//
// These tests are co-located with the store and bypass React (the store
// is consumed via `useArxmlStore.getState()`, which is the same access
// pattern the production code uses outside React render). No RTL
// needed.

import { describe, it, expect, beforeEach } from 'vitest';

import type { ArxmlContainer, ArxmlDocument, ArxmlModule } from '@core/arxml/types';

import { resolveContainerTarget, useArxmlStore } from '../useArxmlStore';

function makeDoc(
  filePath: string,
  moduleShortName: string,
  containerShortName: string,
): ArxmlDocument {
  const container: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: containerShortName,
    params: {
      TestParam: { type: 'integer', value: 0 },
    },
    children: [],
  };
  const module: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: moduleShortName,
    params: {},
    children: [container],
    references: [],
  };
  return {
    path: filePath,
    version: '4.6',
    packages: [
      {
        shortName: 'EAS',
        path: '/EAS',
        elements: [module],
      },
    ],
  };
}

describe('useArxmlStore — Combined Tree View (Stage 3.5)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
  });

  it('viewMode defaults to "single" and displayDoc equals active doc', () => {
    const state = useArxmlStore.getState();
    expect(state.viewMode).toBe('single');
    // displayDoc is the new derived field; in single mode it is the active doc.
    expect(state.displayDoc).toBe(state.doc);
  });

  it('setViewMode("combined") synthesises a virtual displayDoc; no collision → flat (no wrapper)', () => {
    // Sprint 16 — smart basename-wrapper skip: when no basename AND no
    // module-shortName collision exists, the combined view renders the
    // documents' own root packages directly (no per-file '<filename>'
    // wrapper). Adc and Can have unique module shortNames, so the
    // displayDoc packages should be the doc root 'EAS' (deduped to one
    // because the docs share a root package shortName but not a module
    // shortName — collision detection only flags module / basename dups,
    // and the docs' root package 'EAS' is NOT a collision per the
    // current heuristic. Two entries are kept, one per doc, because we
    // never merge packages across docs).
    const store = useArxmlStore.getState();
    store.setDoc(makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig'), '/tmp/Adc.arxml');
    store.addDocument(makeDoc('/tmp/Can.arxml', 'Can', 'CanConfig'), '/tmp/Can.arxml');
    useArxmlStore.getState().setViewMode('combined');

    const next = useArxmlStore.getState();
    expect(next.viewMode).toBe('combined');
    expect(next.displayDoc).not.toBeNull();
    if (next.displayDoc === null) return;
    expect(next.displayDoc.path).toBe('[Combined]');
    // No collision → no basename wrapper. Both docs contribute their
    // root package 'EAS' directly; the displayDoc keeps both entries
    // (immutable — never merge across docs).
    expect(next.displayDoc.packages.map((p) => p.shortName)).toEqual(['EAS', 'EAS']);
  });

  it('combined mode: single file skips basename wrapper', () => {
    const store = useArxmlStore.getState();
    store.setDoc(makeDoc('/tmp/Can.arxml', 'Can', 'CanConfig'), '/tmp/Can.arxml');
    useArxmlStore.getState().setViewMode('combined');
    const next = useArxmlStore.getState();
    if (next.displayDoc === null) throw new Error('expected displayDoc');
    // Single file → no ambiguity → no basename wrapper.
    expect(next.displayDoc.packages.map((p) => p.shortName)).toEqual(['EAS']);
  });

  it('combined mode: module shortName collision keeps basename wrapper', () => {
    // Two docs both declare module `Can` from different BSWMDs.
    // Module-shortName collision → basename wrapper required for
    // path disambiguation. First keeps literal basename; second uses
    // [doc:1] (existing fallback).
    const store = useArxmlStore.getState();
    store.setDoc(makeDoc('/a/Can.arxml', 'Can', 'A'), '/a/Can.arxml');
    store.addDocument(makeDoc('/b/Can.arxml', 'Can', 'B'), '/b/Can.arxml');
    useArxmlStore.getState().setViewMode('combined');
    const next = useArxmlStore.getState();
    if (next.displayDoc === null) throw new Error('expected displayDoc');
    expect(next.displayDoc.packages.map((p) => p.shortName).sort()).toEqual([
      'Can.arxml',
      '[doc:1]',
    ]);
  });

  it('combined mode: basename collision keeps basename wrapper (no module dup)', () => {
    // Two docs have the same basename `/x/Can.arxml` but different
    // module shortNames. basename collision → wrapper required.
    const store = useArxmlStore.getState();
    store.setDoc(makeDoc('/x/Can.arxml', 'Adc', 'AdcConfig'), '/x/Can.arxml');
    store.addDocument(makeDoc('/y/Can.arxml', 'Can', 'CanConfig'), '/y/Can.arxml');
    useArxmlStore.getState().setViewMode('combined');
    const next = useArxmlStore.getState();
    if (next.displayDoc === null) throw new Error('expected displayDoc');
    expect(next.displayDoc.packages.map((p) => p.shortName).sort()).toEqual([
      'Can.arxml',
      '[doc:1]',
    ]);
  });

  it('setViewMode resets selectedPath so stale paths do not leak across modes', () => {
    const store = useArxmlStore.getState();
    store.setDoc(makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig'), '/tmp/Adc.arxml');
    store.select('/EAS/Adc/AdcConfig');
    expect(useArxmlStore.getState().selectedPath).toBe('/EAS/Adc/AdcConfig');
    useArxmlStore.getState().setViewMode('combined');
    expect(useArxmlStore.getState().selectedPath).toBeNull();
  });

  it('clicking a file in FileListTab switches back to single mode + sets active', () => {
    // We mimic the user flow: viewMode → combined, then click Adc.arxml
    // → setViewMode('single') + setActiveDocument('/tmp/Adc.arxml').
    const store = useArxmlStore.getState();
    store.setDoc(makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig'), '/tmp/Adc.arxml');
    store.addDocument(makeDoc('/tmp/Can.arxml', 'Can', 'CanConfig'), '/tmp/Can.arxml');
    useArxmlStore.getState().setViewMode('combined');
    useArxmlStore.getState().setViewMode('single');
    useArxmlStore.getState().setActiveDocument('/tmp/Adc.arxml');
    const next = useArxmlStore.getState();
    expect(next.viewMode).toBe('single');
    expect(next.activeDocumentPath).toBe('/tmp/Adc.arxml');
    expect(next.displayDoc).toBe(next.doc);
  });

  it('combined mode: selecting a node inside the virtual tree stores the path verbatim', () => {
    // Sprint 16 — flat mode (no collision): paths carry no prefix.
    // The Tree component calls `select(combinedPath)` and the store
    // stores it verbatim. findByPathMultiDoc (in core) is responsible
    // for resolving it back to a source document via the per-doc
    // fallback when no prefix matches.
    const store = useArxmlStore.getState();
    store.setDoc(makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig'), '/tmp/Adc.arxml');
    useArxmlStore.getState().setViewMode('combined');
    useArxmlStore.getState().select('/EAS/Adc/AdcConfig');
    expect(useArxmlStore.getState().selectedPath).toBe('/EAS/Adc/AdcConfig');
  });

  it('combined mode: same-basename files fall back to [doc:N] naming', () => {
    const store = useArxmlStore.getState();
    store.setDoc(makeDoc('/a/Can.arxml', 'Can', 'A'), '/a/Can.arxml');
    store.addDocument(makeDoc('/b/Can.arxml', 'Can', 'B'), '/b/Can.arxml');
    useArxmlStore.getState().setViewMode('combined');
    const next = useArxmlStore.getState();
    expect(next.displayDoc).not.toBeNull();
    if (next.displayDoc === null) return;
    // First occurrence keeps the literal basename; the second uses [doc:1].
    const names = next.displayDoc.packages.map((p) => p.shortName).sort();
    expect(names).toEqual(['Can.arxml', '[doc:1]']);
  });

  it('combined mode (flat, no collision): updateParam routes mutation via unprefixed path', () => {
    // Sprint 16 — flat mode: paths carry no basename prefix. updateParam
    // must still resolve to the correct source doc via the per-doc
    // fallback in findByPathMultiDoc + the no-op path in
    // stripCombinedPrefix.
    const store = useArxmlStore.getState();
    store.setDoc(makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig'), '/tmp/Adc.arxml');
    store.addDocument(makeDoc('/tmp/Can.arxml', 'Can', 'CanConfig'), '/tmp/Can.arxml');
    useArxmlStore.getState().setViewMode('combined');
    // No collision → paths are unprefixed. ParamEditor passes the
    // selectedPath verbatim; the store routes via the flat fallback.
    useArxmlStore.getState().select('/EAS/Can/CanConfig');
    useArxmlStore.getState().updateParam('/EAS/Can/CanConfig', 'TestParam', {
      type: 'integer',
      value: 7,
    });
    const next = useArxmlStore.getState();
    const canDoc = next.documents.find((d) => d.path === '/tmp/Can.arxml');
    expect(canDoc).toBeDefined();
    const canMod = canDoc?.packages[0]?.elements[0];
    if (canMod?.kind !== 'module') throw new Error('expected module');
    const canContainer = canMod.children[0];
    if (canContainer?.kind !== 'container') throw new Error('expected container');
    expect(canContainer.params.TestParam).toEqual({ type: 'integer', value: 7 });
    const adcDoc = next.documents.find((d) => d.path === '/tmp/Adc.arxml');
    const adcMod = adcDoc?.packages[0]?.elements[0];
    if (adcMod?.kind !== 'module') throw new Error('expected module');
    const adcContainer = adcMod.children[0];
    if (adcContainer?.kind !== 'container') throw new Error('expected container');
    expect(adcContainer.params.TestParam).toEqual({ type: 'integer', value: 0 });
    expect(next.dirtyPaths.has('/tmp/Can.arxml')).toBe(true);
  });

  it('combined mode (wrapped, module collision): updateParam routes mutation via basename prefix', () => {
    // Collision case — module shortName 'Can' appears in 2 docs.
    // Combined view wraps under basenames; selectedPath carries the
    // '/Can.arxml/...' prefix and the store strips it before mutation.
    const store = useArxmlStore.getState();
    store.setDoc(makeDoc('/a/Can.arxml', 'Can', 'A'), '/a/Can.arxml');
    store.addDocument(makeDoc('/b/Can.arxml', 'Can', 'B'), '/b/Can.arxml');
    useArxmlStore.getState().setViewMode('combined');
    useArxmlStore.getState().select('/Can.arxml/EAS/Can/A');
    useArxmlStore.getState().updateParam('/Can.arxml/EAS/Can/A', 'TestParam', {
      type: 'integer',
      value: 9,
    });
    const next = useArxmlStore.getState();
    const firstDoc = next.documents.find((d) => d.path === '/a/Can.arxml');
    const firstMod = firstDoc?.packages[0]?.elements[0];
    if (firstMod?.kind !== 'module') throw new Error('expected module');
    const firstContainer = firstMod.children[0];
    if (firstContainer?.kind !== 'container') throw new Error('expected container');
    expect(firstContainer.params.TestParam).toEqual({ type: 'integer', value: 9 });
    const secondDoc = next.documents.find((d) => d.path === '/b/Can.arxml');
    const secondMod = secondDoc?.packages[0]?.elements[0];
    if (secondMod?.kind !== 'module') throw new Error('expected module');
    const secondContainer = secondMod.children[0];
    if (secondContainer?.kind !== 'container') throw new Error('expected container');
    expect(secondContainer.params.TestParam).toEqual({ type: 'integer', value: 0 });
    expect(next.dirtyPaths.has('/a/Can.arxml')).toBe(true);
    expect(next.dirtyPaths.has('/b/Can.arxml')).toBe(false);
  });

  it('clear() resets viewMode back to single', () => {
    useArxmlStore.getState().setDoc(makeDoc('/tmp/A.arxml', 'A', 'C'), '/tmp/A.arxml');
    useArxmlStore.getState().setViewMode('combined');
    useArxmlStore.getState().clear();
    expect(useArxmlStore.getState().viewMode).toBe('single');
    expect(useArxmlStore.getState().displayDoc).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Sprint 17c T8 — resolveContainerTarget helper
//
// The store has 7 inline blocks of the form:
//   if (state.viewMode === 'combined') {
//     const hit = findByPathMultiDoc(state.documents, state.documentPaths, containerPath);
//     if (hit === null) { /* error */ return; }
//     /* use hit.doc / hit.filePath */
//   } else { /* use state.doc */ }
//
// `resolveContainerTarget(state, containerPath)` consolidates that into a
// single pure function so the call sites shrink to a null check.
// ---------------------------------------------------------------------------

describe('resolveContainerTarget (Sprint 17c T8)', () => {
  it('combined mode: routes to source doc via findByPathMultiDoc (basename-prefixed path)', () => {
    const store = useArxmlStore.getState();
    store.setDoc(makeDoc('/a/Can.arxml', 'Can', 'A'), '/a/Can.arxml');
    store.addDocument(makeDoc('/b/Can.arxml', 'Can', 'B'), '/b/Can.arxml');
    useArxmlStore.getState().setViewMode('combined');

    // Collision: module shortName 'Can' appears in 2 docs → basename wrapper.
    // Inner path is `/EAS/Can/A` under the first file.
    const state = useArxmlStore.getState();
    const target = resolveContainerTarget(state, '/Can.arxml/EAS/Can/A');
    expect(target).not.toBeNull();
    expect(target?.filePath).toBe('/a/Can.arxml');
    expect(target?.innerPath).toBe('/Can.arxml/EAS/Can/A');
    expect(target?.doc).toBe(state.documents[0]);
  });

  it('single mode: returns active doc; innerPath equals containerPath', () => {
    const store = useArxmlStore.getState();
    store.setDoc(makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig'), '/tmp/Adc.arxml');
    // viewMode stays 'single' (the default)
    const state = useArxmlStore.getState();
    const target = resolveContainerTarget(state, '/EAS/Adc/AdcConfig');
    expect(target).not.toBeNull();
    expect(target?.doc).toBe(state.doc);
    expect(target?.filePath).toBe('/tmp/Adc.arxml');
    expect(target?.innerPath).toBe('/EAS/Adc/AdcConfig');
  });

  it('single mode with no active doc: returns null', () => {
    // Force a fresh empty state: clear() drops documents + active path.
    // (The beforeEach above already calls clear(), but the surrounding
    // tests load docs — make this one robust against the order in which
    // vitest runs the four cases.)
    useArxmlStore.getState().clear();
    const state = useArxmlStore.getState();
    expect(state.doc).toBeNull();
    const target = resolveContainerTarget(state, '/EAS/Adc/AdcConfig');
    expect(target).toBeNull();
  });

  it('combined mode with no matching source: returns null', () => {
    const store = useArxmlStore.getState();
    store.setDoc(makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig'), '/tmp/Adc.arxml');
    store.addDocument(makeDoc('/tmp/Can.arxml', 'Can', 'CanConfig'), '/tmp/Can.arxml');
    useArxmlStore.getState().setViewMode('combined');

    // Combined mode + flat (no collision) + a path that doesn't exist in
    // either doc → findByPathMultiDoc returns null → helper returns null.
    const state = useArxmlStore.getState();
    const target = resolveContainerTarget(state, '/EAS/Missing/Unknown');
    expect(target).toBeNull();
  });
});
