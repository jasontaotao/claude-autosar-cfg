// core/generator/__tests__/header-guard.test.ts
//
// v1.14.0 MINOR S1 — unit tests for `buildHeaderGuard` (D-rev2 Senior S1).
// Replaces the hardcoded `ECU_CFG_H` literal that previously collided
// across multi-module generation.

import { describe, it, expect } from 'vitest';

import { buildHeaderGuard } from '../modules/_shared.js';

describe('buildHeaderGuard', () => {
  it('uppercases moduleShortName and appends _CFG_H', () => {
    expect(buildHeaderGuard('EcuC')).toBe('ECUC_CFG_H');
    expect(buildHeaderGuard('Mcu')).toBe('MCU_CFG_H');
  });

  it('normalizes mixed case to all-uppercase', () => {
    expect(buildHeaderGuard('Com')).toBe('COM_CFG_H');
    expect(buildHeaderGuard('WdgV2')).toBe('WDGV2_CFG_H');
  });

  it('normalizes non-identifier characters via cIdent rules', () => {
    // Per cIdent (v1.13.5 SEC2 whitelist): [^A-Za-z0-9_] → _
    expect(buildHeaderGuard('Mcu-V2')).toBe('MCU_V2_CFG_H');
    expect(buildHeaderGuard('Mcu.V2')).toBe('MCU_V2_CFG_H');
  });

  it('strips shell-meta characters that would break the C preprocessor', () => {
    // #, $, @, *, ? are not legal in C identifiers and would emit
    // malformed #ifndef tokens. SEC2 cIdent whitelist normalizes them
    // to underscores; verify buildHeaderGuard inherits that safety.
    expect(buildHeaderGuard('Mcu#hack')).toBe('MCU_HACK_CFG_H');
    expect(buildHeaderGuard('Mcu$x')).toBe('MCU_X_CFG_H');
    expect(buildHeaderGuard('Mcu@bus')).toBe('MCU_BUS_CFG_H');
  });

  it('prefixes leading-digit shortName with underscore (illegal C ident)', () => {
    // `9Com` is a legal ARXML <SHORT-NAME> but not a legal C identifier
    // — C preprocessor token rules forbid `#ifndef 9COM_CFG_H`. SEC2
    // cIdent prefixes `_` so buildHeaderGuard stays compilable.
    expect(buildHeaderGuard('9Com')).toBe('_9COM_CFG_H');
  });

  it('returns UNNAMED_MODULE_CFG_H for empty or whitespace-only input', () => {
    expect(buildHeaderGuard('')).toBe('UNNAMED_MODULE_CFG_H');
    expect(buildHeaderGuard('   ')).toBe('UNNAMED_MODULE_CFG_H');
  });
});
