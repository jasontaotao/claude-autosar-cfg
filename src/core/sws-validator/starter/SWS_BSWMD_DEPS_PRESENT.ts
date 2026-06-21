// src/core/sws-validator/starter/SWS_BSWMD_DEPS_PRESENT.ts
// Cluster G (v1.6.0) — Starter rule C5.
//
// Per G spec §4.6: Every BSWMD-declared module dependency (referenced
// `<ECUC-MODULE-DEF-REF>`) must be defined by some loaded BSWMD file.
//
// Encoding used here (v1.6.0): the rule reads each module's
// `definitionRef` (set by the BSWMD-to-ECUC import flow) and asserts
// the referenced shortName is present in `ctx.moduleShortNames`.
// A module without a `definitionRef` (no explicit dep) is considered
// satisfied — same convention as the existing schema-driven validator.

import type { InternalValidatorResult, ValidationContext, ValidatorRule } from '../types.js';

export const rule: ValidatorRule = {
  id: 'SWS_BSWMD_DEPS_PRESENT',
  defaultSeverity: 'error',
  messageKey: 'swsValidator.SWS_BSWMD_DEPS_PRESENT.short',
  check(ctx: ValidationContext): readonly InternalValidatorResult[] {
    const results: InternalValidatorResult[] = [];
    const known = new Set(ctx.moduleShortNames);
    for (const module of ctx.project.modules) {
      const dep = module.definitionRef;
      if (dep.length === 0) continue;
      if (known.has(dep)) continue;
      results.push({
        ruleId: 'SWS_BSWMD_DEPS_PRESENT',
        severity: 'error',
        messageKey: 'swsValidator.SWS_BSWMD_DEPS_PRESENT.short',
        messageVars: {
          moduleName: module.shortName,
          missingDep: dep,
        },
        path: module.path,
      });
    }
    return results;
  },
};