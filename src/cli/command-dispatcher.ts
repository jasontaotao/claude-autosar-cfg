// Command dispatcher (v1.6.0 A+C-3).
//
// Pure routing: takes a `ParsedArgs` from commander and delegates to
// the matching handler (`read` / `mutate` / `validate`). Each handler
// returns a `HeadlessExitCode`; the dispatcher is responsible for
// emitting the result envelope on stdout (in JSON form per spec §7.5)
// and returning the exit code to the bin entry.
//
// Design: handlers do NOT write to stdout/stderr directly. They return
// a `HeadlessResult` (success) or throw a `HeadlessFailureError` (catch
// at the dispatcher level → emit + exit code). Keeps handlers testable.

import type { HeadlessResult, HeadlessFailure, HeadlessError } from '../shared/headless/ipc-contract.js';

import type { ParsedArgs } from './commander.js';
import { EXIT_SUCCESS, EXIT_FATAL, EXIT_WARNING, type HeadlessExitCode } from './exitCodes.js';
import { mutateHeadlessProject } from './handlers/mutate.js';
import { readHeadlessProject } from './handlers/read.js';
import { validateHeadlessProject } from './handlers/validate.js';

/** Thrown by handlers to short-circuit with a structured failure. */
export class HeadlessFailureError extends Error {
  readonly failure: HeadlessFailure;
  constructor(failure: HeadlessFailure) {
    super(failure.error.kind);
    this.failure = failure;
  }
}

/**
 * Dispatch a parsed command to its handler, emit the result envelope
 * to stdout, and return the appropriate exit code.
 */
export async function dispatchCommand(parsed: ParsedArgs): Promise<HeadlessExitCode> {
  let result: HeadlessResult;
  try {
    switch (parsed.kind) {
      case 'read':
        result = await readHeadlessProject(parsed.input);
        break;
      case 'mutate':
        result = await mutateHeadlessProject(parsed.input);
        break;
      case 'validate':
        result = await validateHeadlessProject(parsed.input);
        break;
    }
  } catch (err) {
    if (err instanceof HeadlessFailureError) {
      emitFailure(err.failure);
      return err.failure.code;
    }
    // Unexpected — wrap as internal-error → exit 1.
    const message = err instanceof Error ? err.message : String(err);
    const failure: HeadlessFailure = {
      ok: false,
      code: EXIT_FATAL,
      error: { kind: 'internal-error', message },
      stderr: [`[autosarcfg] internal error: ${message}`],
    };
    emitFailure(failure);
    return EXIT_FATAL;
  }

  // Success path — emit JSON envelope. TTY-vs-pipe human format is
  // delegated to `bin/autosarcfg.mjs` via stdout re-routing.
  emitResult(result);

  // Warnings-only path: if mutate succeeded with warnings, exit 2 unless
  // `--strict` was set (strict promotes warnings → 1, but the handler
  // returns `EXIT_FATAL` in that case so we never reach here).
  if (parsed.kind === 'mutate' && result.command === 'mutate' && result.warnings.length > 0) {
    return EXIT_WARNING;
  }

  return EXIT_SUCCESS;
}

function emitResult(result: HeadlessResult): void {
  // The bin entry re-encodes via the `--format` flag; for now always
  // emit JSON for downstream tooling (`autosarcfg ... | jq`).
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function emitFailure(failure: HeadlessFailure): void {
  process.stdout.write(`${JSON.stringify(failure, null, 2)}\n`);
  for (const line of failure.stderr) {
    process.stderr.write(`${line}\n`);
  }
}

// Internal helper for handler modules to emit a typed failure.
export function failWith(error: HeadlessError, code: HeadlessExitCode, stderr: readonly string[] = []): never {
  throw new HeadlessFailureError({
    ok: false,
    code: code === EXIT_SUCCESS ? EXIT_FATAL : code,
    error,
    stderr: [...stderr],
  });
}