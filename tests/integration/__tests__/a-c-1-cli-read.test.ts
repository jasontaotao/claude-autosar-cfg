// A+C integration test #1 — CLI `read` on an existing fixture (A+C spec §10.6 row 1).
//
// These tests exercise the same code path that the `bin/autosarcfg.mjs`
// entry invokes (parseCliArgs → dispatchCommand → handler). The actual
// bin entry uses Node's --experimental-strip-types + custom loader
// (see bin/ts-loader.mjs); for CI reproducibility the integration
// tests invoke the typed handler stack directly.

import { describe, it, expect } from 'vitest';

import { dispatchCommand } from '../../../src/cli/command-dispatcher.js';
import type { ParsedArgs } from '../../../src/cli/commander.js';

const FIXTURE = 'D:/claude_proj2/claude-AutosarCfg/tests/fixtures/arxml/Com_Com.arxml';

interface StdCapture {
  stdout: string[];
  stderr: string[];
  restore: () => void;
}

function captureStd(): StdCapture {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    stdout.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    stderr.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  }) as typeof process.stderr.write;
  return {
    stdout,
    stderr,
    restore: () => {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
  };
}

describe('a-c-1: CLI read against existing fixture', () => {
  it('exits 0 and emits a valid ReadResult JSON envelope', async () => {
    const parsed: ParsedArgs = {
      kind: 'read',
      global: { projectPath: FIXTURE, verbose: false, quiet: false, noColor: false },
      input: { projectPath: FIXTURE, format: 'json' },
    };
    const cap = captureStd();
    try {
      const code = await dispatchCommand(parsed);
      expect(code).toBe(0);
      const out = JSON.parse(cap.stdout.join('')) as { ok: boolean; command: string; summary: { moduleCount: number; containerCount: number; parameterCount: number; referenceCount: number }; durationMs: number };
      expect(out.ok).toBe(true);
      expect(out.command).toBe('read');
      expect(out.summary.moduleCount).toBeGreaterThanOrEqual(0);
      expect(out.summary.containerCount).toBeGreaterThanOrEqual(0);
      expect(out.durationMs).toBeGreaterThanOrEqual(0);
    } finally {
      cap.restore();
    }
  }, 15_000);

  it('exits 1 (fatal) for missing file with file-not-found envelope', async () => {
    const parsed: ParsedArgs = {
      kind: 'read',
      global: { projectPath: '/nonexistent/foo.arxml', verbose: false, quiet: false, noColor: false },
      input: { projectPath: '/nonexistent/foo.arxml', format: 'json' },
    };
    const cap = captureStd();
    try {
      const code = await dispatchCommand(parsed);
      expect(code).toBe(1);
      const out = JSON.parse(cap.stdout.join('')) as { ok: false; error: { kind: string } };
      expect(out.ok).toBe(false);
      expect(out.error.kind).toBe('file-not-found');
    } finally {
      cap.restore();
    }
  }, 15_000);
});