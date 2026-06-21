// Validate command handler (v1.6.0 A+C-4 stub).
//
// v1: emits an empty `results: []` array with `stub: true`. Cluster G
// replaces this body in v1.6.0 G-side (per A+C spec §10.6 row 3 + §17
// Q7). The wire shape (HEADLESS_VALIDATE_RESULT event) is the canonical
// SoT that G cluster consumes.

import type { ValidateArgs, ValidateResult } from '../../shared/headless/ipc-contract.js';
import { HEADLESS_VALIDATE_RESULT } from '../../shared/headless/ipc-contract.js';

import { readHeadlessProject } from './read.js';

export async function validateHeadlessProject(args: ValidateArgs): Promise<ValidateResult> {
  const start = Date.now();

  // Force a read so the project is opened + parsed before the validator
  // runs. Cluster G will swap this body for the real rule engine.
  await readHeadlessProject({ ...args, format: 'json' });

  const result: ValidateResult = {
    ok: true,
    command: 'validate',
    projectPath: args.projectPath,
    results: [],
    stub: true,
    durationMs: Date.now() - start,
  };

  // Emit the canonical push event so consumers (G cluster, future GUI
  // bridge) can subscribe even though no real rules ran. The bin
  // entry already writes the JSON envelope to stdout; this is the
  // in-process observer side.
  emitValidateResult(result);

  return result;
}

/**
 * Emit the HEADLESS_VALIDATE_RESULT push event on the in-process bus.
 * v1.6.0 only logs to stderr; v1.7.0 wires this to the IPC channel
 * via the `useArxmlStore` subscribe hook (per A+C spec §6 Channel 3).
 */
function emitValidateResult(result: ValidateResult): void {
  process.stderr.write(
    `[autosarcfg] (stub) ${HEADLESS_VALIDATE_RESULT} — ${result.results.length} result(s)\n`,
  );
}
