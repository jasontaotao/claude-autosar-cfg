// src/core/sws-validator/__tests__/toWireResult.test.ts
// Cluster G (v1.6.0) — toWireResult adapter unit tests.
//
// Verifies the G spec §5.1.1 translation contract:
//   - Pre-localizes `message` via t(locale, messageKey, messageVars)
//   - Narrows severity: error→error, warning→warning, info→warning
//   - Carries i18nKey on the wire
//   - Drops engine-only fields (currently fix? is `never`)

import { describe, expect, it } from 'vitest';

import { toWireResult, toWireResults } from '../adapter.js';
import type { InternalValidatorResult } from '../types.js';

describe('toWireResult', () => {
  it('translates error severity verbatim + pre-localizes message', () => {
    const internal: InternalValidatorResult = {
      ruleId: 'SWS_COM_PDUID_UNIQUE',
      severity: 'error',
      messageKey: 'swsValidator.SWS_COM_PDUID_UNIQUE.short',
      messageVars: { pduName: 'Pdu_A' },
      path: '/Pkg/Com/ComConfig/Pdu_A',
    };
    const wire = toWireResult(internal, 'en');
    expect(wire.ruleId).toBe('SWS_COM_PDUID_UNIQUE');
    expect(wire.severity).toBe('error');
    expect(wire.path).toBe('/Pkg/Com/ComConfig/Pdu_A');
    expect(wire.i18nKey).toBe('swsValidator.SWS_COM_PDUID_UNIQUE.short');
    expect(wire.message).toContain('Pdu_A');
  });

  it('translates warning severity verbatim', () => {
    const internal: InternalValidatorResult = {
      ruleId: 'SWS_PDUR_ROUTING_COMPLETE',
      severity: 'warning',
      messageKey: 'swsValidator.SWS_PDUR_ROUTING_COMPLETE.short',
      messageVars: { pathName: 'Path_BAD' },
      path: '/Pkg/PduR/Path_BAD',
    };
    const wire = toWireResult(internal, 'en');
    expect(wire.severity).toBe('warning');
  });

  it('narrows info severity to warning (per §5.1.1 wire union is error|warning only)', () => {
    const internal: InternalValidatorResult = {
      ruleId: 'SWS_INFO_TEST',
      severity: 'info',
      messageKey: 'swsValidator.runtimeError',
      messageVars: { ruleId: 'X', message: 'info!' },
      path: '',
    };
    const wire = toWireResult(internal, 'en');
    expect(wire.severity).toBe('warning');
  });

  it('zh-CN locale pre-localizes message correctly', () => {
    const internal: InternalValidatorResult = {
      ruleId: 'SWS_COM_PDUID_UNIQUE',
      severity: 'error',
      messageKey: 'swsValidator.SWS_COM_PDUID_UNIQUE.short',
      messageVars: { pduName: 'Pdu_A' },
      path: '/p',
    };
    const wire = toWireResult(internal, 'zh-CN');
    expect(wire.message).toContain('Pdu_A');
    expect(wire.message).toContain('重复');
  });

  it('toWireResults applies toWireResult to each item and freezes the array', () => {
    const items: InternalValidatorResult[] = [
      {
        ruleId: 'A',
        severity: 'error',
        messageKey: 'swsValidator.runtimeError',
        messageVars: { ruleId: 'A', message: 'm' },
        path: '/a',
      },
      {
        ruleId: 'B',
        severity: 'warning',
        messageKey: 'swsValidator.runtimeError',
        messageVars: { ruleId: 'B', message: 'm' },
        path: '/b',
      },
    ];
    const out = toWireResults(items, 'en');
    expect(Object.isFrozen(out)).toBe(true);
    expect(out.length).toBe(2);
    expect(out[0]?.ruleId).toBe('A');
    expect(out[1]?.ruleId).toBe('B');
  });
});