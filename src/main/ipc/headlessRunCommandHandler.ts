// v1.19.0 MINOR — real GUI-mode headless dispatcher.
//
// Replaces `headlessRunCommandStub` (src/main/ipc/headless-stubs.ts:69-74,
// scheduled for deletion as part of v1.19.0 T1). Routes
// `HEADLESS_RUN_COMMAND` IPC to the CLI dispatcher via
// `dispatchCommandForGui` (which skips the CLI-side stdout emission
// since the GUI does not want stdout noise).
//
// After a successful command, emits the corresponding push event so
// the renderer consumer (T3) gets notified:
//   - mutate commands → `emitMutateApplied({ patchId, applied, warnings })`
//   - validate commands → `emitValidateResult(result)`
//
// In CLI mode (no main window), the push emitters are no-ops per the
// v1.18.1 PATCH design — correct: the CLI does not own a renderer.

import type { IpcMainInvokeEvent } from 'electron';

import { dispatchCommandForGui, HeadlessFailureError } from '../../cli/command-dispatcher.js';
import type {
  HeadlessFailure,
  HeadlessRunCommandRequest,
  HeadlessRunCommandResult,
} from '../../shared/headless/ipc-contract.js';
import { emitMutateApplied, emitValidateResult } from '../headless/push-emitters.js';

/**
 * Inject a default `global: GlobalFlags` into the wire-shape
 * `HeadlessCommand` so it matches `DispatchArgs`. The GUI does not
 * carry CLI-shaped globals (no `--locale`, `--no-color`, etc.); the
 * dispatcher doesn't read them either, but the type requires the
 * field on every `ParsedArgs` variant.
 */
function withDefaultGlobal(
  cmd: HeadlessRunCommandRequest['parsedArgs'],
): Parameters<typeof dispatchCommandForGui>[0] {
  const defaultGlobal = {
    projectPath: cmd.input.projectPath,
    verbose: false,
    quiet: false,
    noColor: false,
  };
  switch (cmd.kind) {
    case 'read':
      return { kind: 'read', global: defaultGlobal, input: cmd.input };
    case 'mutate':
      return {
        kind: 'mutate',
        global: defaultGlobal,
        input: { ...cmd.input, strict: false, backup: true },
      };
    case 'validate':
      return { kind: 'validate', global: defaultGlobal, input: cmd.input };
    case 'generate':
      return {
        kind: 'generate',
        global: defaultGlobal,
        input: { ...cmd.input, strict: false },
      };
  }
}

export async function headlessRunCommandHandler(
  _evt: IpcMainInvokeEvent,
  req: HeadlessRunCommandRequest,
): Promise<HeadlessRunCommandResult> {
  try {
    const result = await dispatchCommandForGui(withDefaultGlobal(req.parsedArgs));

    // Push event emission: notify the renderer consumer (T3).
    if (result.command === 'mutate' && result.ok === true) {
      // Narrow to MutateResult for the push payload.
      const applied = result.stepsApplied;
      emitMutateApplied({
        patchId: req.patchId,
        applied,
        warnings: result.warnings,
      });
    } else if (result.command === 'validate') {
      // ValidateResultEvent is type-aliased to ValidateResult.
      emitValidateResult(result);
    }
    // read + generate commands: no push event (renderer doesn't need a
    // notification for these — the renderer already requested them and
    // gets the result via the invoke response).

    return { kind: 'ok', result };
  } catch (err) {
    if (err instanceof HeadlessFailureError) {
      const failure: HeadlessFailure = err.failure;
      return { kind: 'error', failure };
    }
    // Unexpected — wrap as internal-error so the renderer sees a
    // structured HeadlessFailure envelope.
    const message = err instanceof Error ? err.message : String(err);
    const failure: HeadlessFailure = {
      ok: false,
      code: 1,
      error: { kind: 'internal-error', message },
      stderr: [`[autosarcfg] internal error: ${message}`],
    };
    return { kind: 'error', failure };
  }
}
