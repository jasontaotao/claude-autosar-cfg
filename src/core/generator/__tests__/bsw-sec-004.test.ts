// core/generator/__tests__/bsw-sec-004.test.ts
//
// v1.14.3 PATCH-I (C-1) + v1.15.0 MINOR (B-2.4) + v1.15.1 PATCH
// (M1.3) — direct unit test for BSW-SEC-004 push. Originally
// the test asserted the inline emit-time push (EcuC + Mcu
// generators). v1.15.0 B-2 moved the push to a Stage-1
// validator; the test now calls the validator directly. v1.15.1
// M1.3 updates the call site to pass `tree` instead of
// `(bswmdIndex, ecucValues)` (the validator signature changed
// in M1.2). The intent (push + no-push for EcuC + Mcu) is
// preserved.

import { describe, it, expect } from 'vitest';

import { validateRefTargetHeaders } from '../modules/_shared.js';
import {
  normalizeToTree,
  type BswmdModuleDefLite,
  type EcucModuleConfigurationValuesInput,
} from '../normalize.js';

describe('BSW-SEC-004 — missing target header push', () => {
  it('EcuC: pushes when ref target module has no moduleHeader', () => {
    const bswmdIndex = new Map<string, BswmdModuleDefLite>([['EcuC', { shortName: 'EcuC' }]]);
    const ecucValues = new Map<string, EcucModuleConfigurationValuesInput>([
      [
        'Mcu',
        {
          references: [{ path: 'Mcu/EcuCRef', targetModule: 'EcuC', targetPath: 'EcuC/Config' }],
        },
      ],
    ]);
    const tree = normalizeToTree(bswmdIndex, ecucValues);
    const diags = validateRefTargetHeaders(tree);
    expect(diags).toContainEqual(expect.objectContaining({ code: 'BSW-SEC-004' }));
  });

  it('EcuC: silent when ref target module has moduleHeader', () => {
    const bswmdIndex = new Map<string, BswmdModuleDefLite>([
      ['EcuC', { shortName: 'EcuC', moduleHeader: 'EcuC/EcuC_Cfg.h' } as BswmdModuleDefLite],
    ]);
    const ecucValues = new Map<string, EcucModuleConfigurationValuesInput>([
      [
        'Mcu',
        {
          references: [{ path: 'Mcu/EcuCRef', targetModule: 'EcuC', targetPath: 'EcuC/Config' }],
        },
      ],
    ]);
    const tree = normalizeToTree(bswmdIndex, ecucValues);
    const diags = validateRefTargetHeaders(tree);
    expect(diags).not.toContainEqual(expect.objectContaining({ code: 'BSW-SEC-004' }));
  });

  it('Mcu: pushes when ref target module has no moduleHeader', () => {
    const bswmdIndex = new Map<string, BswmdModuleDefLite>([['Mcu', { shortName: 'Mcu' }]]);
    const ecucValues = new Map<string, EcucModuleConfigurationValuesInput>([
      [
        'EcuC',
        {
          references: [{ path: 'EcuC/McuRef', targetModule: 'Mcu', targetPath: 'Mcu/Config' }],
        },
      ],
    ]);
    const tree = normalizeToTree(bswmdIndex, ecucValues);
    const diags = validateRefTargetHeaders(tree);
    expect(diags).toContainEqual(expect.objectContaining({ code: 'BSW-SEC-004' }));
  });

  it('Mcu: silent when ref target module has moduleHeader', () => {
    const bswmdIndex = new Map<string, BswmdModuleDefLite>([
      ['Mcu', { shortName: 'Mcu', moduleHeader: 'Mcu/Mcu_Cfg.h' } as BswmdModuleDefLite],
    ]);
    const ecucValues = new Map<string, EcucModuleConfigurationValuesInput>([
      [
        'EcuC',
        {
          references: [{ path: 'EcuC/McuRef', targetModule: 'Mcu', targetPath: 'Mcu/Config' }],
        },
      ],
    ]);
    const tree = normalizeToTree(bswmdIndex, ecucValues);
    const diags = validateRefTargetHeaders(tree);
    expect(diags).not.toContainEqual(expect.objectContaining({ code: 'BSW-SEC-004' }));
  });
});
