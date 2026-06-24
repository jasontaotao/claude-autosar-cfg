// Sprint A+ — deleteEcucModule store action tests.
//
// Pins the contract for the new `deleteEcucModule` action added to the
// MutationSlice. The action removes the ECUC module element at a given
// post-fold path and (for source-backed docs) clears the `sourceBswmdPath`
// link so the ProjectPanel chip no longer shows a dangling "0 modules
// covered by BSWMD" entry.
//
// Tests follow the existing pattern from useArxmlStore.mutation.test.ts:
// drive the store via `useArxmlStore.getState().<action>(...)` and
// assert on `useArxmlStore.getState()` afterwards.

import { beforeEach, describe, expect, it } from 'vitest';

import type { ArxmlDocument, ArxmlModule } from '@core/arxml/types';

import { useArxmlStore } from '../useArxmlStore';

function makeModule(shortName: string): ArxmlModule {
  return {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName,
    params: {},
    children: [],
    references: [],
  };
}

function makeDoc(opts: { moduleShortName: string; sourceBswmdPath?: string }): ArxmlDocument {
  const moduleEl = makeModule(opts.moduleShortName);
  const doc: ArxmlDocument = {
    path: '/test/Adc_EcucValues.arxml',
    version: '4.6',
    packages: [
      {
        shortName: 'Adc',
        path: '/Adc',
        elements: [moduleEl],
      },
    ],
  };
  if (opts.sourceBswmdPath !== undefined) {
    return { ...doc, sourceBswmdPath: opts.sourceBswmdPath };
  }
  return doc;
}

describe('useArxmlStore.deleteEcucModule (Sprint A+)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
  });

  it('removes the module from a non-source-backed doc', () => {
    // Arrange
    const doc = makeDoc({ moduleShortName: 'Adc' });
    useArxmlStore.getState().addDocument(doc, doc.path);

    // Act — path is the canonical 4-segment `/Adc/Adc` (package
    // shortName `Adc` wraps the ECUC element shortName `Adc` — the
    // "same-name AR-PACKAGE wrapper" shape v1.4.1 Bug 2c handles).
    useArxmlStore.getState().deleteEcucModule('/Adc/Adc');

    // Assert — module removed, no source-link to clear
    // (setInfo stamps the legacy `error` field with the success
    // message for back-compat — see uiSlice.setInfo — so we only
    // check the typed `toast` for the success kind here).
    const next = useArxmlStore.getState();
    expect(next.doc).not.toBeNull();
    expect(next.doc!.packages[0]!.elements.length).toBe(0);
    expect(next.doc!.sourceBswmdPath).toBeUndefined();
    expect(next.toast).not.toBeNull();
    expect(next.toast!.kind).toBe('info');
  });

  it('removes the module AND clears sourceBswmdPath for a source-backed doc', () => {
    // Arrange
    const doc = makeDoc({
      moduleShortName: 'Adc',
      sourceBswmdPath: '/test/Adc_bswmd.arxml',
    });
    useArxmlStore.getState().addDocument(doc, doc.path);

    // Act
    useArxmlStore.getState().deleteEcucModule('/Adc/Adc');

    // Assert — module removed AND sourceBswmdPath cleared (no dangling link)
    const next = useArxmlStore.getState();
    expect(next.doc!.packages[0]!.elements.length).toBe(0);
    expect(next.doc!.sourceBswmdPath).toBeUndefined();
  });

  it('surfaces a localized success toast', () => {
    // Arrange
    const doc = makeDoc({ moduleShortName: 'Adc' });
    useArxmlStore.getState().addDocument(doc, doc.path);

    // Act
    useArxmlStore.getState().deleteEcucModule('/Adc/Adc');

    // Assert — toast emitted (zh-CN "已删除" / en "Deleted")
    const toast = useArxmlStore.getState().toast;
    expect(toast).not.toBeNull();
    expect(
      toast!.message.match(/已删除 ECUC 模块|Deleted ECUC module|Adc/),
    ).not.toBeNull();
  });

  it('no-ops with error toast when the path does not match any module', () => {
    // Arrange
    const doc = makeDoc({ moduleShortName: 'Adc' });
    useArxmlStore.getState().addDocument(doc, doc.path);
    const before = useArxmlStore.getState().documents[0]!;

    // Act
    useArxmlStore.getState().deleteEcucModule('/Adc/NonExistent');

    // Assert — doc unchanged, error toast
    const next = useArxmlStore.getState();
    expect(next.documents[0]).toBe(before);
    expect(next.doc!.packages[0]!.elements.length).toBe(1);
    expect(next.toast).not.toBeNull();
    expect(next.toast!.kind).toBe('error');
  });
});
