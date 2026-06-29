// v1.15.5 — IPC stubs for 5 channels that the renderer does NOT consume.
//
// Joint review (2026-06-29) found that `IPC_CHANNELS` declared these
// channels but `register.ts` did not register any handler for them.
// Calling them from renderer (or from future CLI bridge code) would
// throw "no handler registered". This file registers safe no-op stubs
// so the channel-name space is fully populated.
//
// Channels and their consumers (per audit 2026-06-29):
//   - SWS_VALIDATE              (invoke;  no renderer consumer — useSwsValidatorRunner
//                                calls the local store directly)
//   - SWS_VALIDATE_CANCEL       (invoke;  no renderer consumer)
//   - HEADLESS_RUN_COMMAND      (invoke;  no renderer consumer — CLI path goes
//                                via the headless dispatcher directly)
//   - HEADLESS_MUTATE_APPLIED   (push M→R; no listener registered — see comment
//                                in `register.ts`; would cause "no listener" noise)
//   - HEADLESS_VALIDATE_RESULT  (push M→R; no listener registered — same)
//
// When the renderer side actually needs these channels, replace the
// stub with a real handler. The signature shape will likely need
// dedicated request/result types (not the loose `unknown` accept
// we use here for safety).

import type { IpcMainInvokeEvent } from 'electron';

import type { StubHeadlessResult, ValidateResult } from '../../shared/headless/ipc-contract.js';

/**
 * Stub for `SWS_VALIDATE` (renderer→main invoke).
 * Returns an empty `ValidateResult` with the `stub: true` flag so
 * callers can detect "real validator not wired yet".
 */
export async function swsValidateStub(
  _evt: IpcMainInvokeEvent,
  _req: unknown,
): Promise<ValidateResult> {
  // Cast through `unknown` because the stub shape is a deliberate subset
  // of ValidateResult (no `ok` / `command` / `projectPath` — those are
  // populated by the real validator in v1.7.0+). The discriminant
  // contract for callers is the `stub: true` flag.
  return {
    ok: true,
    command: 'validate',
    projectPath: '',
    stub: true,
    results: [],
    durationMs: 0,
  } as unknown as ValidateResult;
}

/**
 * Stub for `SWS_VALIDATE_CANCEL` (renderer→main invoke).
 * No-op — there is no running validator to cancel in v1.15.5.
 */
export async function swsValidateCancelStub(
  _evt: IpcMainInvokeEvent,
  _req: unknown,
): Promise<void> {
  // intentional no-op
}

/**
 * Stub for `HEADLESS_RUN_COMMAND` (renderer→main invoke).
 * Returns a generic `StubHeadlessResult` so callers can detect
 * "headless bridge not wired yet". When the GUI bridge ships (planned
 * for v1.7.0), replace this with a real dispatcher that calls into
 * `src/cli/command-dispatcher.ts`.
 */
export async function headlessRunCommandStub(
  _evt: IpcMainInvokeEvent,
  _req: unknown,
): Promise<StubHeadlessResult> {
  return { ok: true, stub: true };
}