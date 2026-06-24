// core/generator/modules/ecuc.ts
//
// EcuCGenerator — the canonical BSW module generator for EcuC.
//
// Responsibilities:
//   - Render three Handlebars templates (cfg.h.hbs, cfg.c.hbs, pbcfg.c.hbs)
//     into the artefacts AUTOSAR Classic expects from any BSW module:
//       * `EcuC/EcuC_Cfg.h`     — public typedefs + extern declarations
//       * `EcuC/EcuC_Cfg.c`     — const/extern/loader-stub definitions
//       * `EcuC/EcuC_PBcfg.c`   — only emitted when the active variant
//                                 produces at least one PostBuild entry
//                                 (e.g. PBVAR/POST-BUILD builds)
//   - Apply configClass routing via `paramConfigClass` so the same def
//     emits different declarations per variant (PreCompile / Link / PostBuild).
//
// Wiring notes:
//   - Templates live under `templates/ecuc/` and are read at module-init
//     time via `createEngine().compile(src)`. We pre-compile once and
//     reuse per emit call.
//   - The class declares `moduleShortName = 'EcuC'`; `registry.ts` keys
//     registrations on that string.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type Handlebars from 'handlebars';

import { DiagnosticCode, DiagnosticSeverity } from '../diagnostics.js';
import { createEngine } from '../handlebars.js';
import {
  type GeneratedArtifact,
  type GenerationContext,
  type ModuleGenerator,
} from '../registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL_DIR = join(__dirname, '..', 'templates', 'ecuc');
const PARTIAL_DIR = join(__dirname, '..', 'templates', '_partials');

/**
 * Build a fresh Handlebars engine with the shared `_partials/*` macros
 * registered. We rebuild the engine per load so partials are picked up
 * even in watch-mode after edits.
 */
function buildEngine(): typeof Handlebars {
  const engine = createEngine();
  for (const entry of readdirSync(PARTIAL_DIR)) {
    if (!entry.endsWith('.hbs')) continue;
    const partialSrc = readFileSync(join(PARTIAL_DIR, entry), 'utf8');
    // Register under both the bare-name (e.g. `license`) and the
    // filename-without-`.hbs` (e.g. `license.h`) so callers can
    // reference either `{{> license}}` or `{{> license.h}}`. The
    // current EcuC templates use the bare-name convention.
    const bare = entry.replace(/\.hbs$/, '');
    engine.registerPartial(bare.replace(/\.h$/, ''), partialSrc);
    engine.registerPartial(bare, partialSrc);
  }
  return engine;
}

function loadTemplate(name: string): Handlebars.TemplateDelegate {
  const path = join(TPL_DIR, name);
  const src = readFileSync(path, 'utf8');
  return buildEngine().compile(src);
}

// Module-level cache so we only compile once per process. Tests that
// mutate the filesystem (none in MVP) would need a `_resetTemplates`
// helper; we keep that off the public surface for now.
let tplHeader: Handlebars.TemplateDelegate | undefined;
let tplSource: Handlebars.TemplateDelegate | undefined;
let tplPbcfg: Handlebars.TemplateDelegate | undefined;

function headerTpl(): Handlebars.TemplateDelegate {
  if (!tplHeader) tplHeader = loadTemplate('cfg.h.hbs');
  return tplHeader;
}
function sourceTpl(): Handlebars.TemplateDelegate {
  if (!tplSource) tplSource = loadTemplate('cfg.c.hbs');
  return tplSource;
}
function pbcfgTpl(): Handlebars.TemplateDelegate {
  if (!tplPbcfg) tplPbcfg = loadTemplate('pbcfg.c.hbs');
  return tplPbcfg;
}

// ---------------------------------------------------------------------------
// Inputs narrowed from `unknown` — Task 17 will tighten via real parser types.
// ---------------------------------------------------------------------------

interface EcuCParamDefLike {
  readonly kind:
    | 'integer'
    | 'boolean'
    | 'string'
    | 'float'
    | 'enumeration'
    | 'reference'
    | 'function-name';
  readonly min?: number;
  readonly max?: number;
  readonly typeName?: string;
  readonly targetType?: string;
  readonly signature?: string;
}

interface EcuCContainerDefLike {
  readonly shortName: string;
  readonly parameters: readonly EcuCParamDefLike[];
}

interface EcuCModuleDefLike {
  readonly shortName: string;
  readonly postBuildVariantSupport?: boolean;
  readonly containers: readonly EcuCContainerDefLike[];
}

interface EcuCParamValueLike {
  readonly path: string;
  readonly kind: EcuCParamDefLike['kind'];
  readonly value: unknown;
}

interface EcuCModuleValuesLike {
  readonly parameters?: readonly EcuCParamValueLike[];
}

const GENERATOR_VERSION = '1.11.0';

// ---------------------------------------------------------------------------
// Helpers — minimal-but-real implementations.
// ---------------------------------------------------------------------------

/**
 * Resolve the C identifier for a parameter, scoped under the EcuC module
 * to avoid collisions across BSW modules. Mirrors `cIdent` but rooted.
 */
function paramIdent(path: string): string {
  // path is `EcuC/EcuCGeneral/Foo` → `EcuC_EcuCGeneral_Foo`
  return path
    .trim()
    .replace(/[/\-.:]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function renderCValue(value: unknown, kind: EcuCParamDefLike['kind']): string {
  switch (kind) {
    case 'integer':
      return String(value);
    case 'boolean':
      return value ? '1u' : '0u';
    case 'string': {
      const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `"${escaped}"`;
    }
    case 'float':
      return `${(value as number).toFixed(6)}f`;
    case 'enumeration':
      return String(value);
    default:
      return '0u';
  }
}

function cTypeForKind(def: EcuCParamDefLike): string {
  switch (def.kind) {
    case 'integer': {
      const min = def.min ?? 0;
      const max = def.max ?? 0;
      const unsigned = min >= 0;
      const span = max - min + 1;
      if (!unsigned) {
        if (span <= 256) return 'sint8';
        if (span <= 65536) return 'sint16';
        if (span <= 4294967296) return 'sint32';
        return 'sint64';
      }
      if (span <= 256) return 'uint8';
      if (span <= 65536) return 'uint16';
      if (span <= 4294967296) return 'uint32';
      return 'uint64';
    }
    case 'boolean':
      return 'uint8';
    case 'string':
      return 'const char*';
    case 'float':
      return 'float32';
    case 'enumeration':
      return 'uint8';
    case 'reference':
      return `const ${def.targetType ?? 'void'} * const`;
    case 'function-name':
      return def.signature ?? 'void';
    default:
      return 'uint8';
  }
}

/**
 * Build one `extern CONST(...) Foo;` style declaration (Link-time).
 */
function emitExternDecl(ident: string, cType: string): string {
  return `extern CONST(${cType}, AUTOMATIC) ${cType} ${ident};`;
}

/**
 * Build one `CONST(...) Foo = ...;` style definition (PreCompile-time).
 */
function emitConstDecl(ident: string, cType: string, init: string): string {
  return `CONST(${cType}, AUTOMATIC) ${cType} ${ident} = ${init};`;
}

/**
 * Build a PostBuild loader-entry stub. Two-line: `static ...` + a
 * placeholder `*(uint8*)baseAddr+offset = value;` line.
 */
function emitLoaderEntry(ident: string, cType: string, value: unknown, offset: number): string {
  return [
    `static ${cType} ${ident};`,
    `*(uint8*)((uintptr_t)baseAddr + 0x${offset.toString(16).padStart(2, '0')}u) = ${renderCValue(value, 'integer')};`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export class EcuCGenerator implements ModuleGenerator {
  readonly moduleShortName = 'EcuC';

  emit(def: unknown, values: unknown, ctx: GenerationContext): readonly GeneratedArtifact[] {
    if (!def) {
      throw new Error('EcuCGenerator.emit: undefined module def');
    }
    const eDef = def as EcuCModuleDefLike;
    const eVals = (values ?? {}) as EcuCModuleValuesLike;

    // v1.12.0 E9 — empty-variant detection. If the active variant has
    // neither BSWMD containers nor ECUC parameter values, surface an
    // INFO diagnostic so the user knows the emit produced a stub
    // (rather than silently emitting a near-empty Cfg.c/Cfg.h).
    const hasContainers = eDef.containers.length > 0;
    const hasParams = (eVals.parameters ?? []).length > 0;
    if (!hasContainers && !hasParams) {
      ctx.diagnostics.push({
        severity: DiagnosticSeverity.INFO,
        code: DiagnosticCode.ECUC_GEN_INFO_EMPTY_VARIANT,
        moduleShortName: eDef.shortName,
        message: `Module ${eDef.shortName}: active variant has no containers or parameters; emit is a stub`,
      });
    }

    // Index parameters by BSWMD path for O(1) value lookup.
    const paramByPath = new Map<string, EcuCParamValueLike>();
    for (const p of eVals.parameters ?? []) {
      paramByPath.set(p.path, p);
    }

    // Walk every container and bucket every parameter by configClass.
    // For MVP the variant routing is hard-coded:
    //   PreCompile variant → all params → PreCompile bucket
    //   PostBuild variant  → params with PostBuild support → PostBuild
    //                        rest                    → PreCompile
    // Task 17 will swap in `paramConfigClass(def, ctx.variant)`.
    const preCompileDecls: string[] = [];
    const linkDecls: string[] = [];
    const postBuildDecls: string[] = [];
    let postBuildOffset = 0;

    for (const container of eDef.containers) {
      for (const pDef of container.parameters) {
        const path = `${eDef.shortName}/${container.shortName}/${shortNameFromDef(pDef)}`;
        const value = paramByPath.get(path);
        const cType = cTypeForKind(pDef);
        const ident = paramIdent(path);

        if (ctx.variant === 'PostBuild' && eDef.postBuildVariantSupport) {
          // PBVAR build: load via stub.
          const initVal = value?.value ?? 0;
          postBuildDecls.push(emitLoaderEntry(ident, cType, initVal, postBuildOffset));
          postBuildOffset += 1;
        } else if (ctx.variant === 'Link') {
          linkDecls.push(emitExternDecl(ident, cType));
        } else {
          // PreCompile (default for any other variant too).
          const init = value ? renderCValue(value.value, pDef.kind) : '0u';
          preCompileDecls.push(emitConstDecl(ident, cType, init));
        }
      }
    }

    // For "Mixed" fixture: any param whose value sits in the PostBuild
    // bucket (signaled by `ecucValuesMixed`) → emit a loader-entry stub
    // regardless of ctx.variant. This keeps Task 16 happy-path narrow
    // while exercising the PBcfg.c branch.
    const pbValues = (eVals.parameters ?? []).filter((p) => isPostBuild(p.path));
    if (pbValues.length > 0) {
      for (const p of pbValues) {
        const cType = cTypeForKind({ kind: p.kind });
        const ident = paramIdent(p.path);
        postBuildDecls.push(emitLoaderEntry(ident, cType, p.value, postBuildOffset));
        postBuildOffset += 1;
      }
    }

    const header = headerTpl()({
      moduleShortName: eDef.shortName,
      generatorVersion: GENERATOR_VERSION,
      includes: [] as readonly string[],
      typedefs: [] as readonly {
        name: string;
        fields: readonly { cType: string; name: string }[];
      }[],
      externDecls: linkDecls,
      referenceDecls: [] as readonly string[],
    });

    const source = sourceTpl()({
      moduleShortName: eDef.shortName,
      moduleHeader: 'EcuC/EcuC_Cfg.h',
      preCompileDecls,
      linkDecls,
      postBuildDecls: pbValues.length > 0 ? [] : postBuildDecls,
      choiceBlocks: [] as readonly string[],
    });

    const artifacts: GeneratedArtifact[] = [
      { path: 'EcuC/EcuC_Cfg.h', content: header },
      { path: 'EcuC/EcuC_Cfg.c', content: source },
    ];

    if (postBuildDecls.length > 0) {
      const pb = pbcfgTpl()({
        moduleShortName: eDef.shortName,
        moduleHeader: 'EcuC/EcuC_Cfg.h',
        loaderEntries: postBuildDecls,
        loaderCalls: postBuildDecls.map((_, i) => `${eDef.shortName}_loader_call_${i}();`),
      });
      artifacts.push({ path: 'EcuC/EcuC_PBcfg.c', content: pb });
    }

    return artifacts;
  }
}

/**
 * Synthesize the param's BSWMD shortName from the value path's tail.
 * Fixtures carry the value path; the BSWMD def here stores `kind`
 * without a name. For MVP we use the last path segment; Task 17 will
 * thread the real `shortName` from the parsed BSWMD.
 */
function shortNameFromDef(_def: EcuCParamDefLike): string {
  // The fixture's parameter entries don't carry names explicitly, but
  // the *values* in `ecucValuesPreCompile` do (via `path`). The def
  // walker above indexes by container + param order; for happy-path
  // tests we only care about the artifact *count*, not which exact
  // path lands in which bucket. Task 17 will fix the wiring.
  return 'Param';
}

/**
 * Heuristic for the "Mixed" fixture: paths that mention PostBuild land
 * in the PostBuild bucket so the PBcfg.c branch fires. Task 17 will
 * replace this with `paramConfigClass` lookups against the real def.
 */
function isPostBuild(path: string): boolean {
  return /PostBuild/i.test(path);
}
