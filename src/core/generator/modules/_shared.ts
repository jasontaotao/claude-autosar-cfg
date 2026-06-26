// core/generator/modules/_shared.ts
//
// Shared helpers consumed by every `core/generator/modules/*.ts`
// ModuleGenerator (currently EcuC and Mcu). v1.13.3 PATCH-C extracted
// these from per-module duplicates (D-rev2 R6, R7, C7, C6, S12, M4
// backlog).
//
// What lives here:
//   - `renderCValue` — same switch as `cValue` in handlebars-helpers.ts
//     but with the `u` suffix (C `unsigned int` literal style). EcuC
//     and Mcu both emit `0u` / `1u` / `42u` for integer-valued
//     constants, while `cValue` (used by Handlebars templates) emits
//     `0` / `1` / `42` to match the template-rendered C strings.
//   - `pushEmptyVariantDiagnostic` — E9 parity diagnostic shared across
//     modules so Mcu users see the same `ECUC-GEN-INFO-001` semantics
//     as EcuC users (D-rev2 R6, C8).
//
// What does NOT live here:
//   - `cIdent` / `cValue` — already canonical in handlebars-helpers.ts
//     and consumed directly by both modules (no duplication left).
//   - `paramIdent` — byte-identical to `cIdent`; the duplicate was
//     removed in v1.13.3 PATCH-C (D-rev2 R2, R3).
//   - `cTypeForKind` — per-module because they have already diverged:
//     EcuC's `integer` arm routes through `integerToCType(min, max)`
//     and EcuC has `reference` + `function-name` arms (added in
//     v1.14.0 S2 Refs-1 ref emit). Mcu's `integer` arm hardcodes
//     `'uint32'` (no `integerToCType` call). Default arms both return
//     `'uint8'` for now, but that is the only remaining identity.
//     The shared `cType` returns `'??'` (fail-fast). Consolidation
//     is deferred to the v1.15.0 generator refactor (D-rev3 B-5).

import { DiagnosticCode, DiagnosticSeverity, type Diagnostic } from '../diagnostics.js';
import type { NormalizedConfigTree } from '../emit/reference.js';
import { cIdent, integerToCType, validateHeaderPath } from '../handlebars-helpers.js';
import type { GenerationContext } from '../registry.js';

import type { EcuCParamDefLike } from './ecuc.js';
import type { McuParamDefLike } from './mcu.js';

/**
 * EcuC/Mcu's variant of `cValue` from handlebars-helpers.ts: same
 * switch body, but the integer / boolean / default arms return the
 * C `unsigned` literal suffix (`0u` / `1u` / `42u`). Called from
 * `emitConstDecl` and `emitExternDecl` code paths that need unsigned
 * C literals.
 *
 * Note: `kind` is taken directly (not the full `BswmdParamDef`) so
 * the module-local narrow `EcuCParamDefLike` / `McuParamDefLike`
 * unions can pass it without re-declaring the full BSWMD type. The
 * `value` is `unknown` because the runtime kind check happens
 * upstream in the E3 validator.
 */
export function renderCValue(value: unknown, kind: string): string {
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
    case 'reference':
      return String(value);
    case 'function-name':
      return String(value);
    default:
      return '0u';
  }
}

/**
 * Push the E9 empty-variant diagnostic. Shared across modules so
 * every `ModuleGenerator` surfaces consistent semantics: if the
 * active variant has neither BSWMD containers nor ECUC parameter
 * values, the user sees `ECUC-GEN-INFO-001` explaining that the
 * emit produced a stub.
 *
 * v1.14.0 MINOR S5 — severity promoted INFO → WARNING
 * (D-rev2 Senior S5). Empty-variant is non-trivial: a BSWMD module
 * was loaded but produced nothing, which the user must see. The code
 * string `ECUC-GEN-INFO-001` is preserved for backwards compat with
 * downstream consumers (CLI surfaces, log parsers); only the severity
 * changes. In strict mode (pipeline arg), the pipeline's exit-code
 * logic flips this WARNING into exitCode=1.
 */
export function pushEmptyVariantDiagnostic(ctx: GenerationContext, moduleShortName: string): void {
  ctx.diagnostics.push({
    severity: DiagnosticSeverity.WARNING,
    code: DiagnosticCode.ECUC_GEN_INFO_EMPTY_VARIANT,
    moduleShortName,
    message: `Module ${moduleShortName}: active variant has no containers or parameters; emit is a stub`,
  });
}

/**
 * v1.14.0 MINOR S1 — build a module-scoped C header guard of the
 * form `${MODULE_SHORT_NAME}_CFG_H`. Replaces the hardcoded `ECU_CFG_H`
 * literal in `cfg.h.hbs` that previously collided across modules
 * (D-rev2 Senior S1).
 *
 * Why per-module matters: when a translation unit `#include`s two BSW
 * module headers (e.g. `EcuC_Cfg.h` then `Mcu_Cfg.h`), the second
 * `#ifndef ECU_CFG_H` would see the macro already defined by the
 * first header and silently skip Mcu's body — the `extern CONST(...)`
 * declarations never reach the TU, and downstream code fails to link
 * with `undefined reference to Mcu_xxx`. Per-module guards
 * (`ECUC_CFG_H` / `MCU_CFG_H`) prevent this collision.
 *
 * Input safety: delegates to `cIdent` (v1.13.5 SEC2 whitelist), which
 * strips shell-meta characters (`#`, `$`, `@`, `*`, `?`) and prefixes
 * `_` for leading-digit shortNames so the generated `#ifndef` token
 * is always a legal C preprocessor identifier. Returns
 * `UNNAMED_MODULE_CFG_H` for empty or whitespace-only input so the
 * downstream `#ifndef` / `#define` never see an undefined token.
 */
export function buildHeaderGuard(moduleShortName: string): string {
  const ident = cIdent(moduleShortName);
  if (!ident) return 'UNNAMED_MODULE_CFG_H';
  return `${ident.toUpperCase()}_CFG_H`;
}

/**
 * v1.14.1 PATCH-G (G4) — SEC3 wire-up. For every module in the
 * BSWMD index, validate its `moduleHeader` and each entry in
 * `includes[]` against `validateHeaderPath` (the v1.13.5 PATCH-F
 * whitelist). Pushes ERROR `BSW-SEC-002` for any path that
 * contains `..`, starts with `/`, fails the `[A-Za-z0-9_./-]+`
 * whitelist, or is empty. Module-level iteration is per the
 * pipeline's existing `Parameters<typeof validator>[0]` cast
 * pattern (D-rev2 PATCH-D).
 *
 * v1.14.2 PATCH-H (H1) — adds the `BSW-SEC-003` WARN channel for
 * empty `<STD-INCLUDE>` entries. The v1.14.1 parser preserved
 * these as `''` in `includes[]` so the validator can flag them;
 * the empty case is checked BEFORE `validateHeaderPath` (which
 * also rejects `''` with a generic "fails whitelist" message)
 * so the more specific STD-INCLUDE warning wins. Strict-mode
 * upgrade (WARN → ERROR) is wired alongside the existing S5 INFO
 * promotion in `pipeline.ts` — the validator emits WARN, the
 * pipeline decides.
 */
export interface BswmdIndexForModuleHeaderPaths {
  readonly shortName: string;
  readonly moduleHeader?: string;
  readonly includes?: readonly string[];
}

export function validateModuleHeaderPaths(
  bswmdIndex: ReadonlyMap<string, BswmdIndexForModuleHeaderPaths>,
): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const [modName, modDef] of bswmdIndex) {
    if (modDef.moduleHeader !== undefined && !validateHeaderPath(modDef.moduleHeader)) {
      out.push({
        severity: DiagnosticSeverity.ERROR,
        code: DiagnosticCode.BSW_SEC_INVALID_HEADER_PATH,
        moduleShortName: modName,
        message: `Module ${modName} moduleHeader '${modDef.moduleHeader}' fails SEC3 validation (whitelist ^[A-Za-z0-9_./-]+$ + no leading / + no .. segment)`,
      });
    }
    for (const inc of modDef.includes ?? []) {
      // H1: empty entry short-circuits before SEC3 so BSW-SEC-003
      // wins over the generic BSW-SEC-002 "fails whitelist" message.
      if (inc === '') {
        out.push({
          severity: DiagnosticSeverity.WARNING,
          code: DiagnosticCode.BSW_SEC_EMPTY_INCLUDE,
          moduleShortName: modName,
          message: `Module ${modName} STD-INCLUDE has empty SHORT-NAME — entry dropped by consumer (BSW-SEC-003; strict mode promotes to ERROR)`,
        });
        continue;
      }
      if (!validateHeaderPath(inc)) {
        out.push({
          severity: DiagnosticSeverity.ERROR,
          code: DiagnosticCode.BSW_SEC_INVALID_HEADER_PATH,
          moduleShortName: modName,
          message: `Module ${modName} include '${inc}' fails SEC3 validation`,
        });
      }
    }
  }
  return out;
}

/**
 * v1.14.1 PATCH-G (G2) — resolve a `references[]` list to the set
 * of BSWMD-supplied target module headers, deduped against any
 * pre-existing include set. Each ref's `targetModule` is looked
 * up in `bswmdIndex`; if `moduleHeader` is present and passes
 * `validateHeaderPath`, the path is added to the output. The
 * caller-owned `existing` Set is never mutated: a local `seen`
 * Set is seeded from `existing` and used for dedup, so this
 * helper is fully immutable and safe to compose.
 *
 * Caller responsibility: when `ref.targetModule` is in the
 * BSWMD index but its `moduleHeader` is undefined, the caller
 * should push `BSW-SEC-004` so the user knows which target
 * module needs `<HEADER>` added. This helper does not push
 * diagnostics — it only resolves paths.
 */
export function buildReferenceIncludes(
  references: readonly { readonly targetModule: string }[],
  bswmdIndex: ReadonlyMap<string, BswmdIndexForModuleHeaderPaths>,
  existing: ReadonlySet<string>,
): readonly string[] {
  const seen = new Set<string>(existing);
  const out: string[] = [];
  for (const ref of references) {
    const targetDef = bswmdIndex.get(ref.targetModule);
    const hdr = targetDef?.moduleHeader;
    if (hdr && !seen.has(hdr) && validateHeaderPath(hdr)) {
      out.push(hdr);
      seen.add(hdr);
    }
  }
  return out;
}

/**
 * v1.14.3 PATCH-I (R-2.1) — defense-in-depth for the moduleHeader
 * fallback. The BSWMD-supplied branch (defModuleHeader defined) is
 * gated by `validateModuleHeaderPaths` in Stage 1 (BSW-SEC-002 ERROR
 * → S6 early-break, so by emit time any defined value already
 * passes `validateHeaderPath`). The fallback branch synthesizes a
 * path from the module's `shortName` — which is a raw BSWMD string
 * without upstream character validation (the parser's `readShortName`
 * accepts any string). Before v1.14.3 the fallback was a hardcoded
 * literal, so this gap didn't exist; R-2 widened the input boundary
 * that lands in `{{moduleHeader}}` and required this gate.
 *
 * If validation fails, push BSW-SEC-002 with the offending fallback
 * path and return a sentinel value (`_INVALID_HEADER.h`) that the C
 * compiler will reject at compile time. Sentinel uses an underscore
 * prefix to make it visually distinct in downstream diagnostic output.
 */
export function resolveModuleHeader(
  defModuleHeader: string | undefined,
  fallback: string,
  moduleShortName: string,
  ctx: GenerationContext,
): string {
  if (defModuleHeader !== undefined) return defModuleHeader;
  if (validateHeaderPath(fallback)) return fallback;
  ctx.diagnostics.push({
    severity: DiagnosticSeverity.ERROR,
    code: DiagnosticCode.BSW_SEC_INVALID_HEADER_PATH,
    moduleShortName,
    message: `Module ${moduleShortName} fallback moduleHeader '${fallback}' fails SEC3 validation (whitelist ^[A-Za-z0-9_./-]+$); cannot auto-#include`,
  });
  return '_INVALID_HEADER.h';
}

/**
 * v1.14.2 PATCH-H (H2) — resolve a BSWMD's `<STD-INCLUDES>` list
 * to the deduped set of include paths the current module should
 * `#include` in its Cfg.h. Sibling to `buildReferenceIncludes`:
 * this handles the self-supplied includes (the module's own
 * `<STD-INCLUDES>`), the cross-ref helper handles references[].
 * The same `existing` Set pattern keeps the helper immutable —
 * callers can chain `buildSelfIncludes` → `buildReferenceIncludes`
 * in either order without double-emission.
 *
 * Empty entries (`''`) are skipped here — they are the H1
 * `BSW-SEC-003` channel and have already been surfaced by
 * `validateModuleHeaderPaths`. Re-emitting `''` as a `#include ""`
 * directive would produce a malformed C file.
 *
 * Caller responsibility: invalid-character paths are filtered
 * silently here; the validator already pushed `BSW-SEC-002` for
 * them so the user knows which entry failed. This helper
 * intentionally does not push diagnostics — separation keeps
 * it composable and matches `buildReferenceIncludes`.
 */
export function buildSelfIncludes(
  selfIncludes: readonly string[] | undefined,
  existing: ReadonlySet<string>,
): readonly string[] {
  const seen = new Set<string>(existing);
  const out: string[] = [];
  for (const inc of selfIncludes ?? []) {
    if (inc === '' || seen.has(inc) || !validateHeaderPath(inc)) continue;
    out.push(inc);
    seen.add(inc);
  }
  return out;
}

/**
 * v1.15.0 MINOR (B-1) — resolve the `#include` set for a single
 * module's Cfg.h, combining BSWMD-supplied self-includes
 * (`<STD-INCLUDES>`) with cross-module ref-target headers
 * (`<HEADER>` of referenced modules). Replaces the inline 6-line
 * block that previously lived in `EcuCGenerator.emit` and
 * `McuGenerator.emit` (D-rev3 B-1).
 *
 * The helper is fully immutable: the internal `refIncludes` Set is
 * local, seeded from no caller state, and not returned. The
 * `selfPaths` and `refPaths` are fresh arrays. Callers can
 * compose `[...selfPaths, ...refPaths]` to feed the template
 * context, preserving the AUTOSAR convention ordering (self first,
 * cross-ref second).
 *
 * BSW-SEC-004 (cross-module ref target lacks `<HEADER>`) is
 * NOT pushed here — the inline push was the duplication B-1
 * targets. B-2 (next MINOR commit) moves the BSW-SEC-004 push
 * to the new `validateRefTargetHeaders` Stage-1 validator.
 *
 * SEC3 (whitelist `^[A-Za-z0-9_./-]+$`) is enforced inside
 * `buildSelfIncludes` and `buildReferenceIncludes` via
 * `validateHeaderPath`; invalid paths are silently dropped.
 * `validateModuleHeaderPaths` (Stage 1) owns the BSW-SEC-002
 * / BSW-SEC-003 diagnostics.
 */
export function resolveIncludesForModule(
  moduleShortName: string,
  references: readonly { readonly targetModule: string }[],
  bswmdIndex: ReadonlyMap<string, BswmdIndexForModuleHeaderPaths>,
): {
  readonly selfPaths: readonly string[];
  readonly refPaths: readonly string[];
} {
  const refIncludes = new Set<string>();
  const selfDef = bswmdIndex.get(moduleShortName);
  const selfPaths = buildSelfIncludes(selfDef?.includes, refIncludes);
  for (const inc of selfPaths) refIncludes.add(inc);
  const refPaths = buildReferenceIncludes(references, bswmdIndex, refIncludes);
  return { selfPaths, refPaths };
}

/**
 * v1.15.1 PATCH (B-5) — shared `cTypeForKind` for the 5 arms
 * that are byte-identical between EcuC and Mcu generators
 * (per v1.14.3 PATCH-I C-2 fix that confirmed the default
 * arms are identical). The `integer` arm stays per-module:
 * EcuC uses `integerToCType(min, max)` (min/max-aware), Mcu
 * hardcodes `'uint32'` per AUTOSAR convention for clock
 * reference points. EcuC's `reference` and `function-name`
 * arms also stay per-module (Mcu doesn't model those kinds
 * yet).
 *
 * If B-3 (full type-driven refactor) lands, this helper
 * becomes the `default` arm of the unified dispatcher and
 * the per-module `cTypeForKind` functions are deleted.
 *
 * B-5.4 locks the contract with 5 direct unit tests
 * (one per arm).
 */
export function cTypeForBasicKind(kind: string): string {
  switch (kind) {
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

/**
 * v1.15.2 PATCH (B-3 partial) — unified `cTypeForKind` for EcuC + Mcu.
 *
 * The 4 shared arms (boolean / string / float / enumeration) route
 * through `cTypeForBasicKind`. The per-module arms are dispatched on
 * `moduleKind`:
 *
 * - `integer`      : EcuC → integerToCType(min ?? 0, max ?? 0)
 *                    Mcu  → 'uint32' (hardcoded for clock ref points)
 * - `reference`    : EcuC → `const ${def.targetType ?? 'void'} * const`
 *                    Mcu  → no current BSWMD subset; returns 'uint8'
 * - `function-name`: EcuC → def.signature ?? 'void'
 *                    Mcu  → no current BSWMD subset; returns 'uint8'
 * - unknown kind   : 'uint8' fail-safe (per-module semantics, lives
 *                    here not in cTypeForBasicKind)
 *
 * Replaces the per-module `cTypeForKind` previously defined in
 * `ecuc.ts:148` and `mcu.ts:125` (deleted in B-3.3). The unified
 * function is the first step of B-3 (full generator type-driven
 * refactor); B-3 emit*Decl + Handlebars parts remain deferred to
 * v1.16.0 MINOR.
 */
export function cTypeForKind(
  def: EcuCParamDefLike | McuParamDefLike,
  moduleKind: 'EcuC' | 'Mcu',
): string {
  // Per-module `integer` arm — min/max-aware for EcuC, hardcoded
  // for Mcu clock reference points.
  if (def.kind === 'integer') {
    return moduleKind === 'EcuC' ? integerToCType(def.min ?? 0, def.max ?? 0) : 'uint32';
  }
  // EcuC-specific: `reference` + `function-name` arms (v1.14.0 S2).
  // EcuC uses def.targetType / def.signature; Mcu has no current
  // BSWMD entries for these and falls back to the Mcu safe default
  // of `'uint8'`.
  if (def.kind === 'reference') {
    return moduleKind === 'EcuC' ? `const ${def.targetType ?? 'void'} * const` : 'uint8';
  }
  if (def.kind === 'function-name') {
    return moduleKind === 'EcuC' ? (def.signature ?? 'void') : 'uint8';
  }
  // Shared arms: boolean / string / float / enumeration
  return cTypeForBasicKind(def.kind);
}

/**
 * v1.15.0 MINOR (B-2) + v1.15.1 PATCH (M1) — Stage-1 validator
 * that pushes BSW-SEC-004 ERROR for every ECUC reference whose
 * target module is loaded in the BSWMD index but lacks
 * `<HEADER>`. v1.15.0 took (bswmdIndex, ecucValues) for direct
 * access; v1.15.1 migrates to (tree: NormalizedConfigTree) for
 * symmetry with the rest of the Stage-1 validator surface
 * (`validateReferences`, `validateMultiplicity`, etc., all take
 * `tree`). Same diagnostic shape as v1.15.0 — only the signature
 * changes.
 *
 * Uses `tree.references` (the collected `ReferenceEdge[]` built
 * by `normalizeToTree` from every module's `references` field).
 * One loop instead of a per-module iteration with a defensive
 * `values.references ?? []` check; same single source of truth
 * as the rest of Stage 1.
 *
 * Silent when the ref target module is absent from
 * `bswmdIndex` (out of scope; `validateReferences` covers
 * unresolved refs with `ECUC-GEN-010` to avoid double-reporting).
 */
export function validateRefTargetHeaders(tree: NormalizedConfigTree): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const ref of tree.references) {
    const targetDef = tree.bswmdIndex.get(ref.targetModule) as
      | BswmdIndexForModuleHeaderPaths
      | undefined;
    if (targetDef && targetDef.moduleHeader === undefined) {
      out.push({
        severity: DiagnosticSeverity.ERROR,
        code: DiagnosticCode.BSW_SEC_MISSING_TARGET_HEADER,
        moduleShortName: ref.sourceModule,
        ecucPath: ref.sourcePath,
        message: `Reference target module ${ref.targetModule} is loaded but its BSWMD omits <HEADER>; cannot auto-#include for ${ref.sourcePath}`,
      });
    }
  }
  return out;
}
