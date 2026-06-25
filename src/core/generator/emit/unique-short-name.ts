// core/generator/emit/unique-short-name.ts
//
// E6 of v1.12.0 MINOR E — parameter sibling shortName uniqueness check.
// Walks each module's parameters[] for duplicate shortNames among
// siblings. Collision → ECUC-GEN-021 (DUPLICATE_SHORTNAME, ERROR).
//
// Note: container siblings are NOT checked here. AUTOSAR array
// semantics allow multiple instances of the same container (e.g. 3
// PartitionConfig entries distinguished by INDEX), so the same
// container shortName across multiple ECUC-CONTAINER-VALUE entries is
// valid. The pipeline's E5 (ORDERING) check already flags non-monotonic
// INDEX sequences on such arrays.

import { DiagnosticSeverity, DiagnosticCode, type Diagnostic } from '../diagnostics.js';

export interface EcucParameterValueForUnique {
  readonly shortName: string;
}

export function validateUniqueShortNames(
  ecucByModule: ReadonlyMap<
    string,
    { parameters?: readonly EcucParameterValueForUnique[] }
  >,
): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const [modName, ecuc] of ecucByModule) {
    const seen = new Set<string>();
    for (const p of ecuc.parameters ?? []) {
      if (seen.has(p.shortName)) {
        out.push({
          severity: DiagnosticSeverity.ERROR,
          code: DiagnosticCode.ECUC_GEN_DUPLICATE_SHORTNAME,
          moduleShortName: modName,
          ecucPath: p.shortName,
          message: `Module ${modName}: duplicate parameter shortName '${p.shortName}'`,
        });
      }
      seen.add(p.shortName);
    }
  }
  return out;
}