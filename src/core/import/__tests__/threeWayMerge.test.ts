import { describe, expect, it } from 'vitest';

import type { ArxmlContainer, ArxmlModule } from '../../arxml/types.js';
import {
  classifyImportRows,
  collectImportContainers,
  hashContainerForProvenance,
  mergeModuleThreeWay,
} from '../threeWayMerge.js';

function module(shortName: string, children: readonly ArxmlContainer[]): ArxmlModule {
  return {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName,
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

describe('generalized three-way merge', () => {
  it('classifies removed containers with the caller-provided category label', () => {
    const hashA = hash('base');
    const rows = classifyImportRows({
      module: 'Com',
      removedCategoryLabel: 'removed-in-dbc',
      manifestEntries: new Map([['/Com/ComConfig/ComIPdu/OldMsg', hashA]]),
      currentContainers: new Map([['/Com/ComConfig/ComIPdu/OldMsg', hashA]]),
      incomingContainers: new Map(),
    });
    expect(rows.map((row) => row.category)).toEqual(['removed-in-dbc']);
    expect(rows[0]?.defaultDecision).toBe('keep-local');
  });

  it('classifies added containers as import', () => {
    const rows = classifyImportRows({
      module: 'Com',
      removedCategoryLabel: 'removed-in-dbc',
      manifestEntries: new Map(),
      currentContainers: new Map(),
      incomingContainers: new Map([['/Com/ComConfig/ComIPdu/NewMsg', hash('incoming')]]),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.category).toBe('added');
    expect(rows[0]?.defaultDecision).toBe('import');
  });

  it('classifies incoming changes on unchanged locals as updated', () => {
    const baseHash = hash('base');
    const rows = classifyImportRows({
      module: 'Com',
      removedCategoryLabel: 'removed-in-dbc',
      manifestEntries: new Map([['/Com/ComConfig/ComIPdu/Msg', baseHash]]),
      currentContainers: new Map([['/Com/ComConfig/ComIPdu/Msg', baseHash]]),
      incomingContainers: new Map([['/Com/ComConfig/ComIPdu/Msg', hash('incoming')]]),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.category).toBe('updated');
    expect(rows[0]?.defaultDecision).toBe('import');
  });

  it('classifies local changes on unchanged incoming as locally-modified', () => {
    const baseHash = hash('base');
    const rows = classifyImportRows({
      module: 'Com',
      removedCategoryLabel: 'removed-in-dbc',
      manifestEntries: new Map([['/Com/ComConfig/ComIPdu/Msg', baseHash]]),
      currentContainers: new Map([['/Com/ComConfig/ComIPdu/Msg', hash('local')]]),
      incomingContainers: new Map([['/Com/ComConfig/ComIPdu/Msg', baseHash]]),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.category).toBe('locally-modified');
    expect(rows[0]?.defaultDecision).toBe('keep-local');
  });

  it('classifies divergent changes as conflict with keep-local default', () => {
    const baseHash = hash('base');
    const localHash = hash('local');
    const incomingHash = hash('incoming');
    const rows = classifyImportRows({
      module: 'Com',
      removedCategoryLabel: 'removed-in-dbc',
      manifestEntries: new Map([['/Com/ComConfig/ComIPdu/Msg', baseHash]]),
      currentContainers: new Map([['/Com/ComConfig/ComIPdu/Msg', localHash]]),
      incomingContainers: new Map([['/Com/ComConfig/ComIPdu/Msg', incomingHash]]),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.category).toBe('conflict');
    expect(rows[0]?.defaultDecision).toBe('keep-local');
    expect(rows[0]?.conflictDetail).toEqual({ localHash, incomingHash });
  });

  it('classifies containers that diverged from base and converged as converged', () => {
    const baseHash = hash('base');
    const sharedHash = hash('shared');
    const rows = classifyImportRows({
      module: 'Com',
      removedCategoryLabel: 'removed-in-dbc',
      manifestEntries: new Map([['/Com/ComConfig/ComIPdu/Msg', baseHash]]),
      currentContainers: new Map([['/Com/ComConfig/ComIPdu/Msg', sharedHash]]),
      incomingContainers: new Map([['/Com/ComConfig/ComIPdu/Msg', sharedHash]]),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.category).toBe('converged');
    expect(rows[0]?.defaultDecision).toBe('import');
  });

  it('does not classify current-only manual containers', () => {
    const rows = classifyImportRows({
      module: 'Com',
      removedCategoryLabel: 'removed-in-dbc',
      manifestEntries: new Map(),
      currentContainers: new Map([['/Com/ComConfig/ComIPdu/Manual', hash('manual')]]),
      incomingContainers: new Map(),
    });
    expect(rows).toHaveLength(0);
  });

  it('does not resurrect a container deleted locally when the default is keep-local', () => {
    const baseHash = hashContainerForProvenance(container('Deleted'));
    const incomingHash = hashContainerForProvenance(container('Deleted', [container('Child')]));
    const existing = module('Com', [container('Manual')]);
    const incoming = module('Com', [container('Deleted', [container('Child')])]);
    const merged = mergeModuleThreeWay({
      existing,
      incoming,
      baseContainers: new Map([['/Com/Deleted', baseHash]]),
      currentContainers: new Map(),
      incomingContainers: new Map([['/Com/Deleted', incomingHash]]),
      decisions: new Map(),
    });
    expect(
      merged.children.some((child) => child.kind === 'container' && child.shortName === 'Deleted'),
    ).toBe(false);
    expect(
      merged.children.some((child) => child.kind === 'container' && child.shortName === 'Manual'),
    ).toBe(true);
  });

  it('supports the ODX-compatible removed category label', () => {
    const baseHash = hash('base');
    const rows = classifyImportRows({
      module: 'Dcm',
      removedCategoryLabel: 'removed-in-odx',
      manifestEntries: new Map([['/Dcm/DcmConfigSet/Item', baseHash]]),
      currentContainers: new Map([['/Dcm/DcmConfigSet/Item', baseHash]]),
      incomingContainers: new Map(),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.category).toBe('removed-in-odx');
    expect(rows[0]?.defaultDecision).toBe('keep-local');
  });

  it('defaults the removed category label to removed-in-odx for ODX compatibility', () => {
    const baseHash = hash('base');
    const rows = classifyImportRows({
      module: 'Dcm',
      manifestEntries: new Map([['/Dcm/DcmConfigSet/Item', baseHash]]),
      currentContainers: new Map([['/Dcm/DcmConfigSet/Item', baseHash]]),
      incomingContainers: new Map(),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.category).toBe('removed-in-odx');
  });

  it('applies explicit decisions and preserves unrelated manual containers', () => {
    const existing = module('Com', [
      container('Config', [container('Local')]),
      container('Manual'),
    ]);
    const incoming = module('Com', [
      container('Config', [container('Incoming')]),
      container('Added'),
    ]);
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
        ['/Com/Config', 'import'],
        ['/Com/Manual', 'keep-local'],
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
