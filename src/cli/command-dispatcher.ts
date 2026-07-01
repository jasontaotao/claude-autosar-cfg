// Command dispatcher (v1.6.0 A+C-3).
//
// Pure routing: takes a `ParsedArgs` from commander and delegates to
// the matching handler (`read` / `mutate` / `validate` / `generate`).
// Each handler returns a `HeadlessResult`; the dispatcher is responsible
// for emitting the result envelope on stdout (in JSON form per spec §7.5)
// and returning the exit code to the bin entry.
//
// Design: handlers do NOT write to stdout/stderr directly. They return
// a `HeadlessResult` (success) or throw a `HeadlessFailureError` (catch
// at the dispatcher level → emit + exit code). Keeps handlers testable.
//
// v1.11.0 note: `ParsedArgs` (commander.ts) is the v1.6.0 3-sub-command
// union. The dispatcher accepts a wider `DispatchArgs` so the new
// `generate` handler is reachable without modifying commander.ts yet —
// the future commander.ts update just needs to extend `ParsedArgs` to
// include `generate`.

import type {
  HeadlessResult,
  HeadlessFailure,
  HeadlessError,
  GenerateArgs,
} from '../shared/headless/ipc-contract.js';

import type { ParsedArgs } from './commander.js';
import { EXIT_SUCCESS, EXIT_FATAL, EXIT_WARNING, type HeadlessExitCode } from './exitCodes.js';
import { generateHeadlessProject } from './handlers/generate.js';
import { mutateHeadlessProject } from './handlers/mutate.js';
import { readHeadlessProject } from './handlers/read.js';
import { validateHeadlessProject } from './handlers/validate.js';

/**
 * v1.11.0 superset of `ParsedArgs`. Adds `generate` so this dispatcher
 * can route it without waiting for commander.ts to register the 4th
 * sub-command. Existing call sites passing `ParsedArgs` still compile
 * because `ParsedArgs` is a structural subset.
 */
export type DispatchArgs = ParsedArgs | { readonly kind: 'generate'; readonly input: GenerateArgs };

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
export async function dispatchCommand(parsed: DispatchArgs): Promise<HeadlessExitCode> {
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
      case 'generate':
        result = await generateHeadlessProject(parsed.input);
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

  // Generate: a WARNING-only pipeline run (`ok: true` with non-empty
  // diagnostics) still exits 2 so CI can spot generators that emitted
  // partial output (e.g. ECUC-GEN-002 "no generator for module X").
  if (result.command === 'generate' && result.ok === true && result.diagnostics.length > 0) {
    return EXIT_WARNING;
  }

  return EXIT_SUCCESS;
}

/**
 * v1.19.0 MINOR — GUI-mode dispatcher. Same routing as `dispatchCommand`
 * but does NOT write to stdout/stderr (the GUI doesn't want CLI-style
 * stdout noise) and returns the `HeadlessResult` directly (instead of
 * an exit code) so the IPC caller can wrap it in the
 * `HeadlessRunCommandResult` envelope.
 *
 * On `HeadlessFailureError`, re-throws so the IPC caller can wrap the
 * `HeadlessFailure` envelope in the error branch. Callers should catch
 * and convert to IPC error envelope.
 */
export async function dispatchCommandForGui(parsed: DispatchArgs): Promise<HeadlessResult> {
  try {
    switch (parsed.kind) {
      case 'read':
        return await readHeadlessProject(parsed.input);
      case 'mutate':
        return await mutateHeadlessProject(parsed.input);
      case 'validate':
        return await validateHeadlessProject(parsed.input);
      case 'generate':
        return await generateHeadlessProject(parsed.input);
    }
  } catch (err) {
    if (err instanceof HeadlessFailureError) {
      // Re-throw — caller will catch + wrap as IPC error envelope.
      throw err;
    }
    // Unexpected — wrap as internal-error so the GUI sees a structured
    // HeadlessFailure envelope (same shape as the CLI path would emit).
    const message = err instanceof Error ? err.message : String(err);
    throw new HeadlessFailureError({
      ok: false,
      code: EXIT_FATAL,
      error: { kind: 'internal-error', message },
      stderr: [`[autosarcfg] internal error: ${message}`],
    });
  }
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
export function failWith(
  error: HeadlessError,
  code: HeadlessExitCode,
  stderr: readonly string[] = [],
): never {
  throw new HeadlessFailureError({
    ok: false,
    code: code === EXIT_SUCCESS ? EXIT_FATAL : code,
    error,
    stderr: [...stderr],
  });
}
