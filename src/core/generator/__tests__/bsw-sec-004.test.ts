// core/generator/__tests__/bsw-sec-004.test.ts
//
// v1.14.3 PATCH-I (C-1) — direct unit test for BSW-SEC-004 push.
// The diagnostic is declared in diagnostics.ts:31 and pushed from
// ecuc.ts:339 and mcu.ts:243, but no existing test directly asserts
// it. v1.14.2 H2 path is covered indirectly (Refs-1 fixture has Os
// with moduleHeader set), so BSW-SEC-004 never fires in the existing
// test suite.
//
// Locks the contract: BSW-SEC-004 is pushed iff the referenced
// module is in bswmdIndex but its moduleHeader field is undefined.

import { describe, it, expect } from 'vitest';

import { EcuCGenerator } from '../modules/ecuc.js';
import { McuGenerator } from '../modules/mcu.js';

describe('BSW-SEC-004 — missing target header push', () => {
  it('EcuC: pushes when ref target module has no moduleHeader', () => {
    const g = new EcuCGenerator();
    const diagnostics: unknown[] = [];
    const out = g.emit(
      { shortName: 'EcuC', containers: [] } as never,
      {
        references: [
          { path: 'EcuC/OsRef', targetModule: 'Os', targetPath: 'Os/OsCoreRef' },
        ],
      } as never,
      {
        variant: 'PreCompile',
        bswmdIndex: new Map([
          ['Os', { shortName: 'Os' }], // no moduleHeader
        ]) as never,
        implByModule: new Map(),
        outDir: '/tmp',
        diagnostics: diagnostics as never,
        bswmdParamIndex: new Map(),
      },
    );
    expect(out).toBeDefined();
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'BSW-SEC-004' }),
    );
  });

  it('EcuC: silent when ref target module has moduleHeader', () => {
    const g = new EcuCGenerator();
    const diagnostics: unknown[] = [];
    g.emit(
      { shortName: 'EcuC', containers: [] } as never,
      {
        references: [
          { path: 'EcuC/OsRef', targetModule: 'Os', targetPath: 'Os/OsCoreRef' },
        ],
      } as never,
      {
        variant: 'PreCompile',
        bswmdIndex: new Map([
          ['Os', { shortName: 'Os', moduleHeader: 'Os/Os_Cfg.h' }],
        ]) as never,
        implByModule: new Map(),
        outDir: '/tmp',
        diagnostics: diagnostics as never,
        bswmdParamIndex: new Map(),
      },
    );
    expect(diagnostics).not.toContainEqual(
      expect.objectContaining({ code: 'BSW-SEC-004' }),
    );
  });

  it('Mcu: pushes when ref target module has no moduleHeader', () => {
    const g = new McuGenerator();
    const diagnostics: unknown[] = [];
    const out = g.emit(
      { shortName: 'Mcu', containers: [] } as never,
      {
        references: [
          { path: 'Mcu/OsRef', targetModule: 'Os', targetPath: 'Os/OsCoreRef' },
        ],
      } as never,
      {
        variant: 'PreCompile',
        bswmdIndex: new Map([
          ['Os', { shortName: 'Os' }], // no moduleHeader
        ]) as never,
        implByModule: new Map(),
        outDir: '/tmp',
        diagnostics: diagnostics as never,
        bswmdParamIndex: new Map(),
      },
    );
    expect(out).toBeDefined();
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'BSW-SEC-004' }),
    );
  });

  it('Mcu: silent when ref target module has moduleHeader', () => {
    const g = new McuGenerator();
    const diagnostics: unknown[] = [];
    g.emit(
      { shortName: 'Mcu', containers: [] } as never,
      {
        references: [
          { path: 'Mcu/OsRef', targetModule: 'Os', targetPath: 'Os/OsCoreRef' },
        ],
      } as never,
      {
        variant: 'PreCompile',
        bswmdIndex: new Map([
          ['Os', { shortName: 'Os', moduleHeader: 'Os/Os_Cfg.h' }],
        ]) as never,
        implByModule: new Map(),
        outDir: '/tmp',
        diagnostics: diagnostics as never,
        bswmdParamIndex: new Map(),
      },
    );
    expect(diagnostics).not.toContainEqual(
      expect.objectContaining({ code: 'BSW-SEC-004' }),
    );
  });
});