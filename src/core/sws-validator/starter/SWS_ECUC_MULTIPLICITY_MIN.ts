// src/core/sws-validator/starter/SWS_ECUC_MULTIPLICITY_MIN.ts
// Cluster G (v1.6.0) — Starter rule C4.
//
// Per G spec §4.6: For each EcucContainerDef, the actual child-instance
// count must be ≥ `lowerMultiplicity`.
//
// Implementation in G-2.

import type { InternalValidatorResult, ValidatorRule } from '../types.js';

export const rule: ValidatorRule = {
  id: 'SWS_ECUC_MULTIPLICITY_MIN',
  defaultSeverity: 'error',
  messageKey: 'swsValidator.SWS_ECUC_MULTIPLICITY_MIN.short',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  check(_ctx): readonly InternalValidatorResult[] {
    return [];
  },
};