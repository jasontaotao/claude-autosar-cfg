// core/generator/__tests__/bsw-sec-004.test.ts
//
// v1.14.3 PATCH-I (C-1) + v1.15.0 MINOR (B-2.4) — direct unit
// test for BSW-SEC-004 push. Originally the test asserted the
// inline emit-time push (EcuC + Mcu generators). v1.15.0 MINOR
// B-2 moves the push to a Stage-1 validator; the test now
// calls the validator directly. The intent (push + no-push for
// EcuC + Mcu) is unchanged; only the call site changes from
// `g.emit(...)` to `validateRefTargetHeaders(bswmdIndex,
// ecucValues)`.

import { describe, it, expect } from 'vitest';

import { validateRefTargetHeaders } from '../modules/_shared.js';

describe('BSW-SEC-004 — missing target header push', () => {
  it('EcuC: pushes when ref target module has no moduleHeader', () => {
    const diags = validateRefTargetHeaders(
      new Map([['EcuC', { shortName: 'EcuC' }]]),
      new Map([
        [
          'Mcu',
          {
            references: [
              { path: 'Mcu/EcuCRef', targetModule: 'EcuC', targetPath: 'EcuC/Config' },
            ],
          },
        ],
      ]),
    );
    expect(diags).toContainEqual(
      expect.objectContaining({ code: 'BSW-SEC-004' }),
    );
  });

  it('EcuC: silent when ref target module has moduleHeader', () => {
    const diags = validateRefTargetHeaders(
      new Map([['EcuC', { shortName: 'EcuC', moduleHeader: 'EcuC/EcuC_Cfg.h' }]]),
      new Map([
        [
          'Mcu',
          {
            references: [
              { path: 'Mcu/EcuCRef', targetModule: 'EcuC', targetPath: 'EcuC/Config' },
            ],
          },
        ],
      ]),
    );
    expect(diags).not.toContainEqual(
      expect.objectContaining({ code: 'BSW-SEC-004' }),
    );
  });

  it('Mcu: pushes when ref target module has no moduleHeader', () => {
    const diags = validateRefTargetHeaders(
      new Map([['Mcu', { shortName: 'Mcu' }]]),
      new Map([
        [
          'EcuC',
          {
            references: [
              { path: 'EcuC/McuRef', targetModule: 'Mcu', targetPath: 'Mcu/Config' },
            ],
          },
        ],
      ]),
    );
    expect(diags).toContainEqual(
      expect.objectContaining({ code: 'BSW-SEC-004' }),
    );
  });

  it('Mcu: silent when ref target module has moduleHeader', () => {
    const diags = validateRefTargetHeaders(
      new Map([['Mcu', { shortName: 'Mcu', moduleHeader: 'Mcu/Mcu_Cfg.h' }]]),
      new Map([
        [
          'EcuC',
          {
            references: [
              { path: 'EcuC/McuRef', targetModule: 'Mcu', targetPath: 'Mcu/Config' },
            ],
          },
        ],
      ]),
    );
    expect(diags).not.toContainEqual(
      expect.objectContaining({ code: 'BSW-SEC-004' }),
    );
  });
});
