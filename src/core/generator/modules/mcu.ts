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

import { walkContainersWithAncestry } from '../emit/container.js';
import { emitReferenceDecl } from '../emit/reference.js';
import { cIdent } from '../handlebars-helpers.js';
import {
  type GeneratedArtifact,
  type GenerationContext,
  type ModuleGenerator,
} from '../registry.js';
import { loadModuleTemplate } from '../templates/loader.js';

import {
  buildHeaderGuard,
  cTypeForKind,
  pushEmptyVariantDiagnostic,
  renderCValue,
  resolveIncludesForModule,
  resolveModuleHeader,
  type BswmdIndexForModuleHeaderPaths,
} from './_shared.js';

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

// v1.15.2 PATCH (B-3.2) — exported for the unified
// `cTypeForKind` in `_shared.ts`. Previously module-local;
// the union of EcuC + Mcu parameter shapes is now referenced
// from `_shared.ts`.
export interface McuParamDefLike {
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
  // v1.14.1 PATCH-G (G3) — recursive walk. Mirrors
  // EcuCContainerDefLike. Optional for flat fixtures.
  readonly containers?: readonly McuContainerDefLike[];
}

interface McuModuleDefLike {
  readonly shortName: string;
  // v1.14.3 PATCH-I (R-2) — BSWMD <HEADER> threads through to the
  // generated C source's `#include "{{moduleHeader}}"` line.
  // Optional; defaults to `${shortName}/${shortName}_Cfg.h` when absent.
  readonly moduleHeader?: string | undefined;
  readonly containers: readonly McuContainerDefLike[];
}

interface McuParamValueLike {
  readonly path: string;
  readonly kind: McuParamDefLike['kind'];
  readonly value: unknown;
}

interface McuReferenceValueLike {
  readonly path: string;
  readonly targetModule: string;
  readonly targetPath: string;
}

interface McuModuleValuesLike {
  readonly parameters?: readonly McuParamValueLike[];
  // v1.14.1 PATCH-G (G3) — S2 parity with EcuC. When Mcu params
  // include ECUC-REFERENCE-DEF values, emit `extern CONST(...)`
  // decls and auto-#include the target module's header.
  readonly references?: readonly McuReferenceValueLike[];
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
//
// v1.15.2 PATCH (B-3.3) — per-module `cTypeForKind` deleted. The
// unified `cTypeForKind` from `_shared.ts` dispatches on
// `moduleKind` literal; Mcu's `integer` arm hardcodes `'uint32'`
// for clock reference points per AUTOSAR convention. No behavior
// change for Mcu's emitted artefacts.
// ---------------------------------------------------------------------------

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
    //
    // v1.14.1 PATCH-G (G3) — recursive container walk (D-rev2 S8
    // parity). Mirrors the v1.14.0 S8 change in EcuC. Flat fixtures
    // are unaffected (their nested `containers` is empty). The
    // emitted C ident accumulates the full container ancestry
    // (`Module_Container_SubContainer_Param`) so nested BSWMD
    // params get distinct idents from the top-level container's
    // same-named params.
    const preCompileDecls: string[] = [];
    // v1.14.1 PATCH-G (G3) / v1.14.3 PATCH-I (R-1) — uses the
    // shared `walkContainersWithAncestry` helper from
    // emit/container.ts. The v1.14.0 leaf-only predecessor
    // (`walkContainers`) was deleted in v1.14.3 R-1; this is now
    // the sole walker.
    walkContainersWithAncestry(
      mDef.containers as Parameters<typeof walkContainersWithAncestry>[0],
      mDef.shortName,
      (container, ancestry) => {
        const cDef = container as McuContainerDefLike;
        for (const pDef of cDef.parameters) {
          const path = `${ancestry}/${pDef.shortName ?? 'Param'}`;
          const value = paramByPath.get(path);
          const cType = cTypeForKind(pDef, 'Mcu');
          // v1.13.3 PATCH-C: `paramIdent` → `cIdent` (byte-identical body
          // moved to handlebars-helpers.ts in earlier refactor; the
          // duplicate is now deleted in favor of the canonical helper).
          const ident = cIdent(path);
          const init = value ? renderCValue(value.value, pDef.kind) : '0u';
          preCompileDecls.push(`CONST(${cType}, AUTOMATIC) ${cType} ${ident} = ${init};`);
        }
      },
    );

    // v1.15.0 MINOR (B-1) — mirror EcuC's helper consumption.
    const { selfPaths: selfIncludePaths, refPaths: refIncludePaths } = resolveIncludesForModule(
      mDef.shortName,
      mVals.references ?? [],
      ctx.bswmdIndex as ReadonlyMap<string, BswmdIndexForModuleHeaderPaths>,
    );
    // v1.15.0 MINOR (B-2) — see ecuc.ts; BSW-SEC-004 push moved
    // to the Stage-1 `validateRefTargetHeaders` validator. Mcu
    // no longer carries the inline duplicate.

    const header = headerTpl()({
      moduleShortName: mDef.shortName,
      generatorVersion: GENERATOR_VERSION,
      // v1.14.0 MINOR S1 — module-scoped header guard replaces the
      // hardcoded `ECU_CFG_H` literal (D-rev2 Senior S1).
      headerGuard: buildHeaderGuard(mDef.shortName),
      // v1.14.1 PATCH-G (G3) + v1.14.2 PATCH-H (H2) — self-includes
      // + cross-ref includes, deduped via the shared `refIncludes`
      // Set so a path in both sources is emitted exactly once.
      includes: [...selfIncludePaths, ...refIncludePaths],
      typedefs: [] as readonly {
        name: string;
        fields: readonly { cType: string; name: string }[];
      }[],
      externDecls: [] as readonly string[],
      // v1.14.1 PATCH-G (G3) — render referenceDecls. Threads the
      // real BSWMD `targetType` via `bswmdParamIndex` when available,
      // matching v1.14.0 S2 EcuC behaviour (senior-review parity fix
      // — Mcu previously hardcoded `void`, hiding type mismatches
      // for any future Mcu ref-def). Falls back to `void` when the
      // BSWMD does not declare a `targetType` (current Mcu fixture).
      referenceDecls: (mVals.references ?? []).map((ref) => {
        const sourceIdent = cIdent(ref.path);
        const targetIdent = cIdent(ref.targetPath);
        const pDef = ctx.bswmdParamIndex?.get(ref.path) as { targetType?: string } | undefined;
        const targetType = pDef?.targetType ?? 'void';
        return emitReferenceDecl({ ident: sourceIdent, targetIdent, targetType }).replace(/;$/, '');
      }),
    });

    const source = sourceTpl()({
      moduleShortName: mDef.shortName,
      moduleHeader: resolveModuleHeader(
        mDef.moduleHeader,
        `${mDef.shortName}/${mDef.shortName}_Cfg.h`,
        mDef.shortName,
        ctx,
      ),
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
