// core/generator/emit/unique-short-name.ts
//
// E6 of v1.12.0 MINOR E — parameter sibling shortName uniqueness check.
// Walks each module's parameters[] for duplicate shortNames among
// siblings. Collision → ECUC-GEN-021 (DUPLICATE_SHORTNAME, ERROR).
//
// v1.39.0 MINOR T5 (H3) — extends the container check to flag
// duplicate (shortName, INDEX) tuples among siblings. AUTOSAR allows
// multiple instances of the same container shortName distinguished
// by INDEX (e.g. 3 PartitionConfig entries with INDEX 0/1/2), so a
// pure container-vs-container shortName collision is valid. But two
// containers with the same shortName AND the same INDEX produce two
// C identifiers with the same name downstream — that's a real link
// error. The E5 (ORDERING) monotonic check is not a substitute
// because it accepts [1,1,2] as ascending.

import { DiagnosticSeverity, DiagnosticCode, type Diagnostic } from '../diagnostics.js';

export interface EcucParameterValueForUnique {
  readonly shortName: string;
}

// v1.14.0 MINOR S10 — container value shape for cross-type sibling
// uniqueness (D-rev2 Senior S10). v1.39.0 MINOR T5 (H3) extends the
// shape with optional INDEX so the validator can flag duplicate
// (shortName, INDEX) tuples — matches the field already parsed by
// `validateOrdering` (ordering.ts:21).
export interface EcucContainerValueForUnique {
  readonly shortName: string;
  readonly index?: number;
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
    // v1.39.0 MINOR T5 (H3) — within the container group, also flag
    // duplicate (shortName, INDEX) tuples. Two instances with the
    // same shortName AND the same INDEX cannot both emit a unique C
    // identifier. We group by shortName, then within each group
    // detect any INDEX that appears more than once. Only flagged
    // when both sides carry an INDEX — a singleton (index undefined)
    // is the legacy container-vs-container case and stays valid.
    const containers = ecuc.containers ?? [];
    // 1) container-vs-parameter collision (unchanged from S10)
    for (const c of containers) {
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
    // 2) v1.39.0 MINOR T5 (H3) — duplicate (shortName, INDEX) tuples.
    // Group by shortName; flag any duplicate INDEX within a group.
    // Map<shortName, Map<INDEX, count>> gives us O(N) detection with
    // stable diagnostic ordering on first duplicate encountered.
    const indexGroups = new Map<string, Map<number, number>>();
    for (const c of containers) {
      if (typeof c.index !== 'number') continue;
      let bucket = indexGroups.get(c.shortName);
      if (bucket === undefined) {
        bucket = new Map<number, number>();
        indexGroups.set(c.shortName, bucket);
      }
      bucket.set(c.index, (bucket.get(c.index) ?? 0) + 1);
    }
    for (const [shortName, bucket] of indexGroups) {
      for (const [idx, count] of bucket) {
        if (count > 1) {
          out.push({
            severity: DiagnosticSeverity.ERROR,
            code: DiagnosticCode.ECUC_GEN_DUPLICATE_SHORTNAME,
            moduleShortName: modName,
            ecucPath: shortName,
            message:
              `Module ${modName}: container '${shortName}' has ${count} ` +
              `instances with INDEX=${idx}; C identifiers would collide`,
          });
        }
      }
    }
  }
  return out;
}
