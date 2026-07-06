// v1.28.1 PATCH — direct unit tests for the `addChildSiblingStep` helper.
//
// Pre-v1.28.1, this helper was exercised only via the v1.27.0 T5 cross-vendor
// invariant (`xlsxDcmServicesToEcucBatch.test.ts` describe
// `real-OEM cross-vendor invariant`), which catches observable EMISSION
// drift across BSWMD provenance. The direct test here pins the helper's
// internal PatchStep shape (`parentPath`, `shortName`, `definitionRef`,
// null/undefined skipping) so future refactors of the helper (e.g., the
// v1.29.0 MINOR Com-stack mapper-shape alignment) cannot silently shift
// the per-row emission without these tests breaking first.
//
// Each `it()` documents ONE observable behavior. AAA structure (Arrange,
// Act, Assert) per project testing.md.

import { describe, it, expect } from 'vitest';

import type { PatchStep } from '../../../shared/headless/ipc-contract.js';
import { addChildSiblingStep } from '../addChildSiblingStep.js';

describe('addChildSiblingStep', () => {
  it('emits exactly one add-child step when instanceParams is empty', () => {
    // Arrange
    const input = {
      moduleShortName: 'Dcm',
      instanceShortName: 'DcmDspClearDTC',
      containerDefPath: '/Dcm/Dcm/DcmDspClearDTC',
      instanceParams: {},
    };

    // Act
    const steps = addChildSiblingStep(input);

    // Assert — no set-param steps follow when no defined params.
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      op: 'add-child',
      parentPath: 'Dcm',
      shortName: 'DcmDspClearDTC',
      definitionRef: '/Dcm/Dcm/DcmDspClearDTC',
    });
  });

  it('emits add-child with moduleShortName as parentPath + instanceShortName + definitionRef', () => {
    // Arrange
    const input = {
      moduleShortName: 'PduR',
      instanceShortName: 'CanTpTx',
      containerDefPath: '/PduR/PduR/PduRRoutingPath',
      instanceParams: {},
    };

    // Act
    const [step] = addChildSiblingStep(input);

    // Assert — each field verbatim.
    expect(step).toEqual({
      op: 'add-child',
      parentPath: 'PduR',
      shortName: 'CanTpTx',
      definitionRef: '/PduR/PduR/PduRRoutingPath',
    });
  });

  it('emits one set-param step per defined non-null param entry', () => {
    // Arrange — 3 defined params (string / number / boolean).
    const input = {
      moduleShortName: 'Dcm',
      instanceShortName: 'ReadVbatt',
      containerDefPath: '/Dcm/Dcm/DcmDspReadDataById',
      instanceParams: {
        didRef: 'Vbatt',
        sessionRef: 1,
        isActive: true,
      },
    };

    // Act
    const steps = addChildSiblingStep(input);

    // Assert — 1 add-child + 3 set-param = 4 total, in emit order.
    expect(steps).toHaveLength(4);
    expect(steps[0]).toMatchObject({ op: 'add-child', shortName: 'ReadVbatt' });

    // set-param steps share the containerPath `${moduleShortName}/${instanceShortName}`
    // — they target the freshly-added container.
    const setParamSteps = steps.slice(1) as Array<Extract<PatchStep, { op: 'set-param' }>>;
    expect(setParamSteps[0]).toEqual({
      op: 'set-param',
      containerPath: 'Dcm/ReadVbatt',
      paramName: 'didRef',
      value: 'Vbatt',
    });
    expect(setParamSteps[1]).toEqual({
      op: 'set-param',
      containerPath: 'Dcm/ReadVbatt',
      paramName: 'sessionRef',
      value: 1,
    });
    expect(setParamSteps[2]).toEqual({
      op: 'set-param',
      containerPath: 'Dcm/ReadVbatt',
      paramName: 'isActive',
      value: true,
    });
  });

  it('skips param entries whose value is null', () => {
    // Arrange — the `AddChildSiblingStepInput.instanceParams` type is
    // `Readonly<Record<string, string | number | boolean | null>>`,
    // so only `null` (not `undefined`) is type-allowed for a `null`
    // skip. Empty-string `''` is NOT null, so it stays.
    const input = {
      moduleShortName: 'Dcm',
      instanceShortName: 'StartErase',
      containerDefPath: '/Dcm/Dcm/DcmDspRoutine',
      instanceParams: {
        routineRef: 'EraseMemory',
        nullParam: null,
        numericParam: 42,
        zeroString: '',
      },
    };

    // Act
    const steps = addChildSiblingStep(input);

    // Assert — 1 add-child + 3 set-param (nullParam dropped).
    expect(steps).toHaveLength(4);
    const setParamSteps = steps
      .slice(1)
      .map((s) => (s as Extract<PatchStep, { op: 'set-param' }>).paramName);
    expect(setParamSteps).toEqual(['routineRef', 'numericParam', 'zeroString']);
  });

  // v1.29.0 MINOR — Com-stack mapper shape alignment. The helper now
  // accepts an optional `parentPath` (caller-provided leaf-parent path)
  // and an optional `containerDefPath` (omits `definitionRef` key when
  // absent). The Dcm mapper's existing call sites remain valid because
  // `moduleShortName` and `containerDefPath` are still accepted (now
  // as optional fields with the old semantics).

  it('emits add-child with caller-provided parentPath instead of moduleShortName', () => {
    // Arrange — Com-stack mapper passes a multi-segment leaf-parent path.
    const input = {
      parentPath: 'Com/ComConfig/ComIPdu',
      instanceShortName: 'TxPdu_Foo',
      containerDefPath: '/AUTOSAR/EcuCDefs/Com/ComConfig/ComIPdu',
      instanceParams: {},
    };

    // Act
    const [step] = addChildSiblingStep(input) as [Extract<PatchStep, { op: 'add-child' }>];

    // Assert — caller-provided parentPath wins; moduleShortName is not
    // consulted at all.
    expect(step.parentPath).toBe('Com/ComConfig/ComIPdu');
    expect(step.shortName).toBe('TxPdu_Foo');
  });

  it('containerDefPath omitted → add-child has no definitionRef key', () => {
    // Arrange — Com-stack mapper's `row.definitionRef === undefined` case.
    const input = {
      parentPath: 'Com/ComConfig/ComIPdu',
      instanceShortName: 'Pdu_Engine',
      instanceParams: {},
    };

    // Act
    const [step] = addChildSiblingStep(input) as [Extract<PatchStep, { op: 'add-child' }>];

    // Assert — no `definitionRef` key at all (not `definitionRef: undefined`).
    expect(step).not.toHaveProperty('definitionRef');
    expect(Object.keys(step)).toEqual(['op', 'parentPath', 'shortName']);
  });

  it('containerDefPath explicitly undefined is treated identically to omitted', () => {
    // Arrange — explicit `containerDefPath: undefined` should match the
    // omitted case (matches Com-stack mapper's conditional-spread idiom).
    const input = {
      parentPath: 'Com/ComConfig/ComIPdu',
      instanceShortName: 'Pdu_Engine',
      containerDefPath: undefined,
      instanceParams: {},
    };

    // Act
    const [step] = addChildSiblingStep(input) as [Extract<PatchStep, { op: 'add-child' }>];

    // Assert — same emission as the omitted case.
    expect(step).not.toHaveProperty('definitionRef');
  });

  it('empty-definitionRef-string is still emitted (not skipped)', () => {
    // Arrange — empty-string is NOT null/undefined, so it should pass through
    // (preserves the v1.28.1 test 4 contract).
    const input = {
      moduleShortName: 'Dcm',
      instanceShortName: 'EmptyRef',
      containerDefPath: '',
      instanceParams: {},
    };

    // Act
    const [step] = addChildSiblingStep(input) as [Extract<PatchStep, { op: 'add-child' }>];

    // Assert — `definitionRef: ''` is preserved verbatim.
    expect(step.definitionRef).toBe('');
  });

  it('throws when neither parentPath nor moduleShortName provided', () => {
    // Arrange — no parent path resolution possible.
    const input = {
      instanceShortName: 'NoPath',
      instanceParams: {},
    };

    // Act + Assert
    expect(() => addChildSiblingStep(input)).toThrow(
      /either .parentPath. or .moduleShortName. must be provided/,
    );
  });

  it('parentPath takes precedence over moduleShortName when both provided', () => {
    // Arrange — caller-provided parentPath wins over moduleShortName.
    const input = {
      parentPath: 'X/Y',
      moduleShortName: 'Dcm',
      instanceShortName: 'Precedence',
      containerDefPath: '/some/ref',
      instanceParams: {},
    };

    // Act
    const [step] = addChildSiblingStep(input) as [Extract<PatchStep, { op: 'add-child' }>];

    // Assert — caller-provided parentPath wins; helper does not error.
    expect(step.parentPath).toBe('X/Y');
    expect(step.definitionRef).toBe('/some/ref');
  });

  it('skips param entries whose value is undefined (mirror of null-skip)', () => {
    // Arrange — the Com-stack mapper's legacy in-line loop skips BOTH
    // null and undefined; the helper's contract (after v1.29.0) must
    // match this. (The Com-stack mapper calls the helper with
    // `instanceParams: row.params` where row.params is typed more
    // permissively than the helper's input, so `undefined` can leak in.)
    const input = {
      parentPath: 'Com/ComConfig/ComIPdu',
      instanceShortName: 'TxPdu_Foo',
      containerDefPath: '/AUTOSAR/EcuCDefs/Com/ComConfig/ComIPdu',
      instanceParams: {
        txMode: 'MIXED',
        nullParam: null,
        // The typed AddChildSiblingStepInput.instanceParams forbids
        // undefined, but the helper's defensive guard (per spec §3.2
        // + Risk §8) must still skip them.
      } as Record<string, string | number | boolean | null>,
    };

    // Act
    const steps = addChildSiblingStep(
      input as unknown as Parameters<typeof addChildSiblingStep>[0],
    );

    // Assert — 1 add-child + 1 set-param (txMode only; nullParam dropped).
    expect(steps).toHaveLength(2);
    const setParamStep = steps[1] as Extract<PatchStep, { op: 'set-param' }>;
    expect(setParamStep.paramName).toBe('txMode');
    expect(setParamStep.value).toBe('MIXED');
  });
});
