// v1.52.0 MINOR T2 -- extracted bridge-runtime seam for vi.spyOn.
//
// Round-9 audit F-3 (MEDIUM): the `bridge-failed` kind discriminator
// at dbcImportComStackHandler.ts:456 was flagged as TRULY-OPEN
// because the inline `runBridgeForProject` + `applyPlanToFile`
// private functions (lines 294 + 183 of dbcImportComStackHandler.ts)
// block vi.spyOn. The behavioral-test path requires either a
// source refactor that exposes a testable seam (preferred) or
// brittle DbcBridgePlan-with-mismatched-patches construction.
//
// v1.51.0 PATCH T4 added a deferral stub at the test file. v1.52.0
// MINOR T2 closes the deferred closure by extracting these two
// private functions into this exported module. The handler file
// (dbcImportComStackHandler.ts) is the only consumer.
//
// NOT in src/core/bridge/ because the bridge runtime is
// specifically the *handler-side* glue between the bridge mapping
// (core/bridge/) and the IPC surface. The file lives at
// `src/main/ipc/_bridge-runtime.ts` (the leading underscore
// indicates "internal helper, not consumed outside this dir") and
// exports the seam via the public functions below.
//
// The function bodies are CLIPPED VERBATIM from
// dbcImportComStackHandler.ts:183-256 + 294-321 per the lesson
// `function-extract-must-clip-verbatim-not-reimplement` (#15). Only
// the imports list, the function signatures (now exported), and the
// function names (now public) changed; the body bytes are
// character-for-character identical.

import { promises as fs } from 'node:fs';

import { parseArxml } from '../../core/arxml/parser/parse.js';
import type { ParseError } from '../../core/arxml/parser/parse.js';
import { serializeArxml } from '../../core/arxml/serializer.js';
import type { SerializeError } from '../../core/arxml/serializer.js';
import type { DbcBridgePlan } from '../../core/bridge/dbcToComStack.js';
import type { ApplyContext } from '../../core/mutation/applyPatchSteps.js';
import { applyPatchSteps } from '../../core/mutation/applyPatchSteps.js';
import type { BswModuleDef, BswmdError } from '../../core/project/bswmd.js';

export interface BridgeFileOutcome {
  readonly path: string;
  readonly serialized: string;
  readonly added: number;
}

/** `null` indicates the per-file bridge failed AND the caller already
 *  returned early on the first non-ok outcome (see runBridgeForProject).
 *  This shape is what triggers the `bridge-failed` discriminant at
 *  dbcImportComStackHandler.ts:453. */
export type BridgeFileOutcomeOrNull = BridgeFileOutcome | null;

export type RunBridgeResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly outcomes: readonly [
          BridgeFileOutcomeOrNull,
          BridgeFileOutcomeOrNull,
          BridgeFileOutcomeOrNull,
        ];
      };
    }
  | {
      readonly ok: false;
      readonly kind: 'read-failed' | 'bridge-failed';
      readonly message: string;
    };

/** Render a `BswmdError` as a one-line string. Same shape as `ParseError`. */
export function formatBridgeBswmdError(err: BswmdError): string {
  if (err.kind === 'unsupported-version') {
    return `unsupported-version (got "${err.version}")`;
  }
  const pathField = 'path' in err && typeof err.path === 'string' ? ` at ${err.path}` : '';
  return `${err.kind}${pathField}: ${err.message}`;
}

/** Render a `ParseError` as a one-line string for IPC error envelopes. */
export function formatBridgeParseError(err: ParseError): string {
  // Discriminated union: not every kind carries `path` + `message`
  // (e.g. `unsupported-version` carries `version` only, `xml-malformed`
  // carries `message` only). Stringify the discriminant so callers see
  // a uniform one-line message.
  if (err.kind === 'unsupported-version') {
    return `unsupported-version (got "${err.version}")`;
  }
  const pathField = 'path' in err && typeof err.path === 'string' ? ` at ${err.path}` : '';
  return `${err.kind}${pathField}: ${err.message}`;
}

/** Render a `SerializeError` as a one-line string. */
export function formatBridgeSerializeError(err: SerializeError): string {
  return `${err.kind} at ${err.path}: ${err.message}`;
}

/**
 * Apply a single file's patch plan + serialize. Returns the
 * serialized content + applied count, OR an error message.
 *
 * (Clip-verbatim from dbcImportComStackHandler.ts:183-257 per
 * v1.46.0 D5 + lesson #15; the body bytes are identical.)
 */
export async function applyPlanToFile(
  filePath: string,
  planSteps: DbcBridgePlan['comPatches'],
  moduleDef: BswModuleDef | undefined,
): Promise<{ ok: true; value: BridgeFileOutcome } | { ok: false; message: string }> {
  let sourceText: string;
  try {
    sourceText = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    return {
      ok: false,
      message: `Failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const docRes = parseArxml(sourceText);
  if (!docRes.ok) {
    return {
      ok: false,
      message: `${filePath}: parse failed: ${formatBridgeParseError(docRes.error)}`,
    };
  }
  // v1.23.0 T3 -- `exactOptionalPropertyTypes: true` requires us to
  // conditionally include `moduleDef` rather than passing
  // `{ moduleDef: undefined }` (which the compiler rejects).
  const ctx: ApplyContext = moduleDef !== undefined ? { moduleDef } : {};
  const applyRes = applyPatchSteps(docRes.value, planSteps, ctx);
  // v1.23.0 T3 fix -- filter "BSWMD does not declare a child container"
  // errors as advisory rather than fatal. The T2 mapper emits
  // ComSignal `add-child` steps inside a new ComIPdu, but the demo-ecu
  // BSWMDs do NOT declare a `ComSignal` child under `ComConfig` (only
  // `ComIPdu` with `ComPduId` parameter). The T2 mapper can't know the
  // BSWMD shape ahead of time -- it emits the full plan; the T3 handler
  // is the layer that knows which steps the BSWMD actually validates.
  const fatalErrors = applyRes.errors.filter((e) => e.kind !== 'path-not-found');
  if (fatalErrors.length > 0) {
    const details = fatalErrors
      .map((e) => `step ${e.stepIndex} (${e.kind}): ${e.message}`)
      .join('; ');
    return { ok: false, message: `${filePath}: ${details}` };
  }
  const actuallyApplied = applyRes.applied;
  const serRes = serializeArxml(applyRes.doc, { sourceArxml: sourceText });
  if (!serRes.ok) {
    return {
      ok: false,
      message: `${filePath}: serialize failed: ${formatBridgeSerializeError(serRes.error)}`,
    };
  }
  return {
    ok: true,
    value: { path: filePath, serialized: serRes.value, added: actuallyApplied },
  };
}

/**
 * Run the bridge against the 3 manifest-relative Com-stack files.
 *
 * (Clip-verbatim from dbcImportComStackHandler.ts:294-321 per
 * v1.46.0 D5 + lesson #15; the body bytes are identical.)
 */
export async function runBridgeForProject(
  paths: { comPath: string; canIfPath: string; pduRPath: string },
  plan: DbcBridgePlan,
  bswmdDefs: ReadonlyMap<string, BswModuleDef>,
): Promise<RunBridgeResult> {
  const com = await applyPlanToFile(paths.comPath, plan.comPatches, bswmdDefs.get('Com'));
  if (!com.ok) return { ok: false, kind: 'read-failed', message: com.message };
  const canIf = await applyPlanToFile(paths.canIfPath, plan.canIfPatches, bswmdDefs.get('CanIf'));
  if (!canIf.ok) return { ok: false, kind: 'read-failed', message: canIf.message };
  const pduR = await applyPlanToFile(paths.pduRPath, plan.pduRPatches, bswmdDefs.get('PduR'));
  if (!pduR.ok) return { ok: false, kind: 'read-failed', message: pduR.message };
  return {
    ok: true,
    value: { outcomes: [com.value, canIf.value, pduR.value] },
  };
}
