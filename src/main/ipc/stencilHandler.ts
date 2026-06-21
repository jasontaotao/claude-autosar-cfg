// v1.8.0 K Stencil Wizard — Task 4 IPC handler.
//
// Wires the renderer-callable `stencil:generate:v1` IPC channel to the
// BSWMD-free builder dispatcher (`buildStencil`) and the core ARXML
// serializer. The handler is intentionally split into a pure function
// (`handleStencilGenerate`) and a thin registration shim
// (`registerStencilHandler`) so the unit tests exercise the pure path
// directly — no `ipcMain.handle` round-trip needed.
//
// Gate logic (SWS Validator opt-in, blocks on `severity === 'error'`)
// is NOT implemented here — Task 8 wires `invokeSwsValidatorRun`. CLI
// parity is deferred to v1.9.0+. See
// `docs/superpowers/plans/2026-06-21-v1-8-0-k-stencil.md` Task 4.

import { ipcMain } from 'electron';

import { serializeArxml } from '../../core/arxml/serializer.js';
import { IPC_CHANNELS } from '../../shared/ipc-contract.js';
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
    return {
      ok: true,
      xml: serialized.value,
      suggestedFilename: SUGGESTED_FILENAMES[req.family],
    };
  } catch (e) {
    // Defensive: buildStencil itself shouldn't throw, but if a future
    // family builder introduces a runtime fault we still want a typed
    // envelope rather than an IPC rejection.
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