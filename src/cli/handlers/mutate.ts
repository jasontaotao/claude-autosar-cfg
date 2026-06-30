// Mutate command handler (v1.6.1 — A+C-3 follow-up).
//
// Reads a PatchDocument (file or stdin), dispatches each step to the
// renderer-agnostic `applyPatchSteps` engine in
// `src/core/mutation/applyPatchSteps.ts`, serializes the mutated
// ARXML back to the source path via the atomic-write helper, and
// returns a `MutateResult` envelope.
//
// Two execution modes:
//   - dry-run  → mutate in memory, surface a preview string, no write
//   - real     → mutate in memory, serialize via `serializeArxml`,
//                write to the source file via `writeAtomic`
//
// Loose-mode input: a single ARXML file. Manifest-mode input
// (`.autosarcfg.json`) is not yet supported in v1.6.1 — the CLI
// only handles the single-file path because the renderer-agnostic
// engine in `core/mutation/applyPatchSteps.ts` is single-doc. The
// multi-doc manifest path lands in v1.7.0 (per A+C spec §5.2).

import { existsSync } from 'node:fs';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parseArxml } from '../../core/arxml/parser.js';
import { serializeArxml } from '../../core/arxml/serializer.js';
import { applyPatchSteps } from '../../core/mutation/applyPatchSteps.js';
import type {
  HeadlessError,
  MutateArgs,
  MutateResult,
  MutationStepError,
  MutationStepWarning,
} from '../../shared/headless/ipc-contract.js';
import { failWith } from '../command-dispatcher.js';
import { parsePatchDocument } from '../patch-parser.js';

export async function mutateHeadlessProject(args: MutateArgs): Promise<MutateResult> {
  const start = Date.now();
  const patchId = `patch-${new Date().toISOString()}`;

  // 1. Parse patch file (or stdin).
  let raw: string;
  if (args.patch === '-') {
    raw = await readStdin();
  } else {
    if (!existsSync(args.patch)) {
      failWith({ kind: 'file-not-found', path: args.patch }, 1);
    }
    let buf: string;
    try {
      buf = await readFile(args.patch, 'utf-8');
    } catch (err) {
      failWith({ kind: 'file-not-found', path: args.patch }, 1, [
        `[autosarcfg] cannot read patch: ${err instanceof Error ? err.message : String(err)}`,
      ]);
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
  const stepsTotal = doc.steps.length;

  // 2. Open the project (loose ARXML mode for v1.6.1). Manifest
  //    mode is deferred to v1.7.0.
  const projectPath = resolve(args.projectPath);
  if (!existsSync(projectPath)) {
    failWith({ kind: 'file-not-found', path: projectPath }, 1);
  }
  let xml: string;
  try {
    xml = await readFile(projectPath, 'utf-8');
  } catch (err) {
    failWith({ kind: 'file-not-found', path: projectPath }, 1, [
      `[autosarcfg] cannot read project: ${err instanceof Error ? err.message : String(err)}`,
    ]);
    throw new Error('unreachable');
  }
  const parsedDoc = parseArxml(xml);
  if (!parsedDoc.ok) {
    const message = 'message' in parsedDoc.error ? parsedDoc.error.message : parsedDoc.error.kind;
    failWith({ kind: 'parse-error', path: projectPath, message }, 1, [
      `[autosarcfg] parse failed: ${message}`,
    ]);
    throw new Error('unreachable');
  }
  const arxmlDoc = { ...parsedDoc.value, path: projectPath };

  // 3. Apply each step via the renderer-agnostic engine.
  const result = applyPatchSteps(arxmlDoc, doc.steps);
  const errors: MutationStepError[] = result.errors.map((e) => ({
    stepIndex: e.stepIndex,
    kind: e.kind,
    message: e.message,
  }));
  // v1.18.0 Obs-3 — surface non-fatal diagnostics from
  // `applyPatchSteps` (e.g. C8 variant downgrade warning).
  // CLI dispatcher maps a non-empty array to EXIT_WARNING.
  const warnings: ReadonlyArray<MutationStepWarning> = result.warnings.map((w) => ({
    stepIndex: w.stepIndex,
    kind: w.kind,
    message: w.message,
  }));

  if (errors.length > 0) {
    failWith({ kind: 'mutation-failed', planId: patchId, errors }, 1);
    throw new Error('unreachable');
  }

  // 4. Serialize + (atomic) write unless dry-run.
  if (!args.dryRun) {
    const serialized = serializeArxml(result.doc);
    if (!serialized.ok) {
      failWith({ kind: 'write-failed', path: projectPath, message: serialized.error.message }, 1, [
        `[autosarcfg] serialize failed: ${serialized.error.message}`,
      ]);
      throw new Error('unreachable');
    }
    try {
      await writeAtomic(projectPath, serialized.value);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failWith({ kind: 'write-failed', path: projectPath, message }, 1, [
        `[autosarcfg] write failed: ${message}`,
      ]);
      throw new Error('unreachable');
    }
  }

  return {
    ok: true,
    command: 'mutate',
    projectPath,
    patchId,
    // Dry-run reports `stepsApplied: 0` (no commit landed) per the
    // A+C spec's "no commit on dry-run" contract. The preview
    // string carries the engine's reported would-apply count so
    // CI can spot unexpected no-ops (e.g. a 1-step patch that the
    // engine rejected silently).
    stepsApplied: args.dryRun ? 0 : result.applied,
    stepsTotal,
    warnings,
    durationMs: Date.now() - start,
    ...(args.dryRun
      ? {
          dryRunPreview: buildDryRunPreview(doc.steps.length, result.applied, projectPath),
        }
      : {}),
  };
}

/**
 * Atomic write: write to `<file>.tmp-<pid>-<ts>` then `rename()`.
 * On failure the temp file is cleaned up; the original file is
 * preserved. This is the Node-only cousin of the v1.5.1 main-side
 * `writeAtomic` helper (which lives in `src/main/ipc/projectSaveHandler.ts`
 * and is unavailable to the standalone CLI process).
 */
async function writeAtomic(target: string, content: string): Promise<void> {
  const tmpPath = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(tmpPath, content, 'utf-8');
    await rename(tmpPath, target);
  } catch (err) {
    // Best-effort cleanup; ignore secondary failure to keep the
    // original error envelope intact.
    try {
      const fs = await import('node:fs/promises');
      await fs.unlink(tmpPath);
    } catch {
      // ignore
    }
    throw err;
  }
}

function buildDryRunPreview(stepCount: number, applied: number, target: string): string {
  return `[dry-run] ${target}: would apply ${stepCount} step(s); engine reported ${applied} would land`;
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
