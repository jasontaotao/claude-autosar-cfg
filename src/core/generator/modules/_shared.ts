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
//   - `cTypeForKind` — still per-module because the `default` arm
//     differs (EcuC `'uint8'`, Mcu `'uint8'`, but the shared `cType`
//     returns `'??'`). The integer arm routes through `integerToCType`
//     (v1.13.2 PATCH-E) so the only remaining difference is the
//     default arm — minor enough to leave per-module (D-rev2 C11 noted
//     but not action-required since `cType`'s `'??'` is fail-fast by
//     design and not actually reachable through the BSWMD parser).

import { DiagnosticCode, DiagnosticSeverity } from '../diagnostics.js';
import type { GenerationContext } from '../registry.js';

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
 * Push the E9 empty-variant INFO diagnostic. Shared across modules
 * so every `ModuleGenerator` surfaces consistent semantics: if the
 * active variant has neither BSWMD containers nor ECUC parameter
 * values, the user sees `ECUC-GEN-INFO-001` explaining that the
 * emit produced a stub.
 *
 * Severity is INFO today (v1.13.0 default). v1.14.0 MINOR will
 * promote to WARN/ERROR per D-rev2 Senior S5.
 */
export function pushEmptyVariantDiagnostic(
  ctx: GenerationContext,
  moduleShortName: string,
): void {
  ctx.diagnostics.push({
    severity: DiagnosticSeverity.INFO,
    code: DiagnosticCode.ECUC_GEN_INFO_EMPTY_VARIANT,
    moduleShortName,
    message: `Module ${moduleShortName}: active variant has no containers or parameters; emit is a stub`,
  });
}
