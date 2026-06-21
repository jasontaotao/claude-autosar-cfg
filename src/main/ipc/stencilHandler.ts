// v1.8.0 K Stencil Wizard — Task 4 + Task 8 IPC handler.
//
// Wires the renderer-callable `stencil:generate:v1` IPC channel to the
// BSWMD-free builder dispatcher (`buildStencil`) and the core ARXML
// serializer. The handler is intentionally split into a pure function
// (`handleStencilGenerate`) and a thin registration shim
// (`registerStencilHandler`) so the unit tests exercise the pure path
// directly — no `ipcMain.handle` round-trip needed.
//
// Task 8 added the G RunResult gate: when `req.gate === true` AND
// `req.mode === 'free'`, after a successful build + serialize the
// handler converts the `ArxmlDocument` to a `NormalizedDocument` (via
// the existing `fromArxmlDocument` helper) and invokes v1.6.0
// Cluster G's `runValidation` engine. Any `InternalValidatorResult`
// with `severity === 'error'` blocks generation — the handler
// returns a typed `{ ok: false, errors: [...] }` envelope. Warnings
// and infos do not block.
//
// `with-bswmd` mode intentionally skips the gate here — Task 9 owns
// that path's BSWMD merge + its own validation hook.
//
// CLI parity is deferred to v1.9.0+. See
// `docs/superpowers/plans/2026-06-21-v1-8-0-k-stencil.md` Tasks 4 + 8.

import { ipcMain } from 'electron';

import { serializeArxml } from '../../core/arxml/serializer.js';
import { RuleRegistry } from '../../core/sws-validator/RuleRegistry.js';
import { runValidation } from '../../core/sws-validator/engine.js';
import { rule as c5 } from '../../core/sws-validator/starter/SWS_BSWMD_DEPS_PRESENT.js';
import { rule as c1 } from '../../core/sws-validator/starter/SWS_COM_PDUID_UNIQUE.js';
import { rule as c4 } from '../../core/sws-validator/starter/SWS_ECUC_MULTIPLICITY_MIN.js';
import { rule as c3 } from '../../core/sws-validator/starter/SWS_PDUR_ROUTING_COMPLETE.js';
import { IPC_CHANNELS } from '../../shared/ipc-contract.js';
import { fromArxmlDocument } from '../../shared/normalized-document.js';
import { buildStencil } from '../stencil/builder.js';
import type { StencilFamily, StencilRequest, StencilResponse } from '../stencil/types.js';

/**
 * Suggested filename per family. Mirrors the AUTOSAR SWS convention
 * `<ModuleName>.arxml` — what EB tresos / Vector default to when you
 * ask "save the Com configuration as a file". The renderer can
 * pre-fill the Save dialog with this name.
 */
const SUGGESTED_FILENAMES: Record<StencilFamily, string> = {
  com: 'Com.arxml',
  comm: 'ComM.arxml',
  ecuc: 'EcuC.arxml',
  pdur: 'PduR.arxml',
};

/**
 * Sentinel set used to validate `req.family` at runtime. The static
 * type (`StencilFamily` literal union) prevents bad calls from TypeScript
 * code, but the IPC bridge passes through any string from the renderer —
 * a tampered preload could send `family: 'foo'`. We refuse unknown
 * families with a typed error envelope rather than letting
 * `BUILDERS[family]` silently yield `undefined()`.
 */
const KNOWN_FAMILIES: ReadonlySet<StencilFamily> = new Set([
  'com',
  'comm',
  'ecuc',
  'pdur',
]);

/**
 * Built-in rule registry for the gate. Constructed lazily so importing
 * this module doesn't pay the cost when the gate is never invoked.
 * Mirrors `buildBuiltinRegistry()` in
 * `src/renderer/store/useSwsValidatorStore.ts:51` — both the renderer
 * panel and the main-side gate share the same 4 starter rules so a
 * wizard-generated skeleton that triggers the same fault in the panel
 * also blocks at generation time (no rule drift between UIs).
 */
let _builtinRegistry: RuleRegistry | null = null;
function getBuiltinRegistry(): RuleRegistry {
  if (_builtinRegistry === null) {
    const r = new RuleRegistry();
    r.register(c1);
    r.register(c3);
    r.register(c4);
    r.register(c5);
    _builtinRegistry = r;
  }
  return _builtinRegistry;
}

export async function handleStencilGenerate(req: StencilRequest): Promise<StencilResponse> {
  // Defensive: an unexpected family reaches us via the IPC bridge. We
  // cannot throw — ipcMain.handle would surface that as a generic IPC
  // error. Instead, return a typed error envelope so the renderer can
  // dispatch a localized toast via `result.error.i18nKey`.
  if (!KNOWN_FAMILIES.has(req.family)) {
    return {
      ok: false,
      error: {
        code: 'UNKNOWN_FAMILY',
        i18nKey: 'stencil.error.unknownFamily',
      },
    };
  }

  // Task 8 gate opt-in: only applies in `free` mode. `with-bswmd`
  // mode is intentionally NOT gated here — Task 9 owns that path's
  // BSWMD merge step (which produces the final schema layer) and
  // brings its own validation hook tied to `useArxmlStore.bswmdSchemas`.
  // Gating here would validate an intermediate artifact, not the
  // merged result — a false negative is worse than running the
  // validator twice, so we defer entirely.
  //
  // Per Task 9 scope, with-bswmd is currently served by the same
  // free-mode path until Task 9 lands; we just skip the gate for it.
  const shouldGate = req.gate === true && req.mode === 'free';

  try {
    const doc = buildStencil(req.family);
    const serialized = serializeArxml(doc);
    if (!serialized.ok) {
      // serializeArxml returns a typed SerializeError. Surface it as a
      // typed envelope too — callers can pattern-match on
      // `result.error.code` for switch-based routing.
      return {
        ok: false,
        error: {
          code: 'SERIALIZE_FAILED',
          i18nKey: 'stencil.error.serializeFailed',
        },
      };
    }

    // G RunResult gate (Task 8). When `shouldGate` is true, normalize
    // the freshly-built document and run v1.6.0 Cluster G's validator
    // against it. `schemaLayer` is null in the BSWMD-free path — the
    // engine tolerates missing module metadata per v1.6.0 G spec §3.4
    // (rules that need it degrade gracefully; the gate still catches
    // generic SWS violations).
    if (shouldGate) {
      const normalized = fromArxmlDocument(doc);
      const runResult = await runValidation(getBuiltinRegistry(), {
        document: normalized,
        schemaLayer: null,
      });
      const errorViolations = runResult.results.filter((r) => r.severity === 'error');
      if (errorViolations.length > 0) {
        // K spec §4.1: gate envelope carries the violations array, NOT
        // a single error code — the renderer shows each in the gate
        // panel so the user can fix the source issue and re-run.
        return {
          ok: false,
          errors: errorViolations.map((r) => ({
            ruleId: r.ruleId,
            severity: r.severity,
            message: r.messageKey,
          })),
        };
      }
      // All clear (warnings/info present, or zero results) — fall
      // through to the success path below.
    }

    return {
      ok: true,
      xml: serialized.value,
      suggestedFilename: SUGGESTED_FILENAMES[req.family],
    };
  } catch (e) {
    // Defensive: buildStencil itself shouldn't throw, but if a future
    // family builder introduces a runtime fault we still want a typed
    // envelope rather than an IPC rejection. The same envelope is
    // used as the gate-call fallback — if `runValidation` itself
    // throws (e.g. registry initialization fault), we surface the
    // same typed envelope rather than an IPC rejection.
    return {
      ok: false,
      error: {
        code: 'BUILD_FAILED',
        i18nKey: 'stencil.error.buildFailed',
      },
    };
  }
}

/**
 * Register the renderer-callable IPC channel. Called once from
 * `src/main/ipc/register.ts` during main-process startup. The channel
 * string is sourced from `IPC_CHANNELS.STENCIL_GENERATE_V1` (defined in
 * `src/shared/ipc-contract.ts`) — never a string literal here, so a
 * rename in one place can't drift from the other.
 */
export function registerStencilHandler(): void {
  ipcMain.handle(
    IPC_CHANNELS.STENCIL_GENERATE_V1,
    async (_event, req: StencilRequest): Promise<StencilResponse> => handleStencilGenerate(req),
  );
}