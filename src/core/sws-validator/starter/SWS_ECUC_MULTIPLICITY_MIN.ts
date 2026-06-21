// src/core/sws-validator/starter/SWS_ECUC_MULTIPLICITY_MIN.ts
// Cluster G (v1.6.0) — Starter rule C4.
//
// Per G spec §4.6: For each EcucContainerDef, the actual child-instance
// count must be ≥ `lowerMultiplicity`.
//
// Implementation: iterates every container in the document, looks up
// its `EcucContainerSchemaEntry` in the runtime `SchemaLayer`, and
// emits one error per container where child count < lowerMultiplicity.
// Containers without a layer entry are skipped (no constraint means no
// violation — same convention as the existing `validateProjectForRenderer`).

import type { InternalValidatorResult, ValidationContext, ValidatorRule } from '../types.js';

export const rule: ValidatorRule = {
  id: 'SWS_ECUC_MULTIPLICITY_MIN',
  defaultSeverity: 'error',
  messageKey: 'swsValidator.SWS_ECUC_MULTIPLICITY_MIN.short',
  check(ctx: ValidationContext): readonly InternalValidatorResult[] {
    const results: InternalValidatorResult[] = [];
    if (ctx.schemaLayer === null) return results;
    const containers = ctx.schemaLayer.containers;
    for (const el of ctx.findAll((e) => e.kind === 'container')) {
      const entry = containers.get(el.path);
      if (entry === undefined) continue;
      const actual = el.kind === 'container' ? el.children.length : 0;
      if (actual >= entry.lower) continue;
      results.push({
        ruleId: 'SWS_ECUC_MULTIPLICITY_MIN',
        severity: 'error',
        messageKey: 'swsValidator.SWS_ECUC_MULTIPLICITY_MIN.short',
        messageVars: {
          containerName: el.shortName,
          actual,
          min: entry.lower,
        },
        path: el.path,
      });
    }
    return results;
  },
};