// v1.18.1 PATCH — Headless push channel emitters.
//
// Two emitters that ship the `HEADLESS_MUTATE_APPLIED` and
// `HEADLESS_VALIDATE_RESULT` events to the renderer via
// `webContents.send`. Mirror the `SCRIPT_PROGRESS` push pattern
// in `src/main/ipc/script-handler.ts:312-336`:
//
//   1. Snapshot `getMainWindow()` (the accessor may be cleared by
//      `registerMainWindowCloseHandler` between snapshot and send).
//   2. Guard with `mainWindow === null || mainWindow.isDestroyed()`.
//   3. Send via `mainWindow.webContents.send(channel, payload)`.
//
// In CLI mode (standalone `bin/autosarcfg.mjs`), there is no main
// window — `getMainWindow()` returns null and the emitters are
// no-ops. This is correct: the CLI does not own a renderer; the
// push channels are exclusively for the future GUI bridge (per
// v1.17.0 spec §15.1 deferral note).
//
// Future consumers (GUI bridge dispatcher, v1.19.0 MINOR scope):
// call `emitMutateApplied({ patchId, applied, warnings })` after a
// mutate completes; call `emitValidateResult(validateResultEnvelope)`
// after a validate run completes.

import type {
  MutateAppliedEvent,
  ValidateResultEvent,
} from '../../shared/headless/ipc-contract.js';
import {
  HEADLESS_MUTATE_APPLIED,
  HEADLESS_VALIDATE_RESULT,
} from '../../shared/headless/ipc-contract.js';
import { getMainWindow } from '../window.js';

/**
 * Emit a `HEADLESS_MUTATE_APPLIED` event to the renderer.
 *
 * No-op when the main window is null (CLI mode, or window closed
 * before the deferred dispatch runs) or when the window is destroyed
 * (race between user close and main-side emit).
 */
export function emitMutateApplied(event: MutateAppliedEvent): void {
  const mainWindow = getMainWindow();
  if (mainWindow === null || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(HEADLESS_MUTATE_APPLIED, event);
}

/**
 * Emit a `HEADLESS_VALIDATE_RESULT` event to the renderer.
 *
 * No-op when the main window is null or destroyed (same conditions
 * as `emitMutateApplied`).
 */
export function emitValidateResult(event: ValidateResultEvent): void {
  const mainWindow = getMainWindow();
  if (mainWindow === null || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(HEADLESS_VALIDATE_RESULT, event);
}
