// src/core/sws-validator/starter/SWS_PDUR_ROUTING_COMPLETE.ts
// Cluster G (v1.6.0) — Starter rule C3.
//
// Per G spec §4.6: Every PduRRoutingPath must specify a complete
// source→destination path (no empty src or dest).
//
// Implementation in G-2.

import type { InternalValidatorResult, ValidatorRule } from '../types.js';

export const rule: ValidatorRule = {
  id: 'SWS_PDUR_ROUTING_COMPLETE',
  defaultSeverity: 'error',
  messageKey: 'swsValidator.SWS_PDUR_ROUTING_COMPLETE.short',
  targetModule: 'PduR',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  check(_ctx): readonly InternalValidatorResult[] {
    return [];
  },
};