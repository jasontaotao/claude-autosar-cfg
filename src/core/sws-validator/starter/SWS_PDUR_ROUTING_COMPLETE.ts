// src/core/sws-validator/starter/SWS_PDUR_ROUTING_COMPLETE.ts
// Cluster G (v1.6.0) — Starter rule C3.
//
// Per G spec §4.6: Every PduRRoutingPath must specify a complete
// source→destination path (no empty src or dest).
//
// Encoding used here (v1.6.0): the rule walks containers named
// `RoutingPaths` (inside `PduR` module) and parses each child's
// shortName suffix `__SRC_<value>__DEST_<value>`. An empty value
// between the markers means an incomplete routing path.

import type { InternalValidatorResult, ValidationContext, ValidatorRule } from '../types.js';

const ROUTING_PATHS_NAME = 'RoutingPaths';

export const rule: ValidatorRule = {
  id: 'SWS_PDUR_ROUTING_COMPLETE',
  defaultSeverity: 'error',
  messageKey: 'swsValidator.SWS_PDUR_ROUTING_COMPLETE.short',
  targetModule: 'PduR',
  check(ctx: ValidationContext): readonly InternalValidatorResult[] {
    const results: InternalValidatorResult[] = [];
    for (const container of ctx.findAll((el) => el.kind === 'container' && el.shortName === ROUTING_PATHS_NAME)) {
      if (container.kind !== 'container') continue;
      for (const child of container.children) {
        if (child.kind !== 'container') continue;
        const { src, dest } = parseRoutingPathShortName(child.shortName);
        if (src !== null && src.length > 0 && dest !== null && dest.length > 0) continue;
        const missing =
          src === null || src.length === 0
            ? 'src'
            : dest === null || dest.length === 0
              ? 'dest'
              : 'src+dest';
        results.push({
          ruleId: 'SWS_PDUR_ROUTING_COMPLETE',
          severity: 'error',
          messageKey: 'swsValidator.SWS_PDUR_ROUTING_COMPLETE.short',
          messageVars: { pathName: child.shortName, missing },
          path: child.path,
        });
      }
    }
    return results;
  },
};

function parseRoutingPathShortName(shortName: string): { src: string | null; dest: string | null } {
  const m = /^Path_(?:[A-Z0-9]+)?__SRC_(.*?)__DEST_(.*?)$/.exec(shortName);
  if (m === null) return { src: null, dest: null };
  return { src: m[1] ?? null, dest: m[2] ?? null };
}