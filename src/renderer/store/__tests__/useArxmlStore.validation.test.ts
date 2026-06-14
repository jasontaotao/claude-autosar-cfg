import { describe, it, expect, beforeEach } from 'vitest';

import type { ArxmlDocument } from '@core/arxml/types';

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
                children: [],
              },
            ],
            references: [],
          },
        ],
      },
    ],
  };
}

describe('useArxmlStore - validation sync', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
  });

  it('setDoc populates validationErrors and sets lastValidatedAt', () => {
    const store = useArxmlStore.getState();
    expect(store.validationErrors).toEqual([]);
    expect(store.lastValidatedAt).toBeNull();

    const doc = buildDoc();
    store.setDoc(doc, '/tmp/foo.arxml');
    const next = useArxmlStore.getState();

    // validationErrors is an array (stub returns [])
    expect(Array.isArray(next.validationErrors)).toBe(true);
    expect(next.validationErrors).toEqual([]);
    // lastValidatedAt set to a positive number
    expect(typeof next.lastValidatedAt).toBe('number');
    expect(next.lastValidatedAt).not.toBeNull();
    expect(next.lastValidatedAt as number).toBeGreaterThan(0);
  });

  it('updateParam updates validationErrors and keeps dirty=true', () => {
    useArxmlStore.getState().setDoc(buildDoc(), '/tmp/foo.arxml');
    const beforeTs = useArxmlStore.getState().lastValidatedAt;
    expect(beforeTs).not.toBeNull();

    // Change a value that actually differs from current
    useArxmlStore.getState().updateParam('/EAS/EcuC/EcuCGeneral', 'VersionCheckEnabled', {
      type: 'boolean',
      value: true,
    });
    const next = useArxmlStore.getState();
    // dirty set
    expect(next.dirty).toBe(true);
    // validationErrors array present (still [] from stub)
    expect(Array.isArray(next.validationErrors)).toBe(true);
    // timestamp updated
    expect(next.lastValidatedAt).not.toBeNull();
    expect((next.lastValidatedAt as number) >= (beforeTs as number)).toBe(true);
  });

  it('updateParam with same value does NOT trigger revalidate', () => {
    const doc = buildDoc();
    useArxmlStore.getState().setDoc(doc, '/tmp/foo.arxml');
    const beforeErrors = useArxmlStore.getState().validationErrors;
    const beforeTs = useArxmlStore.getState().lastValidatedAt;

    // Same value as current (1) → no change → no work
    useArxmlStore.getState().updateParam('/EAS/EcuC/EcuCGeneral', 'ConfigConsistencyRequired', {
      type: 'integer',
      value: 1,
    });
    const next = useArxmlStore.getState();

    // Errors reference preserved (no revalidate)
    expect(next.validationErrors).toBe(beforeErrors);
    // Timestamp unchanged
    expect(next.lastValidatedAt).toBe(beforeTs);
    // Doc reference preserved
    expect(next.doc).toBe(doc);
    // dirty NOT set
    expect(next.dirty).toBe(false);
  });

  it('validate() action alone re-runs validation', () => {
    useArxmlStore.getState().setDoc(buildDoc(), '/tmp/foo.arxml');
    const initialErrors = useArxmlStore.getState().validationErrors;
    const initialTs = useArxmlStore.getState().lastValidatedAt;

    // Manually call validate() — should keep same error ref (stub returns
    // fresh empty array each call, so reference may differ, but the result
    // is still [] and timestamp must advance).
    useArxmlStore.getState().validate();
    const next = useArxmlStore.getState();

    expect(next.validationErrors).toEqual([]);
    expect(next.lastValidatedAt).not.toBeNull();
    expect((next.lastValidatedAt as number) >= (initialTs as number)).toBe(true);
    // initialErrors captured for shape comparison only
    expect(Array.isArray(initialErrors)).toBe(true);
  });

  it('clear() resets validationErrors and lastValidatedAt', () => {
    useArxmlStore.getState().setDoc(buildDoc(), '/tmp/foo.arxml');
    // sanity: post-setDoc, validation state is populated
    expect(useArxmlStore.getState().validationErrors).toEqual([]);
    expect(useArxmlStore.getState().lastValidatedAt).not.toBeNull();

    useArxmlStore.getState().clear();
    const next = useArxmlStore.getState();

    expect(next.validationErrors).toEqual([]);
    expect(next.lastValidatedAt).toBeNull();
  });
});
