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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type Handlebars from 'handlebars';

import { cIdent } from '../handlebars-helpers.js';
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

let tplHeader: Handlebars.TemplateDelegate | undefined;
let tplSource: Handlebars.TemplateDelegate | undefined;

function headerTpl(): Handlebars.TemplateDelegate {
  if (!tplHeader) tplHeader = loadModuleTemplate(TPL_DIR, PARTIAL_DIR, 'cfg.h.hbs');
  return tplHeader;
}
function sourceTpl(): Handlebars.TemplateDelegate {
  if (!tplSource) tplSource = loadModuleTemplate(TPL_DIR, PARTIAL_DIR, 'cfg.c.hbs');
  return tplSource;
}

// ---------------------------------------------------------------------------
// Inputs narrowed from `unknown` — Task 17 will tighten via real parser types.
// ---------------------------------------------------------------------------

interface McuParamDefLike {
  readonly kind: 'integer' | 'boolean' | 'string' | 'float' | 'enumeration';
  // v1.13.4 PATCH-B (M5) — real BSWMD shortName. Replaces the
  // hardcoded `'Param'` literal in path construction.
  readonly shortName?: string;
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
// Helpers — minimal-but-real implementations.
//
// v1.13.3 PATCH-C: `paramIdent` and `renderCValue` moved to
// `modules/_shared.ts`. `paramIdent` was byte-identical to `cIdent` in
// `handlebars-helpers.ts` (D-rev2 R2, R3); call sites now use
// `cIdent` directly. `renderCValue` lives in `_shared.ts` with the
// `u` suffix preserved (D-rev2 R6).
// ---------------------------------------------------------------------------

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

    // v1.12.0 E9 parity — empty-variant detection. v1.13.3 PATCH-C:
    // extracted to `pushEmptyVariantDiagnostic` in `modules/_shared.ts`
    // (D-rev2 R6, C8) so the EcuC + Mcu generators share the same
    // diagnostic semantics and message format.
    const hasContainers = mDef.containers.length > 0;
    const hasParams = (mVals.parameters ?? []).length > 0;
    if (!hasContainers && !hasParams) {
      pushEmptyVariantDiagnostic(ctx, mDef.shortName);
    }

    // Index parameters by BSWMD path for O(1) value lookup.
    const paramByPath = new Map<string, McuParamValueLike>();
    for (const p of mVals.parameters ?? []) {
      paramByPath.set(p.path, p);
    }

    // Walk every container and emit one CONST per parameter.
    // MVP: PreCompile only (no variant branching yet).
    //
    // v1.13.4 PATCH-B (M5) — `pDef.shortName` carries the real BSWMD
    // param shortName. The previous `'Param'` literal collision with
    // EcuCGenerator.shortNameFromDef is fixed by reading shortName
    // from the parsed BSWMD def directly.
    const preCompileDecls: string[] = [];
    for (const container of mDef.containers) {
      for (const pDef of container.parameters) {
        const path = `${mDef.shortName}/${container.shortName}/${pDef.shortName ?? 'Param'}`;
        const value = paramByPath.get(path);
        const cType = cTypeForKind(pDef);
        // v1.13.3 PATCH-C: `paramIdent` → `cIdent` (byte-identical body
        // moved to handlebars-helpers.ts in earlier refactor; the
        // duplicate is now deleted in favor of the canonical helper).
        const ident = cIdent(path);
        const init = value ? renderCValue(value.value, pDef.kind) : '0u';
        preCompileDecls.push(`CONST(${cType}, AUTOMATIC) ${cType} ${ident} = ${init};`);
      }
    }

    const header = headerTpl()({
      moduleShortName: mDef.shortName,
      generatorVersion: GENERATOR_VERSION,
      // v1.14.0 MINOR S1 — module-scoped header guard replaces the
      // hardcoded `ECU_CFG_H` literal (D-rev2 Senior S1).
      headerGuard: buildHeaderGuard(mDef.shortName),
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
