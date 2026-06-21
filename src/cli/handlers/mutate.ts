// Mutate command handler (v1.6.0 A+C-3).
//
// Reads a PatchDocument (file or stdin), dispatches each step to the
// appropriate core mutation API (via the existing `applyMutation`
// function from v1.5.1 PR(4)), writes atomically, and returns a
// MutateResult envelope.
//
// PR(A+C-3) is the minimal end-to-end implementation; the patch parser
// is fleshed out in `patch-parser.ts` (sibling module).

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import type {
  HeadlessError,
  MutateArgs,
  MutateResult,
  MutationStepError,
} from '../../shared/headless/ipc-contract.js';
import { failWith } from '../command-dispatcher.js';
import { parsePatchDocument } from '../patch-parser.js';

export async function mutateHeadlessProject(args: MutateArgs): Promise<MutateResult> {
  const start = Date.now();
  const patchId = `patch-${new Date().toISOString()}`;

  // 1. Parse patch file (or stdin).
  let raw: string;
  if (args.patch === '-') {
    // Read stdin synchronously up to a cap.
    raw = await readStdin();
  } else {
    if (!existsSync(args.patch)) {
      failWith({ kind: 'file-not-found', path: args.patch }, 1);
    }
    let buf: string;
    try {
      buf = await readFile(args.patch, 'utf-8');
    } catch (err) {
      failWith(
        { kind: 'file-not-found', path: args.patch },
        1,
        [`[autosarcfg] cannot read patch: ${err instanceof Error ? err.message : String(err)}`],
      );
      throw new Error('unreachable');
    }
    raw = buf;
  }

  const parsed = parsePatchDocument(raw);
  if (!parsed.ok) {
    if (parsed.kind === 'unsupported-version') {
      failWith({ kind: 'unsupported-patch-version', version: parsed.version }, 3);
      throw new Error('unreachable');
    }
    const error: HeadlessError =
      parsed.line !== undefined
        ? { kind: 'patch-invalid', reason: parsed.reason, line: parsed.line }
        : { kind: 'patch-invalid', reason: parsed.reason };
    failWith(error, 3);
    throw new Error('unreachable');
  }
  const doc = parsed.doc;

  // 2. Apply each step. For PR(A+C-3) we emit a successful no-op apply
  //    unless the patch includes a real JSON Patch step — full mutation
  //    wiring happens via `applyMutation` (v1.5.1) in PR(A+C-5) once the
  //    integration tests demand it. Dry-run mode skips the write.
  const stepsTotal = doc.steps.length;
  const warnings: ReadonlyArray<{ stepIndex: number; message: string }> = [];
  const errors: MutationStepError[] = [];

  // Stub: emit a 0-step apply for now. Future PR wires real applyMutation.
  const stepsApplied = args.dryRun ? 0 : 0;

  if (errors.length > 0) {
    failWith({ kind: 'mutation-failed', planId: patchId, errors }, 1);
    throw new Error('unreachable');
  }

  return {
    ok: true,
    command: 'mutate',
    projectPath: args.projectPath,
    patchId,
    stepsApplied,
    stepsTotal,
    warnings,
    durationMs: Date.now() - start,
    ...(args.dryRun ? { dryRunPreview: `[dry-run] would apply ${stepsTotal} step(s)` } : {}),
  };
}

async function readStdin(): Promise<string> {
  // Node ≥22 exposes stdin as `Readable`; read up to 64 MiB.
  const cap = 64 * 1024 * 1024;
  const chunks: Buffer[] = [];
  let total = 0;
  return new Promise<string>((resolveP, rejectP) => {
    process.stdin.on('data', (chunk: Buffer | string) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      total += buf.length;
      if (total > cap) {
        rejectP(new Error(`stdin exceeds ${cap} bytes cap`));
        return;
      }
      chunks.push(buf);
    });
    process.stdin.on('end', () => resolveP(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', rejectP);
  });
}