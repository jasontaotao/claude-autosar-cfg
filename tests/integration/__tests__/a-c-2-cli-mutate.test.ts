// A+C integration test #2 — CLI `mutate` happy-path + invalid patch (A+C spec §10.6 row 2).

import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { dispatchCommand } from '../../../src/cli/command-dispatcher.js';
import type { ParsedArgs } from '../../../src/cli/commander.js';

const FIXTURE = 'D:/claude_proj2/claude-AutosarCfg/tests/fixtures/arxml/Com_Com.arxml';

describe('a-c-2: CLI mutate', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'a-c-mutate-'));
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('exits 3 on unsupported patch version (strict per Q11)', async () => {
    const patchPath = join(tmpDir, 'patch.json');
    await writeFile(patchPath, JSON.stringify({ autosarcfgPatchVersion: '999', steps: [] }));

    const parsed: ParsedArgs = {
      kind: 'mutate',
      global: { projectPath: FIXTURE, verbose: false, quiet: false, noColor: false },
      input: {
        projectPath: FIXTURE,
        patch: patchPath,
        format: 'json',
        dryRun: true,
        strict: false,
        backup: true,
      },
    };
    const writes: string[] = [];
    const origOut = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array): boolean => {
      writes.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;
    try {
      const code = await dispatchCommand(parsed);
      expect(code).toBe(3);
      const out = JSON.parse(writes.join('')) as { ok: false; error: { kind: string } };
      expect(out.error.kind).toBe('unsupported-patch-version');
    } finally {
      process.stdout.write = origOut;
    }
  }, 15_000);

  it('exits 3 on missing version field (patch-invalid)', async () => {
    const patchPath = join(tmpDir, 'patch.json');
    await writeFile(patchPath, JSON.stringify({ steps: [] }));

    const parsed: ParsedArgs = {
      kind: 'mutate',
      global: { projectPath: FIXTURE, verbose: false, quiet: false, noColor: false },
      input: {
        projectPath: FIXTURE,
        patch: patchPath,
        format: 'json',
        dryRun: true,
        strict: false,
        backup: true,
      },
    };
    const writes: string[] = [];
    const origOut = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array): boolean => {
      writes.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;
    try {
      const code = await dispatchCommand(parsed);
      expect(code).toBe(3);
      const out = JSON.parse(writes.join('')) as { ok: false; error: { kind: string } };
      expect(out.error.kind).toBe('patch-invalid');
    } finally {
      process.stdout.write = origOut;
    }
  }, 15_000);

  it('dry-run with empty patch emits a successful no-op MutateResult', async () => {
    const patchPath = join(tmpDir, 'patch.json');
    await writeFile(patchPath, JSON.stringify({ autosarcfgPatchVersion: '1', steps: [] }));

    const parsed: ParsedArgs = {
      kind: 'mutate',
      global: { projectPath: FIXTURE, verbose: false, quiet: false, noColor: false },
      input: {
        projectPath: FIXTURE,
        patch: patchPath,
        format: 'json',
        dryRun: true,
        strict: false,
        backup: true,
      },
    };
    const writes: string[] = [];
    const origOut = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array): boolean => {
      writes.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;
    try {
      const code = await dispatchCommand(parsed);
      expect(code).toBe(0);
      const out = JSON.parse(writes.join('')) as { ok: boolean; command: string; stepsTotal: number; dryRunPreview?: string };
      expect(out.ok).toBe(true);
      expect(out.command).toBe('mutate');
      expect(out.stepsTotal).toBe(0);
      expect(out.dryRunPreview).toBeTruthy();
    } finally {
      process.stdout.write = origOut;
    }
  }, 15_000);
});