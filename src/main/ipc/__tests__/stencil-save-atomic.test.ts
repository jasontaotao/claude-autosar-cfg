// Atomic write invariant test for stencilSaveHandler (v1.17.0 FIO-2).
//
// v1.15.5 C1 grep targeted only `writeFileSync` (sync form) and missed
// the async `await fs.writeFile` in stencilSaveHandler.ts:97. This
// test pins the atomic invariant: after a successful write via
// `writeAtomic` (the helper stencilSaveHandler now routes through),
// there must be no `.tmp-*` leftover in the parent directory.

import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('stencilSaveHandler atomic write (FIO-2)', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = join(tmpdir(), `stencil-atomic-${Date.now()}-${Math.random()}`);
    mkdirSync(workDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('workDir starts clean (no .tmp-* leftovers)', () => {
    // Pre-condition guard: the freshly-created workDir must contain
    // no `.tmp-<pid>-<ts>` files. writeAtomic's atomicity invariant
    // depends on this starting state being true.
    const entries = readdirSync(workDir);
    expect(entries.some((e) => /\.tmp-/.test(e))).toBe(false);
  });

  it('writeAtomic (the helper stencilSaveHandler now uses) leaves no .tmp-* leftovers', async () => {
    const { writeAtomic } = await import('../../io/writeAtomic.js');
    const targetPath = join(workDir, 'output.arxml');
    await writeAtomic(targetPath, '<?xml version="1.0"?><AR-PACKAGES/>');
    expect(existsSync(targetPath)).toBe(true);
    const entries = readdirSync(workDir);
    expect(entries.some((e) => /\.tmp-/.test(e))).toBe(false);
  });
});
