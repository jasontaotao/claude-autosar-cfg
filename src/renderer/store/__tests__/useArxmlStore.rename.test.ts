import { beforeEach, describe, expect, it } from 'vitest';

import type { ArxmlContainer, ArxmlDocument, ArxmlModule } from '@core/arxml/types.js';

import { useArxmlStore } from '../useArxmlStore.js';

function container(
  shortName: string,
  params: ArxmlContainer['params'] = {},
  children: readonly ArxmlContainer[] = [],
): ArxmlContainer {
  return {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName,
    params,
    children,
  };
}

function makeDoc(path: string): ArxmlDocument {
  const target: ArxmlContainer = {
    ...container('Old', {}, [container('Child')]),
    definitionRef: '/BSWMD/ValidSet',
  };
  const referrer = container('Referrer', {
    TargetRef: { type: 'reference', value: '/EAS/Can/ConfigSet/Old', dest: 'CONTAINER' },
  });
  const configSet = container('ConfigSet', {}, [referrer, target]);
  const module: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'Can',
    params: {},
    children: [configSet],
    references: [],
  };
  return {
    path,
    version: '4.6',
    packages: [{ shortName: 'EAS', path: '/EAS', elements: [module] }],
  };
}

function findContainer(doc: ArxmlDocument, shortName: string): ArxmlContainer {
  const module = doc.packages[0]!.elements[0]!;
  if (module.kind !== 'module') throw new Error('expected module');
  const configSet = module.children[0]!;
  if (configSet.kind !== 'container') throw new Error('expected config set');
  const found = configSet.children.find(
    (child): child is ArxmlContainer => child.kind === 'container' && child.shortName === shortName,
  );
  if (found === undefined) throw new Error(`missing ${shortName}`);
  return found;
}

beforeEach(() => {
  useArxmlStore.getState().clear();
});

describe('useArxmlStore.renameContainer', () => {
  it('renames in single mode, rewrites references, selects the new path, and marks the document dirty', () => {
    useArxmlStore.getState().addDocument(makeDoc('/tmp/Can.arxml'), '/tmp/Can.arxml');
    useArxmlStore.getState().select('/EAS/Can/ConfigSet/Old');

    useArxmlStore.getState().renameContainer?.('/EAS/Can/ConfigSet/Old', 'New');

    const state = useArxmlStore.getState();
    const doc = state.doc;
    if (doc === null) throw new Error('doc is null');
    const renamed = findContainer(doc, 'New');
    expect(renamed.definitionRef).toBe('/BSWMD/ValidSet');
    const referrer = findContainer(doc, 'Referrer');
    expect(referrer.params.TargetRef).toEqual({
      type: 'reference',
      value: '/EAS/Can/ConfigSet/New',
      dest: 'CONTAINER',
    });
    expect(state.selectedPath).toBe('/EAS/Can/ConfigSet/New');
    expect(state.dirtyPaths.has('/tmp/Can.arxml')).toBe(true);
  });

  it('rejects an invalid rename without marking the document dirty', () => {
    useArxmlStore.getState().addDocument(makeDoc('/tmp/Can.arxml'), '/tmp/Can.arxml');
    useArxmlStore.getState().renameContainer?.('/EAS/Can/ConfigSet/Old', '9Bad');
    const state = useArxmlStore.getState();
    expect(state.error).not.toBeNull();
    expect(state.dirtyPaths.size).toBe(0);
    expect(findContainer(state.doc!, 'Old')).toBeDefined();
  });

  it('renames through a combined-mode source path and selects the rewritten combined path', () => {
    useArxmlStore.getState().addDocument(makeDoc('/tmp/Can.arxml'), '/tmp/Can.arxml');
    useArxmlStore.getState().setViewMode('combined');
    useArxmlStore.getState().select('/Can.arxml/EAS/Can/ConfigSet/Old');

    useArxmlStore.getState().renameContainer?.('/Can.arxml/EAS/Can/ConfigSet/Old', 'New');

    const state = useArxmlStore.getState();
    const doc = state.doc;
    if (doc === null) throw new Error('doc is null');
    expect(findContainer(doc, 'New')).toBeDefined();
    expect(state.selectedPath).toBe('/Can.arxml/EAS/Can/ConfigSet/New');
    expect(state.dirtyPaths.has('/tmp/Can.arxml')).toBe(true);
  });
});
