// core/generator/emit/multiplicity.ts
//
// E2 of v1.12.0 MINOR E — container instance-count validation. Walks each
// module's BSWMD containers[] and counts matching instances in the ECUC
// values. Out-of-bounds counts (below lowerMultiplicity or above
// upperMultiplicity) push ECUC-GEN-011 (MULTIPLICITY, ERROR).
//
// Conventions:
// - `lowerMultiplicity` defaults to 0 (matches AUTOSAR standard).
// - `upperMultiplicity` defaults to Infinity (unbounded array).
// - Instance match is by container `shortName`. Future per-path keys
//   (e.g. /Mcu/ClockConfig) can extend this; current MVP matches the
//   common flat shape.

import { DiagnosticSeverity, DiagnosticCode, type Diagnostic } from '../diagnostics.js';

/**
 * Minimal BSWMD container shape needed for multiplicity checks. The real
 * type lives in the BSWMD parser output; this is the narrow slice we
 * need at validation time.
 */
export interface BswmdContainerDefForValidation {
  readonly shortName: string;
  readonly lowerMultiplicity?: number;
  readonly upperMultiplicity?: number;
}

/**
 * Module-level BSWMD shape for validation: shortName + containers[].
 */
export interface BswmdModuleDefForMultiplicity {
  readonly shortName: string;
  readonly containers?: readonly BswmdContainerDefForValidation[];
}

/**
 * Minimal ECUC container-instance shape: a `shortName` per instance.
 */
export interface EcucContainerInstanceForMultiplicity {
  readonly shortName: string;
}

/**
 * Validate that every BSWMD container's instance count is within
 * [lowerMultiplicity, upperMultiplicity]. Out-of-bounds → ERROR push.
 */
export function validateMultiplicity(
  bswmdByModule: ReadonlyMap<string, BswmdModuleDefForMultiplicity>,
  ecucByModule: ReadonlyMap<string, { containers?: readonly EcucContainerInstanceForMultiplicity[] }>,
): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const [modName, ecuc] of ecucByModule) {
    const def = bswmdByModule.get(modName);
    if (def === undefined || def.containers === undefined) continue;
    for (const containerDef of def.containers) {
      const lower = containerDef.lowerMultiplicity ?? 0;
      const upperRaw = containerDef.upperMultiplicity;
      const upper = upperRaw === undefined ? Number.POSITIVE_INFINITY : upperRaw;
      const count = (ecuc.containers ?? []).filter(
        (c) => c.shortName === containerDef.shortName,
      ).length;
      if (count < lower || count > upper) {
        const upperDisplay = upperRaw === undefined ? '*' : String(upperRaw);
        out.push({
          severity: DiagnosticSeverity.ERROR,
          code: DiagnosticCode.ECUC_GEN_MULTIPLICITY,
          moduleShortName: modName,
          ecucPath: containerDef.shortName,
          message:
            `Container ${modName}/${containerDef.shortName} has ${count} instance(s), ` +
            `expected in [${lower}, ${upperDisplay}]`,
        });
      }
    }
  }
  return out;
}