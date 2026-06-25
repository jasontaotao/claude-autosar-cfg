// core/generator/emit/type-check.ts
//
// E3 of v1.12.0 MINOR E — value-runtime-kind vs BSWMD-kind validation.
// Walks each module's BSWMD params[] and the matching ECUC values, then
// pushes ECUC-GEN-012 (TYPE_MISMATCH, ERROR) when the value's runtime
// `typeof` does not match the BSWMD-declared kind.
//
// Mapping (deliberately narrow; complex kinds like 'reference' defer to
// a deeper resolve-validation pass):
//   'integer'    → 'number'
//   'float'      → 'number'
//   'boolean'    → 'boolean'
//   'string'     → 'string'
//   'enumeration' → 'string' (enum literals are passed as strings)
//   'reference'   → 'string' (AUTOSAR DEST-typed paths are strings)
//   'function-name' → 'string' (function pointers serialized as strings)

import { DiagnosticSeverity, DiagnosticCode, type Diagnostic } from '../diagnostics.js';

export type BswmdParamKind =
  | 'integer'
  | 'float'
  | 'boolean'
  | 'string'
  | 'enumeration'
  | 'reference'
  | 'function-name';

export interface BswmdParamDefForTypeCheck {
  readonly shortName: string;
  readonly kind: BswmdParamKind;
}

export interface EcucParameterValueForTypeCheck {
  readonly shortName: string;
  readonly value: unknown;
}

function expectedRuntimeKind(kind: BswmdParamKind): 'number' | 'boolean' | 'string' {
  switch (kind) {
    case 'integer':
    case 'float':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'string':
    case 'enumeration':
    case 'reference':
    case 'function-name':
      return 'string';
  }
}

/**
 * Validate that every BSWMD param's runtime kind matches the ECUC value
 * supplied. Mismatch → ERROR push.
 */
export function validateTypeMatches(
  bswmdByModule: ReadonlyMap<
    string,
    { params?: readonly BswmdParamDefForTypeCheck[] }
  >,
  ecucByModule: ReadonlyMap<
    string,
    { parameters?: readonly EcucParameterValueForTypeCheck[] }
  >,
): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const [modName, ecuc] of ecucByModule) {
    const def = bswmdByModule.get(modName);
    if (def?.params === undefined) continue;
    for (const paramDef of def.params) {
      const paramVal = (ecuc.parameters ?? []).find(
        (p) => p.shortName === paramDef.shortName,
      );
      if (paramVal === undefined) continue;
      const actualKind = typeof paramVal.value;
      const expectedKind = expectedRuntimeKind(paramDef.kind);
      if (actualKind !== expectedKind) {
        out.push({
          severity: DiagnosticSeverity.ERROR,
          code: DiagnosticCode.ECUC_GEN_TYPE_MISMATCH,
          moduleShortName: modName,
          ecucPath: paramDef.shortName,
          message:
            `Parameter ${modName}/${paramDef.shortName}: ` +
            `expected kind=${paramDef.kind} (runtime '${expectedKind}'), ` +
            `got runtime '${actualKind}'`,
        });
      }
    }
  }
  return out;
}