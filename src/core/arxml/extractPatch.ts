// core/arxml/extractPatch.ts
//
// Shared module for the IPC handler's "apply patches to a parsed
// ODX-extract ARXML" wrapper. Promoted from
// `dcmConfigHandler.ts:125-208` (function-scoped internal) in v1.28.0
// MINOR so that the v1.27.5 PATCH real-OEM end-to-end test
// (`src/core/bridge/__tests__/dcmConfigPipeline.test.ts`) can import
// the same wrapper — eliminating ~10 LoC of inline prefix-strip +
// serialize-with-sourceArxml logic from the test.
//
// v1.28.1 PATCH — return type migrated from the local ad-hoc
// `{ ok, value/message }` envelope to the project-standard `Result<T>`
// (`core/arxml/types.ts`). The IPC handler (`dcmConfigHandler.ts`) and
// the real-OEM end-to-end test (`dcmConfigPipeline.test.ts`) consume
// the new `error` field; all callers now share one envelope type.

import type { PatchStep } from '../../shared/headless/ipc-contract.js';
import { applyPatchSteps, type ApplyContext } from '../mutation/applyPatchSteps.js';
import type { BswModuleDef } from '../project/bswmd.js';

import { parseArxml } from './parser.js';
import { serializeArxml } from './serializer.js';
import type { Result } from './types.js';

/**
 * Apply a sequence of PatchSteps to a parsed ODX-extract ARXML and
 * serialize the result back to a string. Mirrors the IPC handler's
 * stitch phase (dcmConfigHandler.ts:125-184 in v1.27.5).
 *
 * The wrapper has TWO behaviors beyond a bare applyPatchSteps call
 * that are required for end-to-end correctness:
 *   (a) Prepend `/<docRootPkg>/` to `parentPath` / `containerPath`
 *       on every step so the mutation engine's `findContainerByPath`
 *       resolves the BSWMD-relative paths the mapper emits.
 *   (b) Pass the source ARXML to `serializeArxml` so namespace
 *       declarations and XML preamble are preserved.
 */
export function applyPatchesToExtract(
  extractXml: string,
  serviceSteps: readonly PatchStep[],
  dcmModuleDef: BswModuleDef,
): Result<string> {
  const docRes = parseArxml(extractXml);
  if (!docRes.ok) {
    // `unsupported-version` carries `version` instead of `message`;
    // other variants carry `message`. Normalize to a string.
    const detail =
      'message' in docRes.error
        ? docRes.error.message
        : `version=${'version' in docRes.error ? docRes.error.version : '<unknown>'}`;
    return {
      ok: false,
      error: `Failed to parse ODX-extract ARXML: ${docRes.error.kind} ${detail}`,
    };
  }
  const docRootPkg = docRes.value.packages[0]?.shortName;
  const resolvedSteps =
    docRootPkg !== undefined
      ? serviceSteps.map((s) => prefixDocRootPath(s, docRootPkg))
      : serviceSteps;
  const ctx: ApplyContext = { moduleDef: dcmModuleDef };
  const applyRes = applyPatchSteps(docRes.value, resolvedSteps, ctx);
  if (applyRes.errors.length > 0) {
    return {
      ok: false,
      error: `Patch application failed: ${applyRes.errors
        .map((e) => `${e.kind}: ${e.message}`)
        .join('; ')}`,
    };
  }
  const serRes = serializeArxml(applyRes.doc, { sourceArxml: extractXml });
  if (!serRes.ok) {
    return {
      ok: false,
      error: `Serialize failed: ${serRes.error.kind} at ${serRes.error.path}: ${serRes.error.message}`,
    };
  }
  return { ok: true, value: serRes.value };
}

/**
 * Prepend `/<docRootPkg>/` to step paths so the mutation engine can
 * resolve BSWMD-relative paths. Idempotent on already-prefixed paths.
 * Mirrors the same helper in `xlsxEcucBatchImportHandler:144-163`.
 */
export function prefixDocRootPath(step: PatchStep, docRootPkg: string): PatchStep {
  const prefix = `/${docRootPkg}`;
  if (step.op === 'add-child') {
    return {
      ...step,
      parentPath: step.parentPath.startsWith(prefix)
        ? step.parentPath
        : `${prefix}/${step.parentPath}`,
    };
  }
  if (step.op === 'set-param') {
    return {
      ...step,
      containerPath: step.containerPath.startsWith(prefix)
        ? step.containerPath
        : `${prefix}/${step.containerPath}`,
    };
  }
  return step;
}
