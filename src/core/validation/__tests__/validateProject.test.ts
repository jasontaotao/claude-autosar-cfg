// Unit tests for the Sprint 6 F6 project-level validation surface:
//   - buildPathIndex(): pure helper that flattens every named element
//     across the project into a `path -> metadata` map.
//   - extractReferences(): pure helper that walks the same tree and
//     emits one RefSite per ArxmlReference element.
//   - checkCrossRefs(): pure resolver that compares every site against
//     the index and emits a 'cross-ref' error per dangling ref.
//   - validateProject(): end-to-end entry point that aggregates
//     single-document errors and the new cross-ref kind.
//
// All cases construct synthetic ArxmlDocument literals (no fixtures, no
// fs) so failures point at the rule under test, not at a parser quirk.

import { describe, it, expect } from 'vitest';

import type {
  ArxmlContainer,
  ArxmlDocument,
  ArxmlElement,
  ArxmlModule,
  ArxmlReference,
} from '../../arxml/types.js';
import {
  buildPathIndex,
  checkCrossRefs,
  extractReferences,
  validate,
  validateProject,
} from '../index.js';

// ---------------------------------------------------------------------------
// Test fixture builders (synthetic, in-memory)
// ---------------------------------------------------------------------------

interface MakeDocOpts {
  readonly pkgName: string;
  readonly elements: readonly ArxmlElement[];
}

function makeDoc(opts: MakeDocOpts): ArxmlDocument {
  return {
    path: 'in-memory',
    version: '4.4',
    packages: [
      {
        shortName: opts.pkgName,
        path: `/${opts.pkgName}`,
        elements: opts.elements,
      },
    ],
  };
}

function makeContainer(shortName: string, children: readonly ArxmlElement[] = []): ArxmlContainer {
  return {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName,
    params: {},
    children,
  };
}

function makeModule(shortName: string, children: readonly ArxmlElement[] = []): ArxmlModule {
  return {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName,
    params: {},
    children,
    references: [],
  };
}

function makeRef(shortName: string | undefined, value: string, dest?: string): ArxmlReference {
  const ref: ArxmlReference = {
    kind: 'reference',
    tagName: 'VALUE-REF',
    value,
    ...(dest !== undefined ? { dest } : {}),
  };
  // The ArxmlReference type allows undefined shortName; assign only when
  // provided so we never serialize a phantom property.
  if (shortName !== undefined) {
    return { ...ref, shortName };
  }
  return ref;
}

// ---------------------------------------------------------------------------
// buildPathIndex
// ---------------------------------------------------------------------------

describe('buildPathIndex', () => {
  it('returns an empty Map for an empty documents array', () => {
    const index = buildPathIndex([]);
    expect(index).toBeInstanceOf(Map);
    expect(index.size).toBe(0);
  });

  it('indexes a single document with one container', () => {
    const doc = makeDoc({
      pkgName: 'A',
      elements: [makeModule('A_Mod', [makeContainer('Child')])],
    });
    const index = buildPathIndex([doc]);

    // /A/A_Mod (module) and /A/A_Mod/Child (container)
    expect(index.size).toBe(2);
    expect(index.get('/A/A_Mod')).toEqual({
      path: '/A/A_Mod',
      kind: 'module',
      shortName: 'A_Mod',
    });
    expect(index.get('/A/A_Mod/Child')).toEqual({
      path: '/A/A_Mod/Child',
      kind: 'container',
      shortName: 'Child',
    });
  });

  it('indexes deeply nested containers at every level', () => {
    const doc = makeDoc({
      pkgName: 'P',
      elements: [
        makeModule('M', [makeContainer('L1', [makeContainer('L2', [makeContainer('L3')])])]),
      ],
    });
    const index = buildPathIndex([doc]);

    expect(index.size).toBe(4);
    expect(index.has('/P/M')).toBe(true);
    expect(index.has('/P/M/L1')).toBe(true);
    expect(index.has('/P/M/L1/L2')).toBe(true);
    expect(index.has('/P/M/L1/L2/L3')).toBe(true);
    // Container entries do not carry a dest field — it's only set for
    // references that carry the original DEST attribute.
    const leaf = index.get('/P/M/L1/L2/L3');
    expect(leaf).toEqual({ path: '/P/M/L1/L2/L3', kind: 'container', shortName: 'L3' });
  });

  it('aggregates entries from multiple documents and multiple packages', () => {
    const doc1: ArxmlDocument = {
      path: 'd1',
      version: '4.4',
      packages: [
        {
          shortName: 'P1',
          path: '/P1',
          elements: [makeModule('M1', [makeContainer('C1')])],
        },
      ],
    };
    const doc2: ArxmlDocument = {
      path: 'd2',
      version: '4.4',
      packages: [
        {
          shortName: 'P2',
          path: '/P2',
          elements: [makeModule('M2', [makeContainer('C2')])],
        },
      ],
    };
    const index = buildPathIndex([doc1, doc2]);

    // 2 modules + 2 containers = 4 entries
    expect(index.size).toBe(4);
    expect(index.has('/P1/M1')).toBe(true);
    expect(index.has('/P1/M1/C1')).toBe(true);
    expect(index.has('/P2/M2')).toBe(true);
    expect(index.has('/P2/M2/C2')).toBe(true);
  });

  it('indexes a named reference (with shortName) as kind=reference and carries dest', () => {
    const ref = makeRef('MyRef', '/A/A_Mod/Child', 'ECUC-CONTAINER-VALUE');
    const doc = makeDoc({
      pkgName: 'A',
      elements: [makeModule('A_Mod', [makeContainer('Holder', [ref])])],
    });
    const index = buildPathIndex([doc]);

    expect(index.has('/A/A_Mod/Holder/MyRef')).toBe(true);
    const entry = index.get('/A/A_Mod/Holder/MyRef');
    expect(entry).toEqual({
      path: '/A/A_Mod/Holder/MyRef',
      kind: 'reference',
      shortName: 'MyRef',
      dest: 'ECUC-CONTAINER-VALUE',
    });
  });

  it('skips references that have no shortName (nameless VALUE-REF inside SHORT-NAME-PATTERN)', () => {
    const nameless = makeRef(undefined, '/A/A_Mod/Child');
    const doc = makeDoc({
      pkgName: 'A',
      elements: [makeModule('A_Mod', [makeContainer('Holder', [nameless])])],
    });
    const index = buildPathIndex([doc]);

    // Module + Holder container, but the nameless ref must NOT add an entry.
    expect(index.size).toBe(2);
    expect(index.has('/A/A_Mod/Holder')).toBe(true);
    expect(index.has('/A/A_Mod/Holder/')).toBe(false);
  });

  it('overwrites an earlier entry when two documents emit the same path', () => {
    // Same logical path produced from two different documents. The second
    // declaration wins — callers should not depend on a stable order.
    const doc1 = makeDoc({
      pkgName: 'P',
      elements: [makeModule('M', [makeContainer('Shared')])],
    });
    const doc2 = makeDoc({
      pkgName: 'P',
      elements: [makeModule('M', [makeContainer('Shared')])],
    });
    const index = buildPathIndex([doc1, doc2]);

    expect(index.size).toBe(2);
    expect(index.get('/P/M/Shared')?.kind).toBe('container');
  });
});

// ---------------------------------------------------------------------------
// extractReferences
// ---------------------------------------------------------------------------

describe('extractReferences', () => {
  it('returns an empty array for an empty documents array', () => {
    const sites = extractReferences([]);
    expect(sites).toEqual([]);
  });

  it('extracts a single reference with the parent container as sourcePath', () => {
    const ref = makeRef('MyRef', '/A/A_Mod/Target', 'ECUC-CONTAINER-VALUE');
    const doc = makeDoc({
      pkgName: 'A',
      elements: [makeModule('A_Mod', [makeContainer('Holder', [ref])])],
    });
    const sites = extractReferences([doc]);

    expect(sites).toHaveLength(1);
    expect(sites[0]).toEqual({
      sourcePath: '/A/A_Mod/Holder',
      targetPath: '/A/A_Mod/Target',
      targetDest: 'ECUC-CONTAINER-VALUE',
      tagName: 'VALUE-REF',
    });
  });

  it('records a deeper sourcePath for references nested in deeper containers', () => {
    const ref = makeRef('Ref', '/A/M/L1/L2/Target');
    const doc = makeDoc({
      pkgName: 'A',
      elements: [makeModule('M', [makeContainer('L1', [makeContainer('L2', [ref])])])],
    });
    const sites = extractReferences([doc]);

    expect(sites).toHaveLength(1);
    expect(sites[0]!.sourcePath).toBe('/A/M/L1/L2');
  });

  it('aggregates references across multiple documents', () => {
    const ref1 = makeRef('R1', '/P1/M1/Target');
    const ref2 = makeRef('R2', '/P2/M2/Other');
    const doc1 = makeDoc({
      pkgName: 'P1',
      elements: [makeModule('M1', [makeContainer('Holder', [ref1])])],
    });
    const doc2 = makeDoc({
      pkgName: 'P2',
      elements: [makeModule('M2', [makeContainer('Holder', [ref2])])],
    });
    const sites = extractReferences([doc1, doc2]);

    expect(sites).toHaveLength(2);
    const targets = sites.map((s) => s.targetPath).sort();
    expect(targets).toEqual(['/P1/M1/Target', '/P2/M2/Other']);
  });

  it('extracts a reference whose targetPath is an empty string (caller decides what to do)', () => {
    const ref = makeRef('Empty', '');
    const doc = makeDoc({
      pkgName: 'P',
      elements: [makeModule('M', [makeContainer('Holder', [ref])])],
    });
    const sites = extractReferences([doc]);

    // extractReferences is a faithful walker — it does not filter the
    // placeholder; that's checkCrossRefs's job.
    expect(sites).toHaveLength(1);
    expect(sites[0]!.targetPath).toBe('');
  });

  it('extracts a reference whose targetPath ends in a trailing slash (placeholder form)', () => {
    const ref = makeRef('Trailing', '/A/M/NotSet/');
    const doc = makeDoc({
      pkgName: 'A',
      elements: [makeModule('M', [makeContainer('Holder', [ref])])],
    });
    const sites = extractReferences([doc]);

    expect(sites).toHaveLength(1);
    expect(sites[0]!.targetPath).toBe('/A/M/NotSet/');
  });

  it('extracts references that live directly under a module (not under a container)', () => {
    const ref = makeRef('TopRef', '/P/M/Somewhere');
    const doc = makeDoc({
      pkgName: 'P',
      elements: [makeModule('M', [ref])],
    });
    const sites = extractReferences([doc]);

    expect(sites).toHaveLength(1);
    expect(sites[0]!.sourcePath).toBe('/P/M');
  });
});

// ---------------------------------------------------------------------------
// checkCrossRefs
// ---------------------------------------------------------------------------

describe('checkCrossRefs', () => {
  it('returns 0 errors when every reference target resolves in the index', () => {
    const index = new Map([
      ['/A/M/Target', { path: '/A/M/Target', kind: 'container' as const, shortName: 'Target' }],
    ]);
    const sites = [
      {
        sourcePath: '/A/M/Source',
        targetPath: '/A/M/Target',
        tagName: 'VALUE-REF',
      },
    ];
    const errors = checkCrossRefs(sites, index);
    expect(errors).toEqual([]);
  });

  it('emits one cross-ref error per dangling reference, using sourcePath as the error path', () => {
    const index = new Map<string, never>();
    const sites = [
      {
        sourcePath: '/A/M/Source',
        targetPath: '/A/M/Missing',
        tagName: 'VALUE-REF',
      },
    ];
    const errors = checkCrossRefs(sites, index);

    expect(errors).toHaveLength(1);
    const e = errors[0]!;
    expect(e.kind).toBe('cross-ref');
    // error.path is the SOURCE path, not the missing target — so users
    // can jump to the container holding the broken ref.
    expect(e.path).toBe('/A/M/Source');
    // The unreachable target shows up in `actual` and in the message body.
    expect(e.actual).toBe('/A/M/Missing');
    expect(e.message).toContain('/A/M/Missing');
  });

  it('emits one error per dangling ref when several targets are missing', () => {
    const index = new Map<string, never>();
    const sites = [
      { sourcePath: '/A/M/S1', targetPath: '/A/M/Miss1', tagName: 'VALUE-REF' },
      { sourcePath: '/A/M/S2', targetPath: '/A/M/Miss2', tagName: 'VALUE-REF' },
      { sourcePath: '/A/M/S3', targetPath: '/A/M/Miss3', tagName: 'VALUE-REF' },
    ];
    const errors = checkCrossRefs(sites, index);

    expect(errors).toHaveLength(3);
    expect(errors.every((e) => e.kind === 'cross-ref')).toBe(true);
    const sourcePaths = errors.map((e) => e.path).sort();
    expect(sourcePaths).toEqual(['/A/M/S1', '/A/M/S2', '/A/M/S3']);
  });

  it('skips references with an empty targetPath (unset placeholder) without emitting errors', () => {
    const index = new Map<string, never>();
    const sites = [{ sourcePath: '/A/M/Source', targetPath: '', tagName: 'VALUE-REF' }];
    const errors = checkCrossRefs(sites, index);
    expect(errors).toEqual([]);
  });

  it('skips references with a trailing-slash targetPath (unset placeholder form)', () => {
    const index = new Map<string, never>();
    const sites = [{ sourcePath: '/A/M/Source', targetPath: '/A/M/NotSet/', tagName: 'VALUE-REF' }];
    const errors = checkCrossRefs(sites, index);
    expect(errors).toEqual([]);
  });

  it('mixes resolved and dangling refs in the same call — only dangling ones produce errors', () => {
    const index = new Map([
      ['/A/M/OK', { path: '/A/M/OK', kind: 'container' as const, shortName: 'OK' }],
    ]);
    const sites = [
      { sourcePath: '/A/M/S1', targetPath: '/A/M/OK', tagName: 'VALUE-REF' },
      { sourcePath: '/A/M/S2', targetPath: '/A/M/Missing', tagName: 'VALUE-REF' },
    ];
    const errors = checkCrossRefs(sites, index);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe('/A/M/S2');
  });
});

// ---------------------------------------------------------------------------
// validateProject (end-to-end)
// ---------------------------------------------------------------------------

describe('validateProject', () => {
  it('returns 0 errors and does not crash on an empty documents array', () => {
    const errors = validateProject([]);
    expect(errors).toEqual([]);
  });

  it('returns 0 cross-ref errors when a single document is fully self-consistent', () => {
    // A module that defines /A/M/Target and references it from /A/M/Source.
    const ref = makeRef('Link', '/A/M/Target');
    const doc = makeDoc({
      pkgName: 'A',
      elements: [makeModule('M', [makeContainer('Source', [ref]), makeContainer('Target')])],
    });

    const errors = validateProject([doc]);
    const crossRefErrors = errors.filter((e) => e.kind === 'cross-ref');
    expect(crossRefErrors).toEqual([]);
  });

  it('resolves cross-document references (doc A defines the target, doc B consumes it)', () => {
    // Doc A: defines /Alpha/M/Target as a container.
    // Doc B: a reference in /Beta/M/Source points at /Alpha/M/Target.
    const docA = makeDoc({
      pkgName: 'Alpha',
      elements: [makeModule('M', [makeContainer('Target')])],
    });
    const docB = makeDoc({
      pkgName: 'Beta',
      elements: [makeModule('M', [makeContainer('Source', [makeRef('Link', '/Alpha/M/Target')])])],
    });

    const errors = validateProject([docA, docB]);
    const crossRefErrors = errors.filter((e) => e.kind === 'cross-ref');
    expect(crossRefErrors).toEqual([]);
  });

  it('emits a cross-ref error when a cross-document target is missing', () => {
    const docA = makeDoc({
      pkgName: 'Alpha',
      elements: [makeModule('M', [makeContainer('Other')])],
    });
    const docB = makeDoc({
      pkgName: 'Beta',
      elements: [makeModule('M', [makeContainer('Source', [makeRef('Link', '/Alpha/M/Target')])])],
    });

    const errors = validateProject([docA, docB]);
    const crossRefErrors = errors.filter((e) => e.kind === 'cross-ref');
    expect(crossRefErrors).toHaveLength(1);
    expect(crossRefErrors[0]!.path).toBe('/Beta/M/Source');
    expect(crossRefErrors[0]!.actual).toBe('/Alpha/M/Target');
  });

  it('preserves the single-document validate() surface (no extra errors for a clean doc)', () => {
    // Empty doc — validate() returns [] and validateProject() must agree.
    const doc = makeDoc({ pkgName: 'Empty', elements: [] });
    const single = validate(doc);
    const project = validateProject([doc]);
    expect(project).toEqual(single);
    expect(project).toEqual([]);
  });
});
