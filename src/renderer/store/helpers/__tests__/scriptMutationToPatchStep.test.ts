// v1.20.0 T1 C2.4 — scriptMutationToPatchStep mapper tests.
//
// Verifies the 3-way mapping from the script engine's `ScriptMutation`
// (3 kinds) to the wire-shape `PatchStep` (7 kinds). The mapper is
// a pure function; no I/O, no store imports.

import { describe, expect, it } from 'vitest';

import type { ScriptMutation } from '@shared/script/types';

import { scriptMutationToPatchStep } from '../scriptMutationToPatchStep.js';

describe('scriptMutationToPatchStep — set-param', () => {
  it('maps set-param to { op: set-param, value } (1:1 field rename newValue → value)', () => {
    const m: ScriptMutation = {
      kind: 'set-param',
      containerPath: '/EAS/EcuC/EcuCGeneral',
      paramName: 'ConfigConsistencyRequired',
      newValue: 42,
    };
    expect(scriptMutationToPatchStep(m)).toEqual({
      op: 'set-param',
      containerPath: '/EAS/EcuC/EcuCGeneral',
      paramName: 'ConfigConsistencyRequired',
      value: 42,
    });
  });

  it('preserves string / boolean / reference newValue shapes', () => {
    expect(
      scriptMutationToPatchStep({
        kind: 'set-param',
        containerPath: '/p',
        paramName: 'name',
        newValue: 'hello',
      }),
    ).toMatchObject({ op: 'set-param', value: 'hello' });

    expect(
      scriptMutationToPatchStep({
        kind: 'set-param',
        containerPath: '/p',
        paramName: 'flag',
        newValue: true,
      }),
    ).toMatchObject({ op: 'set-param', value: true });

    expect(
      scriptMutationToPatchStep({
        kind: 'set-param',
        containerPath: '/p',
        paramName: 'ref',
        newValue: { value: '/EAS/EcuC/Foo', dest: 'EcuC' },
      }),
    ).toMatchObject({
      op: 'set-param',
      value: { value: '/EAS/EcuC/Foo', dest: 'EcuC' },
    });
  });
});

describe('scriptMutationToPatchStep — add-child', () => {
  it('maps add-child to { op: add-child, parentPath, shortName } (1:1 field rename)', () => {
    const m: ScriptMutation = {
      kind: 'add-child',
      containerPath: '/EAS/EcuC/EcuCGeneral',
      newShortName: 'NewContainer',
    };
    expect(scriptMutationToPatchStep(m)).toEqual({
      op: 'add-child',
      parentPath: '/EAS/EcuC/EcuCGeneral',
      shortName: 'NewContainer',
    });
  });
});

describe('scriptMutationToPatchStep — remove-child', () => {
  it('maps remove-child to { op: remove-with-cascade, cascade: true } (script commits cannot present the cascade dialog mid-script)', () => {
    const m: ScriptMutation = {
      kind: 'remove-child',
      containerPath: '/EAS/EcuC/EcuCGeneral',
      shortName: 'OldContainer',
    };
    expect(scriptMutationToPatchStep(m)).toEqual({
      op: 'remove-with-cascade',
      containerPath: '/EAS/EcuC/EcuCGeneral',
      cascade: true,
    });
  });
});
