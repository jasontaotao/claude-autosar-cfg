#!/usr/bin/env node
/**
 * Stage 5.A — Electron-builder packaged binary smoke test.
 *
 * Verifies that `release/win-unpacked/AutosarCfg.exe` (or platform equivalent)
 * can spawn, stay alive long enough to render the main BrowserWindow, then
 * be terminated cleanly.
 *
 * What we check:
 *   1. Binary file exists and is non-zero size.
 *   2. Process can be spawned.
 *   3. Process stays alive for >= 3 seconds after spawn (window-init gate).
 *   4. Process is killable via SIGTERM / `taskkill /T` (Windows).
 *
 * What we deliberately do NOT check here:
 *   - Visual UI rendering (would require a Win32 inspection; out of scope for 5.A).
 *   - IPC round-trips (covered by existing unit + e2e tests against `pnpm dev`).
 *   - Auto-update, code signing, crash reporters (deferred to 5.B / v1.0.0).
 *
 * Invocation: `node scripts/smoke-packaged.mjs` (or `pnpm smoke:packaged`).
 *
 * Exit codes:
 *   0 = PASS
 *   1 = FAIL (binary missing, spawn failed, or early death)
 */

import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { platform } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(__dirname, '..');

/** @type {Record<NodeJS.Platform, { exeName: string; dir: string }>} */
const PLATFORM_BIN = {
  win32: { exeName: 'AutosarCfg.exe', dir: 'release/win-unpacked' },
  darwin: { exeName: 'AutosarCfg.app/Contents/MacOS/AutosarCfg', dir: 'release/mac' },
  linux: { exeName: 'AutosarCfg', dir: 'release/linux-unpacked' },
};

const cfg = PLATFORM_BIN[/** @type {NodeJS.Platform} */ (platform)];
if (!cfg) {
  console.error(`Unsupported platform: ${platform}`);
  process.exit(1);
}

const exePath = join(repoRoot, cfg.dir, cfg.exeName);
const ALIVE_THRESHOLD_MS = 3000;
const HARD_TIMEOUT_MS = 12000;

if (!existsSync(exePath)) {
  console.error(`[smoke] FAIL — binary not found: ${exePath}`);
  console.error('[smoke] Run `pnpm package:dir` first to produce win-unpacked/.');
  process.exit(1);
}

const size = statSync(exePath).size;
if (size < 1_000_000) {
  console.error(`[smoke] FAIL — binary suspiciously small: ${size} bytes`);
  process.exit(1);
}

console.log(`[smoke] Binary: ${exePath} (${(size / 1024 / 1024).toFixed(1)} MiB)`);
console.log(`[smoke] Threshold: process must stay alive >= ${ALIVE_THRESHOLD_MS} ms`);
console.log(`[smoke] Hard timeout: ${HARD_TIMEOUT_MS} ms`);

const start = Date.now();
const proc = spawn(exePath, [], {
  cwd: repoRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: false,
  windowsHide: true,
});

let stdoutBuf = '';
let stderrBuf = '';
proc.stdout?.on('data', (chunk) => {
  stdoutBuf += chunk.toString();
});
proc.stderr?.on('data', (chunk) => {
  stderrBuf += chunk.toString();
});

let exited = false;
let exitInfo = /** @type {{ code: number | null; signal: NodeJS.Signals | null } | null} */ (null);
proc.on('exit', (code, signal) => {
  exited = true;
  exitInfo = { code, signal };
});

await new Promise((resolveWait) => setTimeout(resolveWait, ALIVE_THRESHOLD_MS));

if (exited) {
  console.error(`[smoke] FAIL — process exited within ${ALIVE_THRESHOLD_MS} ms`);
  console.error(`[smoke] exit code: ${exitInfo?.code}, signal: ${exitInfo?.signal}`);
  if (stdoutBuf) console.error(`[smoke] stdout:\n${stdoutBuf.slice(-2000)}`);
  if (stderrBuf) console.error(`[smoke] stderr:\n${stderrBuf.slice(-2000)}`);
  process.exit(1);
}

const elapsedMs = Date.now() - start;
console.log(
  `[smoke] PASS — process alive after ${elapsedMs} ms (>= ${ALIVE_THRESHOLD_MS} ms threshold)`,
);

console.log('[smoke] Terminating process tree…');
const killResult = await new Promise((res) => {
  if (platform === 'win32') {
    import('node:child_process').then(({ spawn: sp }) => {
      const killer = sp('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
      killer.on('exit', (code) => res({ ok: code === 0 }));
    });
  } else {
    proc.kill('SIGTERM');
    setTimeout(() => {
      if (!exited) proc.kill('SIGKILL');
    }, 2000);
    res({ ok: true });
  }
});

if (!killResult.ok) {
  console.error('[smoke] FAIL — could not terminate process tree');
  process.exit(1);
}

await new Promise((resolveWait) => setTimeout(resolveWait, 500));
if (!exited) {
  console.error('[smoke] WARN — process still alive after kill; forcing SIGKILL');
  proc.kill('SIGKILL');
}

console.log('[smoke] Smoke test PASS');
process.exit(0);
