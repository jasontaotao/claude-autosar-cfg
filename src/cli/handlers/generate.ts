// Generate command handler (v1.11.0 — BSW code generator).
//
// MVP scope: register EcuCGenerator, run the pipeline against pre-loaded
// BSWMD + ECUC values maps, write generated files to disk via the
// atomic-write helper, and return a `GenerateResult` envelope.
//
// Project loading — two paths:
//   - Manifest-mode (production): `loadProjectMaps` reads the
//     `.autosarcfg.json` manifest, walks `bswmdPaths` + `valueArxmlPaths`,
//     and parses each file with `parseBswmd` / `parseArxml`. This is the
//     path real CLI invocations hit when
//     `pnpm autosarcfg generate --project <manifest>` is run.
//   - Injection fast-path (tests + future IPC bridge): tests (and a
//     future IPC bridge) pass `_bswmdIndex` / `_ecucValues` directly to
//     skip the fs-based loader.
//
// Loose-ARXML mode (`.arxml` without a manifest) is intentionally out of
// scope for v1.11.0 MVP; the loader returns `internal-error` with a
// precise message if `projectPath` doesn't end in `.autosarcfg.json` or
// `.acproj`. Loose-ARXML support is a future sprint item.
//
// CLI sub-command wiring lives in `src/cli/commander.ts` (registered
// alongside `read` / `mutate` / `validate`). The dispatcher's `generate`
// branch (`src/cli/command-dispatcher.ts:67-69`) routes parsed
// `GenerateArgs` here.
//
// Pipeline reuse: `runPipeline` (Task 12) owns pre-process → emit →
// exit-code derivation. `writeOutputTree` (Task 13) handles the
// atomic rename. This handler is the glue.

import { existsSync } from 'node:fs';
import { readFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { parseArxml } from '../../core/arxml/parser.js';
import type { ArxmlModule, ArxmlElement, ParamValue } from '../../core/arxml/types.js';
import type { DiagnosticSeverityValue } from '../../core/generator/diagnostics.js';
import { EcuCGenerator } from '../../core/generator/modules/ecuc.js';
import type {
  BswmdModuleDefLite,
  BswmdParamDefLite,
  EcucModuleConfigurationValuesInput,
  EcucReferenceValue,
} from '../../core/generator/normalize.js';
import { runPipeline } from '../../core/generator/pipeline.js';
import { writeOutputTree } from '../../core/generator/post-process.js';
import { registerGenerator, type GenerationVariant } from '../../core/generator/registry.js';
import { parseBswmd } from '../../core/project/bswmd.js';
import { loadManifest } from '../../core/project/manifest.js';
import type {
  GenerateArgs,
  GenerateResult,
  GeneratedFile,
  HeadlessError,
  ValidatorResult,
} from '../../shared/headless/ipc-contract.js';
import { failWith } from '../command-dispatcher.js';

/**
 * Internal escape hatch used by tests + future IPC adapters. Lets a caller
 * skip the fs-based project loader and feed pre-parsed maps straight into
 * the pipeline. Underscore-prefixed so it doesn't leak into the public
 * `GenerateArgs` schema.
 *
 * @internal
 */
interface GenerateArgsInternal extends GenerateArgs {
  readonly _bswmdIndex?: ReadonlyMap<string, BswmdModuleDefLite>;
  readonly _ecucValues?: ReadonlyMap<string, EcucModuleConfigurationValuesInput>;
}

export async function generateHeadlessProject(args: GenerateArgs): Promise<GenerateResult> {
  const start = Date.now();
  const internalArgs = args as GenerateArgsInternal;
  // v1.13.5 PATCH-F (SEC1) — canonicalize via realpath so symlinked
  // manifests / BSWMDs / ECUC value files resolve to their real
  // target. Without this, an attacker could symlink the manifest
  // into a restricted directory and have the loader read sensitive
  // content from there. `resolve` only normalizes the path string;
  // `realpath` follows the symlink.
  let projectPath = resolve(args.projectPath);
  try {
    projectPath = await realpath(projectPath);
  } catch {
    // realpath fails when the path doesn't exist; the existsSync
    // check below surfaces a clean file-not-found error.
  }

  if (!existsSync(projectPath)) {
    failWith({ kind: 'file-not-found', path: projectPath }, 1);
  }

  const variant: GenerationVariant = args.variant ?? 'PreCompile';
  const outDir = args.outDir ?? join(projectPath, 'generated');
  const strict = args.strict ?? false;

  // MVP: register EcuCGenerator (later: dynamic module loading per args.modules).
  registerGenerator(new EcuCGenerator());

  // Load BSWMD + ECUC values either via injection (tests + future IPC) or
  // by parsing the manifest ourselves. The IPC adapter path is the next
  // sprint deliverable; until then, `internal-error` surfaces the gap.
  const loaded = await loadProjectMaps(projectPath, internalArgs);
  if (!loaded.ok) {
    failWith(loaded.error, 1, loaded.stderr);
    throw new Error('unreachable');
  }
  const { bswmdIndex, ecucValues } = loaded.value;

  const pipeline = await runPipeline({
    bswmdIndex,
    ecucValues,
    variant,
    outDir,
    moduleFilter: args.modules,
    strict,
  });

  // Atomic-write the artifacts to outDir. Diagnostics stay in the result
  // envelope; the dispatcher maps exit code.
  await writeOutputTree(pipeline.artifacts, outDir);

  const files: GeneratedFile[] = [...pipeline.artifacts.entries()].map(([path, content]) => ({
    path,
    bytes: Buffer.byteLength(content, 'utf8'),
  }));

  return {
    ok: pipeline.exitCode !== 1,
    command: 'generate',
    projectPath,
    outDir,
    variant,
    files,
    diagnostics: pipeline.diagnostics.map(diagnosticToValidatorResult),
    durationMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Project loader — minimal MVP (manifest → BSWMD + ECUC values).
// ---------------------------------------------------------------------------

interface ProjectMapsOk {
  readonly ok: true;
  readonly value: {
    readonly bswmdIndex: ReadonlyMap<string, BswmdModuleDefLite>;
    readonly ecucValues: ReadonlyMap<string, EcucModuleConfigurationValuesInput>;
  };
}
interface ProjectMapsErr {
  readonly ok: false;
  readonly error: HeadlessError;
  readonly stderr: readonly string[];
}
type ProjectMapsResult = ProjectMapsOk | ProjectMapsErr;

async function loadProjectMaps(
  projectPath: string,
  args: GenerateArgsInternal,
): Promise<ProjectMapsResult> {
  // 1. Test / IPC fast-path.
  if (args._bswmdIndex !== undefined && args._ecucValues !== undefined) {
    return { ok: true, value: { bswmdIndex: args._bswmdIndex, ecucValues: args._ecucValues } };
  }

  // 2. Manifest-driven load. v1.11.0 MVP only handles the manifest form
  //    (`.autosarcfg.json`). Loose ARXML mode is intentionally out of scope.
  if (!projectPath.endsWith('.autosarcfg.json') && !projectPath.endsWith('.acproj')) {
    return {
      ok: false,
      error: {
        kind: 'internal-error',
        message:
          'v1.11.0 MVP only supports manifest-mode generate; pass --project <dir>/<manifest>.autosarcfg.json',
      },
      stderr: ['[autosarcfg] generate: manifest path required'],
    };
  }

  const manifestDir = resolve(projectPath, '..');
  let json: string;
  try {
    json = await readFile(projectPath, 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: { kind: 'file-not-found', path: projectPath },
      stderr: [`[autosarcfg] cannot read manifest: ${message}`],
    };
  }

  const loaded = loadManifest(json, manifestDir);
  if (!loaded.ok) {
    const errorDetail = loaded.error;
    const message = 'message' in errorDetail ? errorDetail.message : String(errorDetail.kind);
    return {
      ok: false,
      error: { kind: 'parse-error', path: projectPath, message },
      stderr: [`[autosarcfg] manifest invalid: ${message}`],
    };
  }
  const manifest = loaded.value;

  // Parse BSWMDs into `BswmdModuleDefLite` map keyed by shortName.
  const bswmdIndex = new Map<string, BswmdModuleDefLite>();
  for (const rel of manifest.bswmdPaths) {
    const resolved = resolve(manifestDir, rel);
    // v1.13.5 PATCH-F (SEC1) — realpath before read so symlinked
    // BSWMDs can't redirect the loader into an attacker-controlled
    // directory.
    const abs = await safeRealpath(resolved);
    let xml: string;
    try {
      xml = await readFile(abs, 'utf-8');
    } catch {
      continue;
    }
    const parsed = parseBswmd(xml);
    if (!parsed.ok) continue;
    for (const mod of parsed.value.modules) {
      // v1.39.0 MINOR T4 (H1) — populate the FULL `BswmdModuleDefLite`
      // shape. Pre-T4 only `{ shortName }` survived the loader, so
      // every Stage-1 validator (multiplicity, type-check, range,
      // ordering, reference) except `validateUniqueShortNames` +
      // `validateOrdering` silently no-op'd on the CLI path. Defence-
      // in-depth breach: a malformed BSWMD would pass generate on the
      // CLI but fail it in any other consumer.
      //
      // The BSWMD parser's `ParamDef` / `ReferenceDef` outputs are
      // structurally a superset of the lite shape (they carry extra
      // BSWMD-only fields like `path` / `lowerMultiplicity`). We cast
      // to the lite type at the loader boundary — validators narrow
      // back to their own parameter shapes via `Parameters<typeof
      // validator>[0]` (see `pipeline.ts:56-68`). This mirrors the
      // `bswmdIndex as ReadonlyMap<string, unknown>` widening pattern
      // in `normalize.ts:117` for the downstream pipeline consumer.
      bswmdIndex.set(mod.shortName, {
        shortName: mod.shortName,
        containers: mod.containers as unknown as readonly { readonly shortName: string }[],
        params: (mod.parameters ?? []).map((p) => ({
          shortName: p.shortName,
          kind: p.kind,
          paramConfigClasses: [],
          // v1.39.0 MINOR T4 (H1) — forward `ParamDef.minValue` /
          // `maxValue` so `validateRange` can fire on the CLI path.
          // Pre-T4 the lite shape had no min/max and the validator
          // cast silently dropped them.
          ...(p.minValue !== null ? { min: p.minValue } : {}),
          ...(p.maxValue !== null ? { max: p.maxValue } : {}),
        })),
        references: (mod.references ?? []) as unknown as readonly BswmdParamDefLite[],
        moduleHeader: mod.moduleHeader,
        includes: mod.includes ?? [],
      });
    }
  }

  // Parse ECUC value files into per-module values.
  const ecucValues = new Map<string, EcucModuleConfigurationValuesInput>();
  for (const rel of manifest.valueArxmlPaths) {
    const resolved = resolve(manifestDir, rel);
    // v1.13.5 PATCH-F (SEC1) — see above.
    const abs = await safeRealpath(resolved);
    let xml: string;
    try {
      xml = await readFile(abs, 'utf-8');
    } catch {
      continue;
    }
    const parsed = parseArxml(xml);
    if (!parsed.ok) continue;
    const moduleEntry = extractModuleEntry(parsed.value);
    if (moduleEntry === undefined) continue;
    // v1.39.0 MINOR T4 (H4) — extract real ECUC values from the parsed
    // ARXML. Pre-T4 every module landed in the map as
    // `{ parameters: [], references: [] }` (empty stubs), so the
    // generator ran against an empty values map and emitted every
    // parameter at its BSWMD default (or `0u` for integers post-T3).
    // Silent wrong output: user-configured values were dropped on the
    // CLI path. The walker mirrors the BSWMD PARAMETER-VALUES /
    // REFERENCE-VALUES shape from `src/core/arxml/parser.ts:550-664`
    // and recurses through nested `<CONTAINERS>` / `<SUB-CONTAINERS>`.
    const values = walkModuleEcucValues(moduleEntry.value);
    ecucValues.set(moduleEntry.shortName, values);
  }

  return { ok: true, value: { bswmdIndex, ecucValues } };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * v1.13.5 PATCH-F (SEC1) — helper: realpath with graceful fallback.
 * `realpath` throws on non-existent paths; we want the original
 * `resolve()`'d string in that case (so the subsequent `readFile`
 * attempt surfaces the file-not-found error uniformly).
 */
async function safeRealpath(p: string): Promise<string> {
  try {
    return await realpath(p);
  } catch {
    return p;
  }
}

/**
 * v1.39.0 MINOR T4 (H4) — locate the first `<ECUC-MODULE-CONFIGURATION-VALUES>`
 * entry in a parsed ARXML document and return it together with its
 * `shortName`. The `NormalizedDocument` we have in hand (via
 * `fromArxmlDocument`) only carries child element paths — not the
 * `params` / `references` records that `parseArxml` already pulled
 * off the raw ARXML. T4's ECUC value extraction therefore works off
 * the original `ArxmlDocument.packages[]` (the parser output) instead
 * of the normalized shape.
 *
 * Returns `undefined` when no module is found so the caller can skip
 * the entry without throwing. Mirrors the pre-T4 `extractModuleShortName`
 * short-circuit contract (called from the same `loadProjectMaps` block).
 */
function extractModuleEntry(parsedArxml: {
  readonly packages: ReadonlyArray<{
    readonly elements: ReadonlyArray<{ readonly kind: string; readonly shortName?: string }>;
  }>;
}): { readonly shortName: string; readonly value: ArxmlModule } | undefined {
  for (const pkg of parsedArxml.packages) {
    for (const el of pkg.elements) {
      if (el.kind === 'module' && typeof el.shortName === 'string') {
        return { shortName: el.shortName, value: el as ArxmlModule };
      }
    }
  }
  return undefined;
}

/**
 * v1.39.0 MINOR T4 (H4) — walk an `ArxmlModule` subtree and collect
 * every parameter + reference value into a flat list. Each entry is
 * stamped with its full `ECUC-MODULE-CONFIGURATION-VALUES/...` path
 * so validators can map a diagnostic back to the BSWMD-side short
 * path. The walker mirrors the PARAMETER-VALUES / REFERENCE-VALUES
 * shape from `src/core/arxml/parser.ts:550-664` and recurses through
 * nested `<CONTAINERS>` / `<SUB-CONTAINERS>`.
 *
 * Why a flat list: the pipeline (`pipeline.ts:88-139`) consumes
 * `EcucModuleConfigurationValuesInput` directly and the validators
 * walk `params` + `references` arrays without nesting. The legacy
 * empty-stub shape (`{ parameters: [], references: [] }`) was correct
 * in form but wrong in substance — T4 fills it.
 */
function walkModuleEcucValues(mod: ArxmlModule): EcucModuleConfigurationValuesInput {
  const parameters: unknown[] = [];
  const references: EcucReferenceValue[] = [];
  const containers: { readonly shortName: string }[] = [];
  walkElementValues(mod, mod.shortName, parameters, references, containers);
  return { parameters, references, containers };
}

function walkElementValues(
  el: {
    readonly params: Readonly<Record<string, ParamValue>>;
    readonly children: readonly ArxmlElement[];
    readonly shortName: string;
  },
  parentPath: string,
  parameters: unknown[],
  references: EcucReferenceValue[],
  containers: { readonly shortName: string }[],
): void {
  // Push every direct param. The wire shape is `{ shortName, value }`
  // — matches `EcucParameterValueForTypeCheck` (type-check.ts:34-37)
  // and the renderer-side parameter editor. The `path` field carries
  // the full ECUC path for diagnostics.
  for (const [shortName, value] of Object.entries(el.params)) {
    const path = `${parentPath}/${shortName}`;
    if (value.type === 'reference') {
      references.push({
        path,
        targetModule: '',
        targetPath: value.value,
        ...(value.dest !== undefined ? { dest: value.dest } : {}),
      });
    } else {
      parameters.push({ shortName, value: value.value, path });
    }
  }
  // Recurse into child containers. Each child container is pushed
  // onto the flat `containers[]` list before recursing so the
  // multiplicity validator (`emit/multiplicity.ts:55-77`) sees the
  // full instance count at every level. Module-level recursion keeps
  // the shape compatible with the existing parser output (`ArxmlModule`
  // wraps the module itself; `ArxmlContainer` is the only child kind
  // we ever see in practice).
  for (const child of el.children) {
    if (child.kind === 'container') {
      containers.push({ shortName: child.shortName });
      walkElementValues(
        child as unknown as Parameters<typeof walkElementValues>[0],
        `${parentPath}/${child.shortName}`,
        parameters,
        references,
        containers,
      );
    } else if (child.kind === 'module') {
      walkElementValues(
        child as ArxmlModule,
        `${parentPath}/${child.shortName}`,
        parameters,
        references,
        containers,
      );
    }
  }
}

/**
 * Translate the engine-internal `Diagnostic` shape (severity: 'ERROR' | 'WARNING' | 'INFO')
 * to the wire-side `ValidatorResult` shape (severity: 'error' | 'warning'). INFO collapses
 * to warning per A+C spec §4 (no third wire tier).
 */
function diagnosticToValidatorResult(d: {
  readonly severity: DiagnosticSeverityValue;
  readonly code: string;
  readonly message: string;
  readonly ecucPath?: string;
}): ValidatorResult {
  const severity: 'error' | 'warning' = d.severity === 'ERROR' ? 'error' : 'warning';
  return {
    ruleId: d.code,
    severity,
    path: d.ecucPath ?? '',
    message: d.message,
  };
}
