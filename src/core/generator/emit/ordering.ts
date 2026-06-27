// core/generator/emit/ordering.ts
//
// E5 of v1.12.0 MINOR E — container INDEX ordering check. Walks each
// module's containers[] and checks whether the instances' INDEX attributes
// (when present and ≥2 of them) are strictly ascending. Non-monotonic
// sequences push ECUC-GEN-020 (ORDERING, WARN).
//
// The container emit (`emit/container.ts`) force-sorts by INDEX today,
// so a non-monotonic source would be silently reordered. This warning
// surfaces the user-visible inconsistency before it disappears in the
// emit output.

import { DiagnosticSeverity, DiagnosticCode, type Diagnostic } from '../diagnostics.js';

export interface BswmdContainerDefForOrdering {
  readonly shortName: string;
}

export interface EcucContainerInstanceForOrdering {
  readonly shortName: string;
  readonly index?: number;
}

export function validateOrdering(
  bswmdByModule: ReadonlyMap<string, { containers?: readonly BswmdContainerDefForOrdering[] }>,
  ecucByModule: ReadonlyMap<string, { containers?: readonly EcucContainerInstanceForOrdering[] }>,
): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const [modName, ecuc] of ecucByModule) {
    const def = bswmdByModule.get(modName);
    if (def?.containers === undefined) continue;
    for (const containerDef of def.containers) {
      const instances = (ecuc.containers ?? []).filter(
        (c) => c.shortName === containerDef.shortName && typeof c.index === 'number',
      );
      if (instances.length < 2) continue;
      // Strictly ascending: each index > previous index.
      for (let i = 1; i < instances.length; i++) {
        const prev = instances[i - 1];
        const curr = instances[i];
        if (prev === undefined || curr === undefined) continue;
        if ((prev.index ?? 0) >= (curr.index ?? 0)) {
          out.push({
            severity: DiagnosticSeverity.WARNING,
            code: DiagnosticCode.ECUC_GEN_ORDERING,
            moduleShortName: modName,
            ecucPath: containerDef.shortName,
            message:
              `Container ${modName}/${containerDef.shortName}: ` +
              `INDEX attributes are not strictly ascending ` +
              `(positions ${i - 1}→${i}: ${prev.index}→${curr.index}); ` +
              `emit will force-sort`,
          });
          // One warning per container is enough; the sort still works.
          break;
        }
      }
    }
  }
  return out;
}
