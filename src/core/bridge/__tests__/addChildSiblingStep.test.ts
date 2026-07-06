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
});
