// core/mutation/__tests__/apply-patch-replace-rejects-shape.test.ts
//
// SE-7 (v1.17.0) — applyPatchSteps.replace rejects non-{value: string, dest?: string}
// shapes on reference params with patch-invalid error.
//
// Pre-T6, the replace op silently coerced unknown payloads via
// coerceToParamValue's `String(raw)` fallback (applyPatchSteps.ts:491),
// risking round-trip of attacker-controlled value text as warning
// text. The post-T6 fix narrows the reference branch to require
// either `{ value: string }` or `{ value: string, dest: string }`,
// rejecting bare scalars, numbers, and other shapes with
// `kind: 'patch-invalid'`.
//
// Reuses the same build-helper pattern as applyPatchSteps.test.ts
// (makeParamValue + makeRefDoc) — the existing test file does not
// export a `buildDocWithRefParam` helper, so we inline it locally.

import { describe, expect, it } from 'vitest';

import type { PatchStep } from '../../../shared/headless/ipc-contract.js';
import type { ArxmlContainer, ArxmlDocument, ArxmlModule, ParamValue } from '../../arxml/types.js';
import { applyPatchSteps } from '../applyPatchSteps.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Build a minimal ArxmlDocument with a single `Ref` reference param. */
function makeRefDoc(): ArxmlDocument {
  const moduleEl: ArxmlModule = {
    kind: 'module',
    tagName: 'ECUC-MODULE-CONFIGURATION-VALUES',
    shortName: 'Com',
    params: {},
    children: [
      {
        kind: 'container',
        tagName: 'ECUC-CONTAINER-VALUE',
        shortName: 'ComGeneral',
        params: {
          Ref: {
            type: 'reference',
            value: '/Vendor/Original',
          } as ParamValue,
        },
        children: [],
      } as ArxmlContainer,
    ],
    references: [],
  };
  return {
    path: 'Com.arxml',
    version: '4.2',
    packages: [
      {
        shortName: 'EcucDefs',
        path: '/EcucDefs',
        elements: [moduleEl],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('applyPatchSteps.replace shape rejection (SE-7)', () => {
  it('rejects replace op on reference param with bare number value', () => {
    const doc = makeRefDoc();
    const steps: PatchStep[] = [
      {
        op: 'replace',
        path: '/EcucDefs/Com/ComGeneral/Ref',
        // SE-7: deliberately passing a bare scalar where {value, dest?}
        // is required. Pre-T6 coerceToParamValue coerced this via
        // String(raw) → "42", silently mutating the reference value.
        // Post-T6 the replace op rejects this with patch-invalid.
        // `replace.value` is typed `unknown`, so a raw number is
        // type-legal but semantically wrong for reference params —
        // this is the security-sensitive case the SE-7 fix targets.
        value: 42,
      },
    ];

    const result = applyPatchSteps(doc, steps);
    expect(result.applied).toBe(0);
    expect(result.errors).toHaveLength(1);
    const err = result.errors[0];
    expect(err?.stepIndex).toBe(0);
    expect(err?.kind).toBe('patch-invalid');
    expect(err?.message).toMatch(/replace op on reference param requires/);
  });

  it('rejects replace op on reference param with bare string value', () => {
    const doc = makeRefDoc();
    const steps: PatchStep[] = [
      {
        op: 'replace',
        path: '/EcucDefs/Com/ComGeneral/Ref',
        // Bare string is type-legal (`unknown`) but semantically
        // wrong: a reference param requires `{ value, dest? }`.
        // Pre-T6 the String(raw) fallback silently coerced this.
        value: '/Vendor/Other',
      },
    ];

    const result = applyPatchSteps(doc, steps);
    expect(result.applied).toBe(0);
    expect(result.errors).toHaveLength(1);
    const err = result.errors[0];
    expect(err?.stepIndex).toBe(0);
    expect(err?.kind).toBe('patch-invalid');
    expect(err?.message).toMatch(/replace op on reference param requires/);
  });

  it('accepts replace op on reference param with {value} shape (no dest)', () => {
    const doc = makeRefDoc();
    const steps: PatchStep[] = [
      {
        op: 'replace',
        path: '/EcucDefs/Com/ComGeneral/Ref',
        value: { value: '/Vendor/Other' },
      },
    ];

    const result = applyPatchSteps(doc, steps);
    expect(result.errors).toEqual([]);
    expect(result.applied).toBe(1);
    const comGeneral = doc.packages[0]?.elements[0];
    if (comGeneral === undefined || comGeneral.kind !== 'module') {
      throw new Error('expected Com module');
    }
    const refChild = comGeneral.children[0];
    if (refChild === undefined || refChild.kind !== 'container') {
      throw new Error('expected ComGeneral container');
    }
    expect(refChild.params['Ref']).toEqual({
      type: 'reference',
      value: '/Vendor/Other',
    });
  });

  it('accepts replace op on reference param with {value, dest} shape', () => {
    const doc = makeRefDoc();
    const steps: PatchStep[] = [
      {
        op: 'replace',
        path: '/EcucDefs/Com/ComGeneral/Ref',
        value: { value: '/Vendor/Other', dest: '/Vendor/Other' },
      },
    ];

    const result = applyPatchSteps(doc, steps);
    expect(result.errors).toEqual([]);
    expect(result.applied).toBe(1);
    const comGeneral = doc.packages[0]?.elements[0];
    if (comGeneral === undefined || comGeneral.kind !== 'module') {
      throw new Error('expected Com module');
    }
    const refChild = comGeneral.children[0];
    if (refChild === undefined || refChild.kind !== 'container') {
      throw new Error('expected ComGeneral container');
    }
    expect(refChild.params['Ref']).toEqual({
      type: 'reference',
      value: '/Vendor/Other',
      dest: '/Vendor/Other',
    });
  });
});
