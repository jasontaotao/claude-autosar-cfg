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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type Handlebars from 'handlebars';

import { walkContainers, type ContainerLike } from '../emit/container.js';
import { cIdent, integerToCType } from '../handlebars-helpers.js';
import type { BswmdParamDefLite } from '../normalize.js';
import {
  type GeneratedArtifact,
  type GenerationContext,
  type ModuleGenerator,
} from '../registry.js';
import { loadModuleTemplate } from '../templates/loader.js';

import { pushEmptyVariantDiagnostic, renderCValue, buildHeaderGuard } from './_shared.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL_DIR = join(__dirname, '..', 'templates', 'ecuc');
const PARTIAL_DIR = join(__dirname, '..', 'templates', '_partials');

// Module-level cache so we only compile once per process. Tests that
// mutate the filesystem (none in MVP) would need a `_resetTemplates`
// helper; we keep that off the public surface for now.
let tplHeader: Handlebars.TemplateDelegate | undefined;
let tplSource: Handlebars.TemplateDelegate | undefined;
let tplPbcfg: Handlebars.TemplateDelegate | undefined;

function headerTpl(): Handlebars.TemplateDelegate {
  if (!tplHeader) tplHeader = loadModuleTemplate(TPL_DIR, PARTIAL_DIR, 'cfg.h.hbs');
  return tplHeader;
}
function sourceTpl(): Handlebars.TemplateDelegate {
  if (!tplSource) tplSource = loadModuleTemplate(TPL_DIR, PARTIAL_DIR, 'cfg.c.hbs');
  return tplSource;
}
function pbcfgTpl(): Handlebars.TemplateDelegate {
  if (!tplPbcfg) tplPbcfg = loadModuleTemplate(TPL_DIR, PARTIAL_DIR, 'pbcfg.c.hbs');
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
  // v1.13.4 PATCH-B (M5) — real BSWMD shortName. Replaces the
  // hardcoded `'Param'` literal that previously collided across
  // multi-param containers.
  readonly shortName?: string;
  readonly min?: number;
  readonly max?: number;
  readonly typeName?: string;
  readonly targetType?: string;
  readonly signature?: string;
}

interface EcuCContainerDefLike {
  readonly shortName: string;
  readonly parameters: readonly EcuCParamDefLike[];
  // v1.14.0 MINOR S8 — optional nested containers. Real BSWMD nests
  // 2-3 levels deep (D-rev2 Senior S8), e.g. EcuC PartitionConfig →
  // PartitionBuffer → PartitionBufferHeader. Optional so existing flat
  // fixtures keep compiling unchanged.
  readonly containers?: readonly EcuCContainerDefLike[];
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

interface EcucReferenceValueLike {
  readonly path: string;
  readonly targetModule: string;
  readonly targetPath: string;
}

interface EcuCModuleValuesLike {
  readonly parameters?: readonly EcuCParamValueLike[];
  // v1.14.0 MINOR S2 — references consumed for referenceDecls emission
  // (D-rev2 Senior S2 / Refs-1 backlog). Replaces hardcoded `[]`.
  readonly references?: readonly EcucReferenceValueLike[];
}

const GENERATOR_VERSION = '1.11.0';

// ---------------------------------------------------------------------------
// Helpers — minimal-but-real implementations.
//
// v1.13.3 PATCH-C: `paramIdent` and `renderCValue` moved to
// `modules/_shared.ts`. `paramIdent` was byte-identical to `cIdent` in
// `handlebars-helpers.ts` (D-rev2 R2, R3); call sites now use
// `cIdent` directly. `renderCValue` lives in `_shared.ts` with the
// `u` suffix preserved (D-rev2 R6).
// ---------------------------------------------------------------------------

function cTypeForKind(def: EcuCParamDefLike): string {
  switch (def.kind) {
    case 'integer':
      return integerToCType(def.min ?? 0, def.max ?? 0);
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

    // v1.12.0 E9 — empty-variant detection. v1.13.3 PATCH-C: extracted
    // to `pushEmptyVariantDiagnostic` in `modules/_shared.ts` (D-rev2
    // R6, C8) so McuGenerator shares the same diagnostic semantics.
    const hasContainers = eDef.containers.length > 0;
    const hasParams = (eVals.parameters ?? []).length > 0;
    if (!hasContainers && !hasParams) {
      pushEmptyVariantDiagnostic(ctx, eDef.shortName);
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

    // v1.14.0 MINOR S8 — recursive container walk (D-rev2 Senior S8).
    // Replaces the flat 1-level for-loop so nested BSWMD (e.g. EcuC
    // PartitionConfig → PartitionBuffer → PartitionBufferHeader) emits
    // params from every level. Flat fixtures are unaffected (their
    // containers[] is empty or undefined).
    walkContainers(eDef.containers as readonly ContainerLike[], (container) => {
      const cDef = container as EcuCContainerDefLike;
      for (const pDef of cDef.parameters) {
        const path = `${eDef.shortName}/${cDef.shortName}/${pDef.shortName ?? 'Param'}`;
        const value = paramByPath.get(path);
        const cType = cTypeForKind(pDef);
        const ident = cIdent(path);

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
    });

    // v1.13.4 PATCH-B (L3) — PostBuild routing driven by BSWMD
    // paramConfigClass instead of the /PostBuild/i.test(path) regex
    // substring heuristic. The heuristic was over-broad: any path
    // containing the substring "PostBuild" would trigger PBcfg.c
    // emission, including real BSWMD paths that just happen to mention
    // PostBuild in a container or param name. The structured lookup
    // matches the param's actual configClass for the active variant.
    const paramIndex = ctx.bswmdParamIndex;
    const pbValues = (eVals.parameters ?? []).filter((p) =>
      isPostBuild(p.path, ctx.variant, paramIndex),
    );
    if (pbValues.length > 0) {
      for (const p of pbValues) {
        const cType = cTypeForKind({ kind: p.kind });
        const ident = cIdent(p.path);
        postBuildDecls.push(emitLoaderEntry(ident, cType, p.value, postBuildOffset));
        postBuildOffset += 1;
      }
    }

    const header = headerTpl()({
      moduleShortName: eDef.shortName,
      generatorVersion: GENERATOR_VERSION,
      // v1.14.0 MINOR S1 — module-scoped header guard replaces the
      // hardcoded `ECU_CFG_H` literal (D-rev2 Senior S1).
      headerGuard: buildHeaderGuard(eDef.shortName),
      includes: [] as readonly string[],
      typedefs: [] as readonly {
        name: string;
        fields: readonly { cType: string; name: string }[];
      }[],
      externDecls: linkDecls,
      // v1.14.0 MINOR S2 — consume values.references[] for cross-module
      // pointer declarations (D-rev2 Senior S2). Target type defaults to
      // `void` when the BSWMD reference def carries no targetType
      // (matches `cTypeForKind({ kind: 'reference' })` default at line
      // below; defensive until the parser threads targetType through).
      referenceDecls: (eVals.references ?? []).map((ref) => {
        const sourceIdent = cIdent(ref.path);
        const targetIdent = cIdent(ref.targetPath);
        // No trailing `;` — the `cfg.h.hbs` template wraps each entry
        // as `extern {{{this}}};` (lines 27-29), so the semicolon
        // belongs to the template, not the entry string.
        return `CONST(void * const, AUTOMATIC) ${sourceIdent} = &${targetIdent}`;
      }),
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
 * v1.13.4 PATCH-B (L3) — resolve whether a value-path belongs in the
 * PostBuild bucket by looking up the BSWMD param's configClass for
 * the active variant. Replaces the previous /PostBuild/i.test(path)
 * substring heuristic (D-rev2 L3 / S4) that was over-broad and would
 * false-positive on any real BSWMD path containing "PostBuild" in a
 * container or param name.
 *
 * Returns `false` when the param is unknown to `bswmdParamIndex` —
 * conservative default preserves the no-emission contract for legacy
 * fixtures that don't model configClass routing.
 */
function isPostBuild(
  path: string,
  variant: 'PreCompile' | 'Link' | 'PostBuild',
  paramIndex?: ReadonlyMap<string, BswmdParamDefLite>,
): boolean {
  if (!paramIndex) return false;
  const param = paramIndex.get(path);
  if (!param) return false;
  const targetVariant = variant === 'PostBuild' ? 'VARIANT-POST-BUILD' : 'VARIANT-PRE-COMPILE';
  return param.paramConfigClasses.some(
    (cc) => cc.configVariant === targetVariant && cc.configClass === 'POST-BUILD',
  );
}
