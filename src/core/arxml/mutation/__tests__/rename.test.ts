import { describe, expect, it } from 'vitest';

import type { ArxmlContainer, ArxmlDocument, ArxmlModule } from '@core/arxml/types.js';

import { renameContainer, validateContainerRename } from '../rename.js';

function container(shortName: string, children: readonly ArxmlContainer[] = []): ArxmlContainer {
  return {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName,
    params: {},
    children,
  };
}

function simpleDoc(target: string, siblings: readonly string[]): ArxmlDocument {
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

function makeDoc(): ArxmlDocument {
  const target: ArxmlContainer = {
    ...container('Old', [container('Child')]),
    definitionRef: '/BSWMD/ValidSet',
    params: {},
  };
  const referrer: ArxmlContainer = {
    ...container('Referrer'),
    params: {
      exactRef: { type: 'reference', value: '/EAS/Can/ConfigSet/Old', dest: 'CONTAINER' },
      childRef: { type: 'reference', value: '/EAS/Can/ConfigSet/Old/Child', dest: 'CONTAINER' },
      unrelatedRef: { type: 'reference', value: '/EAS/Can/ConfigSet/Other', dest: 'CONTAINER' },
    },
  };
  const configSet = container('ConfigSet', [referrer, target, container('Other')]);
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

function findChild(doc: ArxmlDocument, shortName: string): ArxmlContainer {
  const module = doc.packages[0]!.elements[0]!;
  if (module.kind !== 'module') throw new Error('expected module');
  const configSet = module.children[0]!;
  if (configSet.kind !== 'container') throw new Error('expected config set');
  const child = configSet.children.find(
    (c): c is ArxmlContainer => c.kind === 'container' && c.shortName === shortName,
  );
  if (child === undefined) throw new Error(`expected ${shortName}`);
  return child;
}

describe('validateContainerRename', () => {
  it('accepts a valid unique sibling name', () => {
    expect(
      validateContainerRename(simpleDoc('Old', ['A', 'B']), '/EAS/Can/ConfigSet/Old', 'New'),
    ).toBeNull();
  });

  it('rejects an empty short name', () => {
    expect(validateContainerRename(simpleDoc('Old', []), '/EAS/Can/ConfigSet/Old', '')).toEqual({
      kind: 'empty-short-name',
    });
  });

  it('rejects an identifier that is not valid in an ARXML short name', () => {
    expect(
      validateContainerRename(simpleDoc('Old', []), '/EAS/Can/ConfigSet/Old', '9Bad Name'),
    ).toEqual({ kind: 'invalid-short-name', shortName: '9Bad Name' });
  });

  it('rejects a sibling container name conflict', () => {
    expect(
      validateContainerRename(simpleDoc('Old', ['New']), '/EAS/Can/ConfigSet/Old', 'New'),
    ).toEqual({ kind: 'sibling-name-conflict', shortName: 'New' });
  });

  it('returns path-not-found when the target is missing', () => {
    expect(
      validateContainerRename(simpleDoc('Old', []), '/EAS/Can/ConfigSet/Missing', 'New'),
    ).toEqual({ kind: 'path-not-found', path: '/EAS/Can/ConfigSet/Missing' });
  });

  it('returns not-container when the target is a module', () => {
    expect(validateContainerRename(simpleDoc('Old', []), '/EAS/Can', 'New')).toEqual({
      kind: 'not-container',
      path: '/EAS/Can',
    });
  });
});

describe('renameContainer', () => {
  it('renames the instance, preserves its definition, and rewrites inbound references', () => {
    const before = makeDoc();
    const result = renameContainer(before, '/EAS/Can/ConfigSet/Old', 'New');
    if (!result.ok) throw new Error(result.error.kind);

    expect(result.value.oldPath).toBe('/EAS/Can/ConfigSet/Old');
    expect(result.value.newPath).toBe('/EAS/Can/ConfigSet/New');
    expect(result.value.rewrittenReferenceCount).toBe(2);

    const renamed = findChild(result.value.doc, 'New');
    expect(renamed.definitionRef).toBe('/BSWMD/ValidSet');
    expect(renamed.children.map((c) => (c.kind === 'container' ? c.shortName : ''))).toEqual([
      'Child',
    ]);

    const referrer = findChild(result.value.doc, 'Referrer');
    expect(referrer.params.exactRef).toEqual({
      type: 'reference',
      value: '/EAS/Can/ConfigSet/New',
      dest: 'CONTAINER',
    });
    expect(referrer.params.childRef).toEqual({
      type: 'reference',
      value: '/EAS/Can/ConfigSet/New/Child',
      dest: 'CONTAINER',
    });
    expect(referrer.params.unrelatedRef).toEqual({
      type: 'reference',
      value: '/EAS/Can/ConfigSet/Other',
      dest: 'CONTAINER',
    });
  });

  it('rejects an invalid rename and does not produce a result', () => {
    const before = makeDoc();
    const result = renameContainer(before, '/EAS/Can/ConfigSet/Old', '');
    expect(result).toEqual({ ok: false, error: { kind: 'empty-short-name' } });
  });

  it('returns the same document when the requested name is already current', () => {
    const before = makeDoc();
    const result = renameContainer(before, '/EAS/Can/ConfigSet/Old', 'Old');
    expect(result).toEqual({
      ok: true,
      value: {
        doc: before,
        oldPath: '/EAS/Can/ConfigSet/Old',
        newPath: '/EAS/Can/ConfigSet/Old',
        rewrittenReferenceCount: 0,
      },
    });
  });
});
