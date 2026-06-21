// A+C integration test #3 — CLI `--validate` stub emits `headless:validate-result:v1`
// (A+C spec §10.6 row 3 — unblocks G cluster).

import { describe, it, expect } from 'vitest';

import { dispatchCommand } from '../../../src/cli/command-dispatcher.js';
import type { ParsedArgs } from '../../../src/cli/commander.js';
import { HEADLESS_VALIDATE_RESULT } from '../../../src/shared/headless/ipc-contract.js';

const FIXTURE = 'D:/claude_proj2/claude-AutosarCfg/tests/fixtures/arxml/Com_Com.arxml';

describe('a-c-3: CLI --validate stub', () => {
  it('emits empty results + stub:true and exits 0', async () => {
    const parsed: ParsedArgs = {
      kind: 'validate',
      global: { projectPath: FIXTURE, verbose: false, quiet: false, noColor: false },
      input: { projectPath: FIXTURE, format: 'json', stub: true },
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
      const out = JSON.parse(writes.join('')) as {
        ok: boolean;
        command: string;
        stub: boolean;
        results: unknown[];
        durationMs: number;
      };
      expect(out.ok).toBe(true);
      expect(out.command).toBe('validate');
      expect(out.stub).toBe(true);
      expect(out.results).toEqual([]);
      expect(out.durationMs).toBeGreaterThanOrEqual(0);
    } finally {
      process.stdout.write = origOut;
    }
  }, 15_000);

  it('logs the canonical HEADLESS_VALIDATE_RESULT channel name (stub marker)', async () => {
    const parsed: ParsedArgs = {
      kind: 'validate',
      global: { projectPath: FIXTURE, verbose: false, quiet: false, noColor: false },
      input: { projectPath: FIXTURE, format: 'json', stub: true },
    };

    const stderr: string[] = [];
    const origErr = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array): boolean => {
      stderr.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    }) as typeof process.stderr.write;

    try {
      await dispatchCommand(parsed);
      // The handler emits the channel name on stderr as a stub marker.
      expect(stderr.join('')).toContain(HEADLESS_VALIDATE_RESULT);
    } finally {
      process.stderr.write = origErr;
    }
  }, 15_000);
});