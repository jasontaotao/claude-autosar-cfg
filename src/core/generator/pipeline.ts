// core/generator/pipeline.ts
//
// Three-stage orchestrator: pre-process (normalize + reference validation),
// generate (one ModuleGenerator.emit per module), exit-code derivation.
//
// Stage 1 — Pre-process: `normalizeToTree` builds the `NormalizedConfigTree`
//   from the BSWMD index and ECUC values, then `validateReferences` pushes
//   `ECUC-GEN-010` diagnostics for any unresolved cross-module refs.
//
// Stage 2 — Generate: iterate the (filtered) module list, look up the
//   registered generator, call `emit(def, values, ctx)` with a shared
//   `ctx.diagnostics` array. Missing generator → WARNING
//   (`ECUC-GEN-002`); throw → ERROR (`ECUC-GEN-003`).
//
// Stage 3 — Exit-code logic:
//   - any ERROR            → 1
//   - any WARNING + strict → 1
//   - any WARNING          → 0  (success with warning)
//   - clean                → 0
//
// Module filtering: `moduleFilter` is an allowlist of short names. When
// undefined, every module in the BSWMD index runs. When defined, only
// modules whose short name is in the list are processed.

import { DiagnosticSeverity, DiagnosticCode, type Diagnostic } from './diagnostics.js';
import { validateReferences } from './emit/reference.js';
import {
  validateMultiplicity,
  type BswmdModuleDefForMultiplicity,
} from './emit/multiplicity.js';
import {
  normalizeToTree,
  type BswmdModuleDefLite,
  type EcucModuleConfigurationValuesInput,
} from './normalize.js';
import { getGenerator, type GenerationVariant } from './registry.js';

export interface PipelineArgs {
  readonly bswmdIndex: ReadonlyMap<string, BswmdModuleDefLite>;
  readonly ecucValues: ReadonlyMap<string, EcucModuleConfigurationValuesInput>;
  readonly variant: GenerationVariant;
  readonly outDir: string;
  readonly moduleFilter: readonly string[] | undefined;
  readonly strict: boolean;
}

export interface PipelineResult {
  readonly exitCode: 0 | 1 | 2;
  readonly diagnostics: readonly Diagnostic[];
  readonly artifacts: ReadonlyMap<string, string>;
}

export async function runPipeline(args: PipelineArgs): Promise<PipelineResult> {
  const diagnostics: Diagnostic[] = [];

  // Stage 1 — Pre-process
  const tree = normalizeToTree(args.bswmdIndex, args.ecucValues);
  diagnostics.push(...validateReferences(tree));
  // v1.12.0 E2 — container instance-count validation. Casts the loose
  // BSWMD / ECUC types into the narrow shape `validateMultiplicity`
  // expects; the cast is safe because the BSWMD parser and ECUC parser
  // produce matching shapes (the BSWMD module def carries containers[]
  // and ECUC values carry containers[]).
  diagnostics.push(
    ...validateMultiplicity(
      args.bswmdIndex as ReadonlyMap<string, BswmdModuleDefForMultiplicity>,
      args.ecucValues as ReadonlyMap<
        string,
        { containers?: readonly { shortName: string }[] }
      >,
    ),
  );

  // Stage 2 — Generate
  const artifacts = new Map<string, string>();
  // v1.12.0 E1 — iterate the UNION of bswmdIndex + ecucValues keys so a
  // values-only module (present in ecucValues but missing BSWMD) surfaces
  // as NO_SCHEMA WARN. Pre-E1 the loop only walked bswmdIndex, which
  // made the `if (!def)` branch unreachable (the loop's own key was
  // guaranteed to be in the index it just iterated).
  const allModuleNames = new Set<string>([
    ...args.bswmdIndex.keys(),
    ...args.ecucValues.keys(),
  ]);
  const moduleNames = args.moduleFilter
    ? [...allModuleNames].filter((m) => args.moduleFilter!.includes(m))
    : [...allModuleNames];

  for (const moduleShortName of moduleNames) {
    const def = tree.bswmdIndex.get(moduleShortName);
    if (!def) {
      diagnostics.push({
        severity: DiagnosticSeverity.WARNING,
        code: DiagnosticCode.ECUC_GEN_NO_SCHEMA,
        moduleShortName,
        message: `No BSWMD for module ${moduleShortName}`,
      });
      continue;
    }
    const generator = getGenerator(moduleShortName);
    if (!generator) {
      diagnostics.push({
        severity: DiagnosticSeverity.WARNING,
        code: DiagnosticCode.ECUC_GEN_NO_GENERATOR,
        moduleShortName,
        message: `No generator registered for ${moduleShortName}`,
      });
      continue;
    }
    try {
      const out = generator.emit(def, tree.valuesByModule.get(moduleShortName), {
        variant: args.variant,
        bswmdIndex: tree.bswmdIndex,
        implByModule: tree.implByModule,
        outDir: args.outDir,
        diagnostics,
      });
      for (const a of out) artifacts.set(a.path, a.content);
    } catch (e) {
      diagnostics.push({
        severity: DiagnosticSeverity.ERROR,
        code: DiagnosticCode.ECUC_GEN_THROW,
        moduleShortName,
        message: e instanceof Error ? (e.stack ?? e.message) : String(e),
      });
    }
  }

  // Stage 3 — Exit-code derivation
  const hasError = diagnostics.some((d) => d.severity === DiagnosticSeverity.ERROR);
  const hasWarning = diagnostics.some((d) => d.severity === DiagnosticSeverity.WARNING);
  let exitCode: 0 | 1 | 2;
  if (hasError) exitCode = 1;
  else if (hasWarning && args.strict) exitCode = 1;
  else exitCode = 0;

  return { exitCode, diagnostics, artifacts };
}
