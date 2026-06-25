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

// v1.14.0 MINOR S10 — container value shape for cross-type sibling
// uniqueness (D-rev2 Senior S10).
export interface EcucContainerValueForUnique {
  readonly shortName: string;
}

export interface EcucModuleValuesForUnique {
  readonly parameters?: readonly EcucParameterValueForUnique[];
  // v1.14.0 MINOR S10 — cross-type sibling uniqueness
  // (D-rev2 Senior S10). Container shortNames live at the same
  // namespace level as parameter shortNames within a module, so a
  // collision here would generate duplicate C identifiers downstream
  // (e.g. `CONST(...) Foo;` for both a container param and a container
  // instance). The validator detects the collision and pushes
  // ECUC-GEN-021 (DUPLICATE_SHORTNAME) at ERROR.
  readonly containers?: readonly EcucContainerValueForUnique[];
}

export function validateUniqueShortNames(
  ecucByModule: ReadonlyMap<string, EcucModuleValuesForUnique>,
): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const [modName, ecuc] of ecucByModule) {
    const seenParams = new Set<string>();
    for (const p of ecuc.parameters ?? []) {
      if (seenParams.has(p.shortName)) {
        out.push({
          severity: DiagnosticSeverity.ERROR,
          code: DiagnosticCode.ECUC_GEN_DUPLICATE_SHORTNAME,
          moduleShortName: modName,
          ecucPath: p.shortName,
          message: `Module ${modName}: duplicate parameter shortName '${p.shortName}'`,
        });
      }
      seenParams.add(p.shortName);
    }
    // v1.14.0 MINOR S10 — container siblings share the namespace with
    // parameter siblings. A container shortName colliding with an
    // already-seen parameter shortName triggers the
    // DUPLICATE_SHORTNAME diagnostic.
    //
    // Container-vs-container collisions are INTENTIONALLY NOT checked
    // here — AUTOSAR array semantics allow multiple instances of the
    // same container shortName distinguished by INDEX
    // (e.g. `PartitionConfig` index 0 + index 1). The pipeline's E5
    // (ORDERING) check already flags non-monotonic INDEX sequences
    // on such arrays.
    for (const c of ecuc.containers ?? []) {
      if (seenParams.has(c.shortName)) {
        out.push({
          severity: DiagnosticSeverity.ERROR,
          code: DiagnosticCode.ECUC_GEN_DUPLICATE_SHORTNAME,
          moduleShortName: modName,
          ecucPath: c.shortName,
          message: `Module ${modName}: container shortName '${c.shortName}' collides with sibling parameter`,
        });
      }
    }
  }
  return out;
}
