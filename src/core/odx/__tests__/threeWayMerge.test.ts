import { describe, expect, it } from 'vitest';

import type { ArxmlContainer, ArxmlModule } from '../../arxml/types.js';
import {
  classifyImportRows,
  collectImportContainers,
  hashContainerForProvenance,
  mergeModuleThreeWay,
} from '../threeWayMerge.js';

function module(children: readonly ArxmlContainer[]): ArxmlModule {
  return {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'Dcm',
    params: {},
    children,
    references: [],
  };
}

function container(name: string, children: readonly ArxmlContainer[] = []): ArxmlContainer {
  return {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: name,
    params: {},
    children,
  };
}

function hash(name: string): string {
  return hashContainerForProvenance(container(name));
}

describe('three-way merge', () => {
  it('classifies all provenance relationships and ignores manual containers', () => {
    const base = new Map([
      ['/Dcm/OdxChanged', hash('base')],
      ['/Dcm/LocalChanged', hash('base')],
      ['/Dcm/Conflict', hash('base')],
      ['/Dcm/Converged', hash('base')],
      ['/Dcm/RemovedInOdx', hash('base')],
    ]);
    const current = new Map([
      ['/Dcm/OdxChanged', hash('base')],
      ['/Dcm/LocalChanged', hash('local')],
      ['/Dcm/Conflict', hash('local')],
      ['/Dcm/Converged', hash('incoming')],
      ['/Dcm/RemovedInOdx', hash('base')],
      ['/Dcm/Manual', hash('manual')],
    ]);
    const incoming = new Map([
      ['/Dcm/New', hash('incoming')],
      ['/Dcm/OdxChanged', hash('incoming')],
      ['/Dcm/LocalChanged', hash('base')],
      ['/Dcm/Conflict', hash('incoming')],
      ['/Dcm/Converged', hash('incoming')],
    ]);
    const rows = classifyImportRows({
      module: 'Dcm',
      manifestEntries: base,
      currentContainers: current,
      incomingContainers: incoming,
    });
    const byPath = new Map(rows.map((row) => [row.path, row.category]));
    expect(byPath.get('/Dcm/New')).toBe('added');
    expect(byPath.get('/Dcm/OdxChanged')).toBe('updated');
    expect(byPath.get('/Dcm/LocalChanged')).toBe('locally-modified');
    expect(byPath.get('/Dcm/Conflict')).toBe('conflict');
    expect(byPath.get('/Dcm/Converged')).toBe('converged');
    expect(byPath.get('/Dcm/RemovedInOdx')).toBe('removed-in-odx');
    expect(rows.some((row) => row.path === '/Dcm/Manual')).toBe(false);
  });

  it('applies explicit decisions and preserves unrelated manual containers', () => {
    const existing = module([container('Config', [container('Local')]), container('Manual')]);
    const incoming = module([container('Config', [container('Incoming')]), container('Added')]);
    const merged = mergeModuleThreeWay({
      existing,
      incoming,
      baseContainers: new Map(),
      currentContainers: new Map(
        [...collectImportContainers(existing)].map(([path, value]) => [
          path,
          hashContainerForProvenance(value),
        ]),
      ),
      incomingContainers: new Map(
        [...collectImportContainers(incoming)].map(([path, value]) => [
          path,
          hashContainerForProvenance(value),
        ]),
      ),
      decisions: new Map([
        ['/Dcm/Config', 'import'],
        ['/Dcm/Manual', 'keep-local'],
      ]),
    });
    const names = merged.children.map((child) =>
      child.kind === 'container' ? child.shortName : '',
    );
    expect(names).toContain('Added');
    expect(names).toContain('Manual');
    const config = merged.children.find(
      (child): child is ArxmlContainer =>
        child.kind === 'container' && child.shortName === 'Config',
    )!;
    expect(config.children[0]?.kind === 'container' && config.children[0].shortName).toBe(
      'Incoming',
    );
  });
});

it('normalizes legacy sha256-prefixed provenance hashes', () => {
  const baseHash = hash('base');
  const rows = classifyImportRows({
    module: 'Dcm',
    manifestEntries: new Map([['/Dcm/Item', `sha256:${baseHash}`]]),
    currentContainers: new Map([['/Dcm/Item', baseHash]]),
    incomingContainers: new Map([['/Dcm/Item', hash('incoming')]]),
  });
  expect(rows).toHaveLength(1);
  expect(rows[0]?.category).toBe('updated');
});

it('classifies provenance containers deleted locally but present in ODX', () => {
  const baseHash = hash('base');
  const incomingHash = hash('incoming');
  const rows = classifyImportRows({
    module: 'Dcm',
    manifestEntries: new Map([['/Dcm/Item', baseHash]]),
    currentContainers: new Map(),
    incomingContainers: new Map([['/Dcm/Item', incomingHash]]),
  });
  expect(rows).toHaveLength(1);
  expect(rows[0]?.category).toBe('conflict');
  expect(rows[0]?.defaultDecision).toBe('keep-local');
  expect(rows[0]?.conflictDetail).toEqual({ localHash: 'deleted', incomingHash });

  const unchanged = classifyImportRows({
    module: 'Dcm',
    manifestEntries: new Map([['/Dcm/Item', baseHash]]),
    currentContainers: new Map(),
    incomingContainers: new Map([['/Dcm/Item', baseHash]]),
  });
  expect(unchanged[0]?.category).toBe('locally-modified');
  expect(unchanged[0]?.defaultDecision).toBe('keep-local');
});

it('honors keep-local defaults for containers deleted locally', () => {
  const baseHash = hashContainerForProvenance(container('Item'));
  const incomingHash = hashContainerForProvenance(container('Item', [container('Incoming')]));
  const existing = module([container('Manual')]);
  const incoming = module([container('Item', [container('Incoming')])]);
  const merged = mergeModuleThreeWay({
    existing,
    incoming,
    baseContainers: new Map([['/Dcm/Item', baseHash]]),
    currentContainers: new Map(),
    incomingContainers: new Map([['/Dcm/Item', incomingHash]]),
    decisions: new Map(),
  });
  expect(
    merged.children.some((child) => child.kind === 'container' && child.shortName === 'Item'),
  ).toBe(false);
});
