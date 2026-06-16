// Unit tests for `validateProjectForRenderer` — Sprint 10 commit #1.
//
// This helper is the dispatch entry the renderer goes through. It owns
// the policy decision "should I run the single-doc validator (5 kinds)
// or the project-level pipeline (9 kinds)?". Pushing this decision
// into core (instead of letting the store import whichever core entry
// it wants) inverts the layering that the architect review flagged as
// the root cause of the 6-of-9-kind invisibility bug.
//
// Contract pinned by this file:
//   1. `documents = []` (any level / no opts) → `[]`
//   2. `level: 'single'` runs only `validate(doc)` per doc — never
//      emits project-level kinds ('cross-ref', 'ref-dest', 'ref-cycle')
//   3. `level: 'project'` (or default) runs `validateProject(documents)`
//      — emits the full 9-kind surface
//   4. Default level is 'project' (no opts ≡ `{ level: 'project' }`)
//   5. Returned array is `readonly ValidationError[]`
//
// All cases use synthetic in-memory ArxmlDocument literals — no
// fixtures, no fs — so failures point at the dispatch rule, not at
// a parser quirk.

import { describe, it, expect } from 'vitest';

import type { ArxmlContainer, ArxmlDocument, ArxmlModule, ParamValue } from '../../arxml/types.js';
import { validateProjectForRenderer } from '../index.js';

// ---------------------------------------------------------------------------
// Test fixture builders (synthetic, in-memory)
// ---------------------------------------------------------------------------

interface WdgIfDocOpts {
  /** WdgIfDeviceIndex value; out of [0,255] triggers a 'range' error. */
  readonly deviceIndex: number;
  /** WdgIfDriverRef target path; if non-empty and not in pathIndex, fires 'cross-ref'. */
  readonly driverRef: string;
  /** DEST attribute on the WdgIfDriverRef. Defaults to 'ECUC-CONTAINER-VALUE'. */
  readonly driverRefDest?: string;
}

function makeWdgIfDoc(opts: WdgIfDocOpts): ArxmlDocument {
  const deviceParams: Readonly<Record<string, ParamValue>> = {
    WdgIfDeviceIndex: { type: 'integer', value: opts.deviceIndex },
    ...(opts.driverRef === ''
      ? {}
      : {
          WdgIfDriverRef: {
            type: 'reference',
            value: opts.driverRef,
            dest: opts.driverRefDest ?? 'ECUC-CONTAINER-VALUE',
          },
        }),
  };
  const device: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'WdgIfDevice',
    params: deviceParams,
    children: [],
  };
  const wdgIf: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'WdgIf',
    params: {},
    children: [device],
    references: opts.driverRef === '' ? [] : [opts.driverRef],
  };
  return {
    path: 'in-memory',
    version: '4.4',
    packages: [
      {
        shortName: 'EcucDefs',
        path: '/EcucDefs',
        elements: [wdgIf],
      },
    ],
  };
}

/** A second document that holds a real container at /OtherPkg/SomeContainer
 *  so cross-doc resolution differs from intra-doc dangling refs. */
function makeOtherPkgDoc(): ArxmlDocument {
  const target: ArxmlContainer = {
    kind: 'container',
    tagName: 'ECUC-CONTAINER-VALUE',
    shortName: 'SomeContainer',
    params: {},
    children: [],
  };
  return {
    path: 'in-memory',
    version: '4.4',
    packages: [
      {
        shortName: 'OtherPkg',
        path: '/OtherPkg',
        elements: [target],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 1. Empty documents — every level returns []
// ---------------------------------------------------------------------------

describe('validateProjectForRenderer — empty documents', () => {
  it('returns [] for empty documents with level=single', () => {
    expect(validateProjectForRenderer([], { level: 'single' })).toEqual([]);
  });

  it('returns [] for empty documents with level=project', () => {
    expect(validateProjectForRenderer([], { level: 'project' })).toEqual([]);
  });

  it('returns [] for empty documents with no opts (default project)', () => {
    expect(validateProjectForRenderer([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Single doc with both single-doc kind AND cross-ref
//    Doc has: WdgIfDeviceIndex=999 (range) + WdgIfDriverRef → /No/Where (cross-ref)
//    level=single → range only
//    level=project → range + cross-ref
//    no opts → project (range + cross-ref)
// ---------------------------------------------------------------------------

describe('validateProjectForRenderer — single doc with both kinds', () => {
  const doc = makeWdgIfDoc({ deviceIndex: 999, driverRef: '/No/Where' });

  it('with level=single returns the range error but suppresses cross-ref', () => {
    const errors = validateProjectForRenderer([doc], { level: 'single' });
    const kinds = new Set(errors.map((e) => e.kind));
    expect(kinds.has('range')).toBe(true);
    expect(kinds.has('cross-ref')).toBe(false);
    expect(kinds.has('ref-dest')).toBe(false);
    expect(kinds.has('ref-cycle')).toBe(false);
  });

  it('with level=project returns range AND cross-ref', () => {
    const errors = validateProjectForRenderer([doc], { level: 'project' });
    const kinds = new Set(errors.map((e) => e.kind));
    expect(kinds.has('range')).toBe(true);
    expect(kinds.has('cross-ref')).toBe(true);
  });

  it('default level is project (no opts ≡ { level: "project" })', () => {
    const errors = validateProjectForRenderer([doc]);
    const kinds = new Set(errors.map((e) => e.kind));
    expect(kinds.has('range')).toBe(true);
    expect(kinds.has('cross-ref')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Multiple docs with cross-doc dangling ref
//    Doc A: WdgIfDriverRef → /OtherPkg/SomeContainer (valid target exists in doc B)
//           — this would NOT fire cross-ref even at project level
//    Instead, doc A: WdgIfDriverRef → /OtherPkg/NonExistent (dangling cross-doc ref)
//    level=single → no cross-ref (each doc validates locally without pathIndex sharing)
//    level=project → cross-ref surfaces
// ---------------------------------------------------------------------------

describe('validateProjectForRenderer — cross-doc dangling ref', () => {
  it('with level=single does not surface cross-doc refs', () => {
    const docA = makeWdgIfDoc({ deviceIndex: 0, driverRef: '/OtherPkg/NonExistent' });
    const docB = makeOtherPkgDoc();
    const errors = validateProjectForRenderer([docA, docB], { level: 'single' });
    expect(errors.some((e) => e.kind === 'cross-ref')).toBe(false);
  });

  it('with level=project surfaces cross-doc dangling refs', () => {
    const docA = makeWdgIfDoc({ deviceIndex: 0, driverRef: '/OtherPkg/NonExistent' });
    const docB = makeOtherPkgDoc();
    const errors = validateProjectForRenderer([docA, docB], { level: 'project' });
    expect(errors.some((e) => e.kind === 'cross-ref')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Return-shape contract: readonly array, multiple docs concatenate
// ---------------------------------------------------------------------------

describe('validateProjectForRenderer — return shape', () => {
  it('returns a readonly array (typed as readonly ValidationError[])', () => {
    const errors = validateProjectForRenderer([makeWdgIfDoc({ deviceIndex: 0, driverRef: '' })]);
    // readonly arrays still have .length — the type contract is what matters
    expect(Array.isArray(errors)).toBe(true);
    expect(errors.length).toBeGreaterThanOrEqual(0);
  });

  it('aggregates single-doc kinds from all documents at level=single', () => {
    // Two docs each with a range violation; level=single should return ≥2 range errors
    const docA = makeWdgIfDoc({ deviceIndex: 999, driverRef: '' });
    const docB = makeWdgIfDoc({ deviceIndex: -1, driverRef: '' });
    const errors = validateProjectForRenderer([docA, docB], { level: 'single' });
    const rangeErrors = errors.filter((e) => e.kind === 'range');
    expect(rangeErrors.length).toBeGreaterThanOrEqual(2);
  });
});
