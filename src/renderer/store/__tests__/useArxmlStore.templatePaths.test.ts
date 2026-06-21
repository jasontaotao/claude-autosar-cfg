// @vitest-environment jsdom
//
// v1.8.0 K Stencil Task 10 — `templatePaths` slice (reopen-as-template).
//
// Per the KISS design there is no separate "template" concept; any
// .arxml loaded via File → Open is a template. The store tracks this
// per-path via `templatePaths: ReadonlySet<string>`. Test pins:
//
//   1. addDocument without `options.template` does NOT add the path
//      to templatePaths (default = false). Newly created / Stencil
//      Wizard docs stay out of the set.
//   2. addDocument with `options.template = true` adds the path.
//   3. addDocument with `options.template = true` is idempotent on
//      re-load (Set semantics).
//   4. removeDocument drops the path from templatePaths.
//   5. clear() resets templatePaths to an empty set.
//   6. removeDocument on a non-template path doesn't allocate a new
//      Set (identity preserved — cheap path).

import { describe, it, expect, beforeEach } from 'vitest';

import type { ArxmlDocument } from '@core/arxml/types';

import { useArxmlStore } from '../useArxmlStore.js';

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
            children: [],
            references: [],
          },
        ],
      },
    ],
  };
}

describe('useArxmlStore — templatePaths (K Stencil Task 10)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
  });

  it('addDocument without options.template leaves templatePaths empty (default = false)', () => {
    useArxmlStore.getState().addDocument(buildDoc(), '/tmp/new.arxml');
    expect(useArxmlStore.getState().templatePaths.size).toBe(0);
    expect(useArxmlStore.getState().templatePaths.has('/tmp/new.arxml')).toBe(false);
  });

  it('addDocument with options.template = true adds the path', () => {
    useArxmlStore
      .getState()
      .addDocument(buildDoc(), '/tmp/opened.arxml', { template: true });
    expect(useArxmlStore.getState().templatePaths.has('/tmp/opened.arxml')).toBe(true);
  });

  it('addDocument with options.template = false is a no-op for templatePaths', () => {
    useArxmlStore
      .getState()
      .addDocument(buildDoc(), '/tmp/not-template.arxml', { template: false });
    expect(useArxmlStore.getState().templatePaths.has('/tmp/not-template.arxml')).toBe(false);
  });

  it('addDocument with options.template is idempotent on re-load (Set semantics)', () => {
    const store = useArxmlStore.getState();
    store.addDocument(buildDoc(), '/tmp/reload.arxml', { template: true });
    store.addDocument(buildDoc(), '/tmp/reload.arxml', { template: true });
    expect(useArxmlStore.getState().templatePaths.size).toBe(1);
    expect(useArxmlStore.getState().templatePaths.has('/tmp/reload.arxml')).toBe(true);
  });

  it('mixing template and non-template addDocument calls only marks the opted-in paths', () => {
    const store = useArxmlStore.getState();
    store.addDocument(buildDoc(), '/tmp/a.arxml', { template: true });
    store.addDocument(buildDoc(), '/tmp/b.arxml');
    store.addDocument(buildDoc(), '/tmp/c.arxml', { template: true });
    const set = useArxmlStore.getState().templatePaths;
    expect(set.size).toBe(2);
    expect(set.has('/tmp/a.arxml')).toBe(true);
    expect(set.has('/tmp/b.arxml')).toBe(false);
    expect(set.has('/tmp/c.arxml')).toBe(true);
  });

  it('removeDocument drops the path from templatePaths', () => {
    const store = useArxmlStore.getState();
    store.addDocument(buildDoc(), '/tmp/x.arxml', { template: true });
    store.addDocument(buildDoc(), '/tmp/y.arxml', { template: true });
    expect(useArxmlStore.getState().templatePaths.size).toBe(2);
    store.removeDocument('/tmp/x.arxml');
    const set = useArxmlStore.getState().templatePaths;
    expect(set.has('/tmp/x.arxml')).toBe(false);
    expect(set.has('/tmp/y.arxml')).toBe(true);
  });

  it('removeDocument on a non-template path does not allocate a new Set', () => {
    const store = useArxmlStore.getState();
    store.addDocument(buildDoc(), '/tmp/x.arxml');
    const before = useArxmlStore.getState().templatePaths;
    store.removeDocument('/tmp/x.arxml');
    // Identity preserved (cheap path; no allocation when nothing to drop).
    expect(useArxmlStore.getState().templatePaths).toBe(before);
  });

  it('clear() resets templatePaths to an empty set', () => {
    const store = useArxmlStore.getState();
    store.addDocument(buildDoc(), '/tmp/a.arxml', { template: true });
    store.addDocument(buildDoc(), '/tmp/b.arxml', { template: true });
    expect(useArxmlStore.getState().templatePaths.size).toBe(2);
    useArxmlStore.getState().clear();
    expect(useArxmlStore.getState().templatePaths.size).toBe(0);
  });
});
