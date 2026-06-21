// src/core/sws-validator/starter/SWS_BSWMD_DEPS_PRESENT.ts
// Cluster G (v1.6.0) — Starter rule C5.
//
// Per G spec §4.6: Every BSWMD-declared module dependency (referenced
// `<ECUC-MODULE-DEF-REF>`) must be defined by some loaded BSWMD file.
//
// Implementation in G-2.

import type { InternalValidatorResult, ValidatorRule } from '../types.js';

export const rule: ValidatorRule = {
  id: 'SWS_BSWMD_DEPS_PRESENT',
  defaultSeverity: 'error',
  messageKey: 'swsValidator.SWS_BSWMD_DEPS_PRESENT.short',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  check(_ctx): readonly InternalValidatorResult[] {
    return [];
  },
};