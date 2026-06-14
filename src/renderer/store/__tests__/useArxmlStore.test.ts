import { describe, it, expect, beforeEach } from 'vitest';

import type { ArxmlDocument, ParamValue } from '@core/arxml/types';

import { useArxmlStore } from '../useArxmlStore';

function buildDoc(): ArxmlDocument {
  return {
    path: '/tmp/dummy.arxml',
    version: '4.6',
    packages: [
      {
        shortName: 'EAS',
        path: '/EAS',
        elements: [
          {
            kind: 'module',
            tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
            shortName: 'EcuC',
            params: {},
            children: [
              {
                kind: 'container',
                tagName: 'ECUC-CONTAINER-VALUE',
                shortName: 'EcuCGeneral',
                params: {
                  ConfigConsistencyRequired: { type: 'integer', value: 1 },
                  VersionCheckEnabled: { type: 'boolean', value: false },
                },
                children: [
                  {
                    kind: 'container',
                    tagName: 'ECUC-CONTAINER-VALUE',
                    shortName: 'Inner',
                    params: { DeepParam: { type: 'integer', value: 42 } },
                    children: [],
                  },
                ],
              },
            ],
            references: [],
          },
        ],
      },
    ],
  };
}

describe('useArxmlStore', () => {
  beforeEach(() => {
    // Reset to clean state between tests
    useArxmlStore.getState().clear();
  });

  it('setDoc resets selectedPath + dirty + loads doc + filePath', () => {
    const store = useArxmlStore.getState();
    const doc = buildDoc();
    store.setDoc(doc, '/tmp/foo.arxml');
    const next = useArxmlStore.getState();
    expect(next.doc).toBe(doc);
    expect(next.filePath).toBe('/tmp/foo.arxml');
    expect(next.selectedPath).toBeNull();
    expect(next.dirty).toBe(false);
    expect(next.error).toBeNull();
  });

  it('select updates selectedPath', () => {
    useArxmlStore.getState().setDoc(buildDoc(), '/tmp/foo.arxml');
    useArxmlStore.getState().select('/EAS/EcuC');
    expect(useArxmlStore.getState().selectedPath).toBe('/EAS/EcuC');
    useArxmlStore.getState().select(null);
    expect(useArxmlStore.getState().selectedPath).toBeNull();
  });

  it('updateParam replaces top-level param without mutating original doc', () => {
    const doc = buildDoc();
    const beforeDoc = useArxmlStore.getState().doc;
    useArxmlStore.getState().setDoc(doc, '/tmp/foo.arxml');
    const originalRef = doc;
    const rootEl = doc.packages[0]!.elements[0]!;
    if (rootEl.kind !== 'module') throw new Error('test fixture: expected module');
    const originalContainer = rootEl.children[0]!;
    if (originalContainer.kind !== 'container') throw new Error('test fixture: expected container');
    const beforeParamValue = originalContainer.params.VersionCheckEnabled;

    // Mutate via store
    useArxmlStore
      .getState()
      .updateParam('/EAS/EcuC/EcuCGeneral', 'VersionCheckEnabled', {
        type: 'boolean',
        value: true,
      });

    const after = useArxmlStore.getState().doc!;
    const rootElRef = originalRef.packages[0]!.elements[0]!;
    if (rootElRef.kind !== 'module') throw new Error('test fixture: expected module');
    const originalContainerAfter = rootElRef.children[0]!;
    if (originalContainerAfter.kind !== 'container') throw new Error('test fixture: expected container');
    // Original doc object untouched (same reference + same param value)
    expect(originalContainerAfter.params.VersionCheckEnabled).toBe(beforeParamValue);
    expect((originalContainerAfter.params.VersionCheckEnabled as ParamValue).value).toBe(false);
    // New doc has the new value
    const rootElNew = after.packages[0]!.elements[0]!;
    if (rootElNew.kind !== 'module') throw new Error('test fixture: expected module');
    const mutatedContainer = rootElNew.children[0]!;
    if (mutatedContainer.kind !== 'container') throw new Error('test fixture: expected container');
    expect(mutatedContainer.params.VersionCheckEnabled).toEqual({
      type: 'boolean',
      value: true,
    });
    // Original store was empty before setDoc
    expect(beforeDoc).toBeNull();
    // dirty flag set
    expect(useArxmlStore.getState().dirty).toBe(true);
  });

  it('updateParam navigates nested container paths', () => {
    useArxmlStore.getState().setDoc(buildDoc(), '/tmp/foo.arxml');
    useArxmlStore.getState().updateParam('/EAS/EcuC/EcuCGeneral/Inner', 'DeepParam', {
      type: 'integer',
      value: 99,
    });
    const after = useArxmlStore.getState().doc!;
    const ecuc = after.packages[0]!.elements[0]!;
    if (ecuc.kind !== 'module') throw new Error('test fixture: expected module');
    const general = ecuc.children[0]!;
    if (general.kind !== 'container') throw new Error('test fixture: expected container');
    const inner = general.children[0]!;
    expect(inner.kind).toBe('container');
    if (inner.kind !== 'container') return;
    expect(inner.params.DeepParam).toEqual({ type: 'integer', value: 99 });
  });

  it('updateParam with same value skips update (no dirty, same reference)', () => {
    const doc = buildDoc();
    useArxmlStore.getState().setDoc(doc, '/tmp/foo.arxml');
    const sameValue = { type: 'integer', value: 1 } as ParamValue;
    useArxmlStore
      .getState()
      .updateParam('/EAS/EcuC/EcuCGeneral', 'ConfigConsistencyRequired', sameValue);
    const next = useArxmlStore.getState();
    // Same doc reference (no allocation when value is equal)
    expect(next.doc).toBe(doc);
    expect(next.dirty).toBe(false);
  });

  it('markSaved clears dirty', () => {
    useArxmlStore.getState().setDoc(buildDoc(), '/tmp/foo.arxml');
    useArxmlStore
      .getState()
      .updateParam('/EAS/EcuC/EcuCGeneral', 'ConfigConsistencyRequired', {
        type: 'integer',
        value: 7,
      });
    expect(useArxmlStore.getState().dirty).toBe(true);
    useArxmlStore.getState().markSaved('/tmp/foo.arxml');
    expect(useArxmlStore.getState().dirty).toBe(false);
    expect(useArxmlStore.getState().filePath).toBe('/tmp/foo.arxml');
  });
});