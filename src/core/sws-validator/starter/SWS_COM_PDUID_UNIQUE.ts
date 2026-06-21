// src/core/sws-validator/starter/SWS_COM_PDUID_UNIQUE.ts
// Cluster G (v1.6.0) — Starter rule C1.
//
// Per G spec §4.6: ComPduId values within a ComConfig must be unique;
// PduId collisions are SWS-conformance violations.
//
// Encoding used here (v1.6.0): the rule walks every container whose
// shortName is `ComConfig`, groups direct child `ComIPdu` containers
// by `ComPduId`, and emits one error per duplicate group. The
// `ComPduId` value is read from the child's shortName suffix
// `Pdu_<id>_<name>` (the synthetic-fixture convention used by the
// project's round-trip tests; production ARXML reads it from the
// `<COMPDU-ID>` child element which is outside the `NormalizedDocument`
// scope for v1.6.0 — flagged as a v1.7.0 extension).

import type { InternalValidatorResult, ValidationContext, ValidatorRule } from '../types.js';

const COM_CONFIG_NAME = 'ComConfig';

export const rule: ValidatorRule = {
  id: 'SWS_COM_PDUID_UNIQUE',
  defaultSeverity: 'error',
  messageKey: 'swsValidator.SWS_COM_PDUID_UNIQUE.short',
  targetModule: 'Com',
  check(ctx: ValidationContext): readonly InternalValidatorResult[] {
    const results: InternalValidatorResult[] = [];
    for (const comConfig of ctx.findAll(
      (el) => el.kind === 'container' && el.shortName === COM_CONFIG_NAME,
    )) {
      const groups = new Map<number, string[]>();
      if (comConfig.kind !== 'container') continue;
      for (const child of comConfig.children) {
        if (child.kind !== 'container') continue;
        const pduId = extractPduIdFromShortName(child.shortName);
        if (pduId === null) continue;
        const list = groups.get(pduId) ?? [];
        list.push(child.shortName);
        groups.set(pduId, list);
      }
      for (const [pduId, names] of groups) {
        if (names.length < 2) continue;
        const firstName = names[0] ?? 'unknown';
        results.push({
          ruleId: 'SWS_COM_PDUID_UNIQUE',
          severity: 'error',
          messageKey: 'swsValidator.SWS_COM_PDUID_UNIQUE.short',
          messageVars: { pduName: firstName },
          path: comConfig.path,
        });
        // Suppress unused-var lint while keeping the pduId + configName
        // available for future `long` message variant.
        void pduId;
        void comConfig.shortName;
      }
    }
    return results;
  },
};

/**
 * Extract ComPduId from a child container's shortName using the
 * synthetic `Pdu_<id>_<name>` convention. Returns null when the
 * shortName doesn't match (other BSW containers inside ComConfig are
 * skipped, e.g. ComTxMode, ComIPduGroup).
 */
function extractPduIdFromShortName(shortName: string): number | null {
  const m = /^Pdu_(\d+)_/.exec(shortName);
  if (m === null || m[1] === undefined) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}
