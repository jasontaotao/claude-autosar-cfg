// core/generator/__tests__/module-header-thread.test.ts
//
// v1.14.3 PATCH-I (R-2) — verify that the moduleHeader field on the
// generator's def flows through to the generated C source's
// `#include "{{moduleHeader}}"` line. Before this fix, mcu.ts:279 and
// ecuc.ts:383 hardcoded 'Mcu/Mcu_Cfg.h' / 'EcuC/EcuC_Cfg.h' literals,
// silently ignoring any def.moduleHeader from the parsed BSWMD.

import { describe, it, expect } from 'vitest';

import { EcuCGenerator } from '../modules/ecuc.js';
import { McuGenerator } from '../modules/mcu.js';

describe('R-2 — moduleHeader thread: def.moduleHeader flows into template', () => {
  it('Mcu: def.moduleHeader overrides convention in Mcu_Cfg.c', () => {
    const g = new McuGenerator();
    const out = g.emit(
      {
        shortName: 'Mcu',
        moduleHeader: 'Mcu/McuAlt_Cfg.h',
        containers: [],
      } as never,
      { references: [] } as never,
      {
        variant: 'PreCompile',
        bswmdIndex: new Map(),
        implByModule: new Map(),
        outDir: '/tmp',
        diagnostics: [],
        bswmdParamIndex: new Map(),
      },
    );
    const c = out.find((a) => a.path === 'Mcu/Mcu_Cfg.c');
    if (!c) throw new Error('Mcu/Mcu_Cfg.c missing from emit output');
    // The .c source should reference the BSWMD-supplied path,
    // not the hardcoded convention.
    expect(c.content).toContain('#include "Mcu/McuAlt_Cfg.h"');
    expect(c.content).not.toContain('#include "Mcu/Mcu_Cfg.h"');
  });

  it('EcuC: def.moduleHeader overrides convention in EcuC_Cfg.c', () => {
    const g = new EcuCGenerator();
    const out = g.emit(
      {
        shortName: 'EcuC',
        moduleHeader: 'EcuC/EcuCAlt_Cfg.h',
        containers: [],
      } as never,
      { references: [] } as never,
      {
        variant: 'PreCompile',
        bswmdIndex: new Map(),
        implByModule: new Map(),
        outDir: '/tmp',
        diagnostics: [],
        bswmdParamIndex: new Map(),
      },
    );
    const c = out.find((a) => a.path === 'EcuC/EcuC_Cfg.c');
    if (!c) throw new Error('EcuC/EcuC_Cfg.c missing from emit output');
    expect(c.content).toContain('#include "EcuC/EcuCAlt_Cfg.h"');
    expect(c.content).not.toContain('#include "EcuC/EcuC_Cfg.h"');
  });

  it('Mcu: fallback to convention when def omits moduleHeader', () => {
    // Backwards-compat: callers that build a def without moduleHeader
    // (older fixtures, ad-hoc tests) get the conventional path.
    const g = new McuGenerator();
    const out = g.emit(
      { shortName: 'Mcu', containers: [] } as never,
      { references: [] } as never,
      {
        variant: 'PreCompile',
        bswmdIndex: new Map(),
        implByModule: new Map(),
        outDir: '/tmp',
        diagnostics: [],
        bswmdParamIndex: new Map(),
      },
    );
    const c = out.find((a) => a.path === 'Mcu/Mcu_Cfg.c');
    if (!c) throw new Error('Mcu/Mcu_Cfg.c missing from emit output');
    expect(c.content).toContain('#include "Mcu/Mcu_Cfg.h"');
  });

  it('EcuC: fallback to convention when def omits moduleHeader', () => {
    const g = new EcuCGenerator();
    const out = g.emit(
      { shortName: 'EcuC', containers: [] } as never,
      { references: [] } as never,
      {
        variant: 'PreCompile',
        bswmdIndex: new Map(),
        implByModule: new Map(),
        outDir: '/tmp',
        diagnostics: [],
        bswmdParamIndex: new Map(),
      },
    );
    const c = out.find((a) => a.path === 'EcuC/EcuC_Cfg.c');
    if (!c) throw new Error('EcuC/EcuC_Cfg.c missing from emit output');
    expect(c.content).toContain('#include "EcuC/EcuC_Cfg.h"');
  });

  // v1.14.3 PATCH-I (R-2.1) — defense-in-depth for the fallback
  // branch. Pre-R-2 the fallback was a hardcoded literal (implicitly
  // safe). R-2 widened the input boundary that lands in
  // `{{moduleHeader}}` to include a path synthesized from
  // `def.shortName` (a raw BSWMD string with no upstream character
  // validation). resolveModuleHeader runs the synthesized path through
  // SEC3; on failure it pushes BSW-SEC-002 and emits a sentinel.
  it('SEC3 gate: EcuC fallback with invalid shortName pushes BSW-SEC-002', () => {
    const g = new EcuCGenerator();
    const diagnostics: unknown[] = [];
    g.emit(
      { shortName: '../EcuC_Evil', containers: [] } as never,
      { references: [] } as never,
      {
        variant: 'PreCompile',
        bswmdIndex: new Map(),
        implByModule: new Map(),
        outDir: '/tmp',
        diagnostics: diagnostics as never,
        bswmdParamIndex: new Map(),
      },
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'BSW-SEC-002' }),
    );
  });

  it('SEC3 gate: Mcu fallback with invalid shortName pushes BSW-SEC-002', () => {
    const g = new McuGenerator();
    const diagnostics: unknown[] = [];
    g.emit(
      { shortName: 'Mcu; rm -rf /', containers: [] } as never,
      { references: [] } as never,
      {
        variant: 'PreCompile',
        bswmdIndex: new Map(),
        implByModule: new Map(),
        outDir: '/tmp',
        diagnostics: diagnostics as never,
        bswmdParamIndex: new Map(),
      },
    );
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ code: 'BSW-SEC-002' }),
    );
  });
});