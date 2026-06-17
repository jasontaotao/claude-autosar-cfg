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

import { useArxmlStore } from '../useArxmlStore';

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

  it('setViewMode("combined") synthesises a virtual displayDoc with one package per file', () => {
    const store = useArxmlStore.getState();
    store.setDoc(makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig'), '/tmp/Adc.arxml');
    store.addDocument(makeDoc('/tmp/Can.arxml', 'Can', 'CanConfig'), '/tmp/Can.arxml');
    useArxmlStore.getState().setViewMode('combined');

    const next = useArxmlStore.getState();
    expect(next.viewMode).toBe('combined');
    expect(next.displayDoc).not.toBeNull();
    if (next.displayDoc === null) return;
    expect(next.displayDoc.path).toBe('[Combined]');
    // Two top-level packages, one per file basename.
    expect(next.displayDoc.packages.map((p) => p.shortName).sort()).toEqual([
      'Adc.arxml',
      'Can.arxml',
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

  it('combined mode: selecting a node inside the virtual tree produces a prefixed selectedPath', () => {
    // The Tree component calls `select(combinedPath)` where combinedPath
    // starts with the basename. The store does NOT need to reformat —
    // it just stores the path verbatim. findByPathMultiDoc (in core) is
    // responsible for resolving it back to a source document.
    const store = useArxmlStore.getState();
    store.setDoc(makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig'), '/tmp/Adc.arxml');
    useArxmlStore.getState().setViewMode('combined');
    useArxmlStore.getState().select('/Adc.arxml/EAS/Adc/AdcConfig');
    expect(useArxmlStore.getState().selectedPath).toBe('/Adc.arxml/EAS/Adc/AdcConfig');
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

  it('combined mode: updateParam routes the mutation to the correct source document via basename', () => {
    // Mimics ParamEditor's updateParam flow: combined selectedPath
    // '/Can.arxml/EAS/Can/CanConfig' must mutate the Can.arxml doc,
    // not the Adc.arxml one.
    const store = useArxmlStore.getState();
    store.setDoc(makeDoc('/tmp/Adc.arxml', 'Adc', 'AdcConfig'), '/tmp/Adc.arxml');
    store.addDocument(makeDoc('/tmp/Can.arxml', 'Can', 'CanConfig'), '/tmp/Can.arxml');
    useArxmlStore.getState().setViewMode('combined');
    // Simulate the basename-prefixed selection.
    useArxmlStore.getState().select('/Can.arxml/EAS/Can/CanConfig');
    // ParamEditor would call updateParam with the combined path; the
    // store resolves the prefix and routes to Can.arxml.
    useArxmlStore.getState().updateParam('/Can.arxml/EAS/Can/CanConfig', 'TestParam', {
      type: 'integer',
      value: 7,
    });
    const next = useArxmlStore.getState();
    // Active doc is still Adc (set last via setDoc on the add chain),
    // but the SOURCE doc — Can.arxml — must have been mutated.
    const canDoc = next.documents.find((d) => d.path === '/tmp/Can.arxml');
    expect(canDoc).toBeDefined();
    const canMod = canDoc?.packages[0]?.elements[0];
    if (canMod?.kind !== 'module') throw new Error('expected module');
    const canContainer = canMod.children[0];
    if (canContainer?.kind !== 'container') throw new Error('expected container');
    expect(canContainer.params.TestParam).toEqual({ type: 'integer', value: 7 });
    // The OTHER doc must remain untouched.
    const adcDoc = next.documents.find((d) => d.path === '/tmp/Adc.arxml');
    const adcMod = adcDoc?.packages[0]?.elements[0];
    if (adcMod?.kind !== 'module') throw new Error('expected module');
    const adcContainer = adcMod.children[0];
    if (adcContainer?.kind !== 'container') throw new Error('expected container');
    expect(adcContainer.params.TestParam).toEqual({ type: 'integer', value: 0 });
    // And the dirty set must include the source path, not the active path.
    expect(next.dirtyPaths.has('/tmp/Can.arxml')).toBe(true);
  });

  it('clear() resets viewMode back to single', () => {
    useArxmlStore.getState().setDoc(makeDoc('/tmp/A.arxml', 'A', 'C'), '/tmp/A.arxml');
    useArxmlStore.getState().setViewMode('combined');
    useArxmlStore.getState().clear();
    expect(useArxmlStore.getState().viewMode).toBe('single');
    expect(useArxmlStore.getState().displayDoc).toBeNull();
  });
});
