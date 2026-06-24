// core/generator/modules/mcu.ts
//
// E10 of v1.12.0 MINOR E — second ModuleGenerator. Validates that the
// generator interface (defined in `registry.ts`) is generic across
// BSW modules: adding Mcu requires ZERO changes to pipeline.ts,
// normalize.ts, or any other shared code. The McuGenerator here is a
// pragmatic copy-with-renames of EcuCGenerator's shape; Task 17 will
// factor the shared template-loading + cType/cValue/cIdent helpers
// into a common base.
//
// For MVP scope:
// - Same Handlebars templates as EcuC (`templates/ecuc/cfg.h.hbs` etc.)
//   since Mcu emits the same Cfg.c/Cfg.h shape. When Mcu diverges
//   (e.g. RTE-style includes), move to `templates/mcu/` and bind
//   distinct partials.
// - cTypeForKind simplified to integer→uint32 / boolean→uint8 / etc.
//   (Mcu clock reference points use uint32 per AUTOSAR standard).
// - No PostBuild / Link configClass branching yet — Mcu is PreCompile
//   only for MVP. Add variant routing when a PostBuild Mcu param
//   appears in fixtures.

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

function buildEngine(): typeof Handlebars {
  const engine = createEngine();
  for (const entry of readdirSync(PARTIAL_DIR)) {
    if (!entry.endsWith('.hbs')) continue;
    const partialSrc = readFileSync(join(PARTIAL_DIR, entry), 'utf8');
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

let tplHeader: Handlebars.TemplateDelegate | undefined;
let tplSource: Handlebars.TemplateDelegate | undefined;

function headerTpl(): Handlebars.TemplateDelegate {
  if (!tplHeader) tplHeader = loadTemplate('cfg.h.hbs');
  return tplHeader;
}
function sourceTpl(): Handlebars.TemplateDelegate {
  if (!tplSource) tplSource = loadTemplate('cfg.c.hbs');
  return tplSource;
}

// ---------------------------------------------------------------------------
// Inputs narrowed from `unknown` — Task 17 will tighten via real parser types.
// ---------------------------------------------------------------------------

interface McuParamDefLike {
  readonly kind: 'integer' | 'boolean' | 'string' | 'float' | 'enumeration';
  readonly min?: number;
  readonly max?: number;
}

interface McuContainerDefLike {
  readonly shortName: string;
  readonly parameters: readonly McuParamDefLike[];
}

interface McuModuleDefLike {
  readonly shortName: string;
  readonly containers: readonly McuContainerDefLike[];
}

interface McuParamValueLike {
  readonly path: string;
  readonly kind: McuParamDefLike['kind'];
  readonly value: unknown;
}

interface McuModuleValuesLike {
  readonly parameters?: readonly McuParamValueLike[];
}

const GENERATOR_VERSION = '1.12.0';

// ---------------------------------------------------------------------------
// Helpers — minimal-but-real implementations (mirror EcuCGenerator).
// Task 17 will consolidate into a shared base.
// ---------------------------------------------------------------------------

function paramIdent(path: string): string {
  return path
    .trim()
    .replace(/[/\-.:]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function renderCValue(value: unknown, kind: McuParamDefLike['kind']): string {
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

function cTypeForKind(def: McuParamDefLike): string {
  switch (def.kind) {
    case 'integer':
      // Mcu clock reference points use uint32 per AUTOSAR convention;
      // narrower ranges would be unsafe without per-BSWMD min/max bounds.
      return 'uint32';
    case 'boolean':
      return 'uint8';
    case 'string':
      return 'const char*';
    case 'float':
      return 'float32';
    case 'enumeration':
      return 'uint8';
    default:
      return 'uint8';
  }
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export class McuGenerator implements ModuleGenerator {
  readonly moduleShortName = 'Mcu';

  emit(def: unknown, values: unknown, ctx: GenerationContext): readonly GeneratedArtifact[] {
    if (!def) {
      throw new Error('McuGenerator.emit: undefined module def');
    }
    const mDef = def as McuModuleDefLike;
    const mVals = (values ?? {}) as McuModuleValuesLike;

    // v1.12.0 E9 parity — empty-variant detection (same INFO code so
    // Mcu users see consistent diagnostic semantics across modules).
    const hasContainers = mDef.containers.length > 0;
    const hasParams = (mVals.parameters ?? []).length > 0;
    if (!hasContainers && !hasParams) {
      ctx.diagnostics.push({
        severity: DiagnosticSeverity.INFO,
        code: DiagnosticCode.ECUC_GEN_INFO_EMPTY_VARIANT,
        moduleShortName: mDef.shortName,
        message: `Module ${mDef.shortName}: active variant has no containers or parameters; emit is a stub`,
      });
    }

    // Index parameters by BSWMD path for O(1) value lookup.
    const paramByPath = new Map<string, McuParamValueLike>();
    for (const p of mVals.parameters ?? []) {
      paramByPath.set(p.path, p);
    }

    // Walk every container and emit one CONST per parameter.
    // MVP: PreCompile only (no variant branching yet).
    //
    // TODO(Task 17 / v1.13.0): Joint review M5 — the hardcoded
    // `'Param'` literal assumes single-param containers and collides
    // with `EcuCGenerator.shortNameFromDef` semantics. Track together
    // when threading real BSWMD shortNames through.
    const preCompileDecls: string[] = [];
    for (const container of mDef.containers) {
      for (const pDef of container.parameters) {
        const path = `${mDef.shortName}/${container.shortName}/Param`;
        const value = paramByPath.get(path);
        const cType = cTypeForKind(pDef);
        const ident = paramIdent(path);
        const init = value ? renderCValue(value.value, pDef.kind) : '0u';
        preCompileDecls.push(`CONST(${cType}, AUTOMATIC) ${cType} ${ident} = ${init};`);
      }
    }

    const header = headerTpl()({
      moduleShortName: mDef.shortName,
      generatorVersion: GENERATOR_VERSION,
      includes: [] as readonly string[],
      typedefs: [] as readonly {
        name: string;
        fields: readonly { cType: string; name: string }[];
      }[],
      externDecls: [] as readonly string[],
      referenceDecls: [] as readonly string[],
    });

    const source = sourceTpl()({
      moduleShortName: mDef.shortName,
      moduleHeader: 'Mcu/Mcu_Cfg.h',
      preCompileDecls,
      linkDecls: [] as readonly string[],
      postBuildDecls: [] as readonly string[],
      choiceBlocks: [] as readonly string[],
    });

    const artifacts: GeneratedArtifact[] = [
      { path: 'Mcu/Mcu_Cfg.h', content: header },
      { path: 'Mcu/Mcu_Cfg.c', content: source },
    ];

    return artifacts;
  }
}