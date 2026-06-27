// core/generator/emit/range.ts
//
// E4 of v1.12.0 MINOR E — integer / float value range validation.
// Walks each module's BSWMD numeric params (kind='integer' or 'float')
// and checks that the ECUC value falls within [min, max] when those
// bounds are declared. Out-of-range → ECUC-GEN-013 (RANGE, ERROR).
//
// Type-mismatch (e.g. string value where number expected) is owned by
// E3 (`type-check.ts`); this module assumes the value is already a
// number and only checks the bound. If the value is not a number, this
// pass is a no-op for that param.

import { DiagnosticSeverity, DiagnosticCode, type Diagnostic } from '../diagnostics.js';

export interface BswmdNumericParamDefForRange {
  readonly shortName: string;
  readonly kind: 'integer' | 'float';
  readonly min?: number;
  readonly max?: number;
}

export interface EcucParameterValueForRange {
  readonly shortName: string;
  readonly value: unknown;
}

export function validateRange(
  bswmdByModule: ReadonlyMap<string, { params?: readonly BswmdNumericParamDefForRange[] }>,
  ecucByModule: ReadonlyMap<string, { parameters?: readonly EcucParameterValueForRange[] }>,
): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const [modName, ecuc] of ecucByModule) {
    const def = bswmdByModule.get(modName);
    if (def?.params === undefined) continue;
    for (const paramDef of def.params) {
      if (paramDef.min === undefined && paramDef.max === undefined) continue;
      const paramVal = (ecuc.parameters ?? []).find((p) => p.shortName === paramDef.shortName);
      if (paramVal === undefined) continue;
      const v = paramVal.value;
      if (typeof v !== 'number') continue; // type-check owns this case
      if (paramDef.min !== undefined && v < paramDef.min) {
        out.push({
          severity: DiagnosticSeverity.ERROR,
          code: DiagnosticCode.ECUC_GEN_RANGE,
          moduleShortName: modName,
          ecucPath: paramDef.shortName,
          message:
            `Parameter ${modName}/${paramDef.shortName}: ` + `value ${v} below min ${paramDef.min}`,
        });
      }
      if (paramDef.max !== undefined && v > paramDef.max) {
        out.push({
          severity: DiagnosticSeverity.ERROR,
          code: DiagnosticCode.ECUC_GEN_RANGE,
          moduleShortName: modName,
          ecucPath: paramDef.shortName,
          message:
            `Parameter ${modName}/${paramDef.shortName}: ` + `value ${v} above max ${paramDef.max}`,
        });
      }
    }
  }
  return out;
}
