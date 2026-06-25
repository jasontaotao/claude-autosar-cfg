// core/generator/emit/reference.ts
//
// Reference integrity validation + pointer-decl emit.
// Used by pipeline pre-process (Task 12) to push ECUC-GEN-010 diagnostics
// and by EcuC emit (Task 11/16) to render `<CONST(T * const)> x = &y;`
// pointer declarations.

import { DiagnosticSeverity, DiagnosticCode, type Diagnostic } from '../diagnostics.js';
import type { BswmdParamDefLite } from '../normalize.js';

export interface ReferenceEdge {
  readonly sourceModule: string;
  readonly sourcePath: string;
  readonly targetModule: string;
  readonly targetPath: string;
}

export interface NormalizedConfigTree {
  readonly bswmdIndex: ReadonlyMap<string, unknown>;
  readonly valuesByModule: ReadonlyMap<string, unknown>;
  readonly implByModule: ReadonlyMap<string, string>;
  readonly references: readonly ReferenceEdge[];
  // v1.13.4 PATCH-B (M5 + L3) — flat lookup keyed by
  // Module/Container/Param path. Lets generators resolve real BSWMD
  // shortName + paramConfigClass without walking nested arrays on
  // every emit.
  readonly bswmdParamIndex: ReadonlyMap<string, BswmdParamDefLite>;
}

/**
 * Validate that every cross-module reference resolves to an existing
 * target. Returns diagnostics; pushed to ctx.diagnostics by the caller.
 *
 * v1.14.0 MINOR S9 — instance-level check (D-rev2 Senior S9). The
 * pre-v1.14.0 implementation used a loose `(targetMod as Record<string,
 * unknown>)[ref.targetPath]` lookup that rejected valid references
 * (e.g. when targetMod is the raw `Os` values object that doesn't
 * carry a flat string key for `Os/OsCore/OsCore_0`) AND silently
 * accepted invalid ones (e.g. `targetPath` ending in a non-existent
 * tail). The new check requires the target path's shortName tail to
 * match a real container instance declared in the target module's
 * `containers[]`.
 */
export function validateReferences(tree: NormalizedConfigTree): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const ref of tree.references) {
    const targetMod = tree.valuesByModule.get(ref.targetModule);
    if (!targetMod) {
      out.push({
        severity: DiagnosticSeverity.ERROR,
        code: DiagnosticCode.ECUC_GEN_REF_UNRESOLVED,
        moduleShortName: ref.sourceModule,
        ecucPath: ref.sourcePath,
        message: `Reference target module ${ref.targetModule} not loaded`,
      });
      continue;
    }
    // v1.14.0 MINOR S9 — instance-level check. The target path's
    // shortName tail must match a recognized container instance in
    // the target module's `containers[]` array. Replaces the loose
    // `(targetMod as Record<string, unknown>)[ref.targetPath]` lookup
    // that silently accepted any string match.
    const targetContainers = (targetMod as { containers?: readonly { shortName: string }[] })
      .containers;
    const targetPathTail = ref.targetPath.split('/').pop() ?? ref.targetPath;
    const targetIsInstance = targetContainers?.some((c) => c.shortName === targetPathTail) ?? false;
    if (!targetIsInstance) {
      out.push({
        severity: DiagnosticSeverity.ERROR,
        code: DiagnosticCode.ECUC_GEN_REF_UNRESOLVED,
        moduleShortName: ref.sourceModule,
        ecucPath: ref.sourcePath,
        message: `Reference target ${ref.targetModule}/${ref.targetPath} is not a known container instance`,
      });
    }
  }
  return out;
}

export interface ReferenceDeclInput {
  readonly ident: string;
  readonly targetIdent: string;
  readonly targetType: string;
}

export function emitReferenceDecl(input: ReferenceDeclInput): string {
  return `CONST(${input.targetType} * const, AUTOMATIC) ${input.ident} = &${input.targetIdent};`;
}
