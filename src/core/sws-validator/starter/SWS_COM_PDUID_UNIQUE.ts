// src/core/sws-validator/starter/SWS_COM_PDUID_UNIQUE.ts
// Cluster G (v1.6.0) — Starter rule C1.
//
// Per G spec §4.6: ComPduId values within a ComConfig must be unique;
// PduId collisions are SWS-conformance violations.
//
// Implementation in G-2.

import type { InternalValidatorResult, ValidatorRule } from '../types.js';

export const rule: ValidatorRule = {
  id: 'SWS_COM_PDUID_UNIQUE',
  defaultSeverity: 'error',
  messageKey: 'swsValidator.SWS_COM_PDUID_UNIQUE.short',
  targetModule: 'Com',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  check(_ctx): readonly InternalValidatorResult[] {
    // Implementation lands in G-2 PR. Returns empty placeholder for now.
    return [];
  },
};