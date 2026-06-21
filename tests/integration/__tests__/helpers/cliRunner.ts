// Helper: spawn `node bin/autosarcfg.mjs ...` for integration tests.
//
// Used by a-c-1 / a-c-2 / a-c-3 / a-c-4 to exercise the CLI binary
// end-to-end. Spawns a fresh Node process (no shared state) and
// captures stdout / stderr / exit code.

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../../..');
const BIN_PATH = resolve(REPO_ROOT, 'bin/autosarcfg.mjs');

export interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
}

export interface CliRunnerOptions {
  readonly cwd?: string;
  readonly timeoutMs?: number;
}

export async function runCli(args: readonly string[], options: CliRunnerOptions = {}): Promise<CliResult> {
  const start = Date.now();
  const timeoutMs = options.timeoutMs ?? 15_000;

  return new Promise<CliResult>((resolveP, rejectP) => {
    const child = spawn(process.execPath, [BIN_PATH, ...args], {
      cwd: options.cwd ?? REPO_ROOT,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
      rejectP(new Error(`CLI timed out after ${timeoutMs}ms; args=${JSON.stringify(args)}`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (killed) return;
      resolveP({
        exitCode: code ?? 0,
        stdout,
        stderr,
        durationMs: Date.now() - start,
      });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      rejectP(err);
    });
  });
}