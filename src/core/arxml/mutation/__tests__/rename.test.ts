import { describe, expect, it } from 'vitest';

import type { ArxmlContainer, ArxmlDocument, ArxmlModule } from '@core/arxml/types.js';

import { validateContainerRename } from '../rename.js';

function container(shortName: string, children: readonly ArxmlContainer[] = []): ArxmlContainer {
  return {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName,
    params: {},
    children,
  };
}

function doc(target: string, siblings: readonly string[]): ArxmlDocument {
  const configSet = container('ConfigSet', [
    ...siblings.map((shortName) => container(shortName)),
    container(target),
  ]);
  const module: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'Can',
    params: {},
    children: [configSet],
    references: [],
  };
  return {
    path: '/tmp/Can.arxml',
    version: '4.6',
    packages: [{ shortName: 'EAS', path: '/EAS', elements: [module] }],
  };
}

describe('validateContainerRename', () => {
  it('accepts a valid unique sibling name', () => {
    expect(
      validateContainerRename(doc('Old', ['A', 'B']), '/EAS/Can/ConfigSet/Old', 'New'),
    ).toBeNull();
  });

  it('rejects an empty short name', () => {
    expect(validateContainerRename(doc('Old', []), '/EAS/Can/ConfigSet/Old', '')).toEqual({
      kind: 'empty-short-name',
    });
  });

  it('rejects an identifier that is not valid in an ARXML short name', () => {
    expect(validateContainerRename(doc('Old', []), '/EAS/Can/ConfigSet/Old', '9Bad Name')).toEqual({
      kind: 'invalid-short-name',
      shortName: '9Bad Name',
    });
  });

  it('rejects a sibling container name conflict', () => {
    expect(validateContainerRename(doc('Old', ['New']), '/EAS/Can/ConfigSet/Old', 'New')).toEqual({
      kind: 'sibling-name-conflict',
      shortName: 'New',
    });
  });

  it('returns path-not-found when the target is missing', () => {
    expect(validateContainerRename(doc('Old', []), '/EAS/Can/ConfigSet/Missing', 'New')).toEqual({
      kind: 'path-not-found',
      path: '/EAS/Can/ConfigSet/Missing',
    });
  });

  it('returns not-container when the target is a module', () => {
    expect(validateContainerRename(doc('Old', []), '/EAS/Can', 'New')).toEqual({
      kind: 'not-container',
      path: '/EAS/Can',
    });
  });
});
