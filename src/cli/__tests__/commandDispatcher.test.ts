// Command dispatcher tests (v1.6.0 A+C-3).
//
// Pins the read/mutate/validate dispatch and exit-code mapping.
//
// Note: tests use `tests/fixtures/arxml/Com_Com.arxml` (a value-side
// ARXML) as the read target. The dispatcher test deliberately exercises
// the happy path against a real fixture; missing-file tests use a
// non-existent path.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { dispatchCommand, HeadlessFailureError } from '../command-dispatcher.js';
import { parseCliArgs, type ParsedArgs } from '../commander.js';
import { EXIT_SUCCESS, EXIT_FATAL, EXIT_INVALID_INPUT, EXIT_WARNING } from '../exitCodes.js';

const COM_ARXML = 'D:/claude_proj2/claude-AutosarCfg/tests/fixtures/arxml/Com_Com.arxml';

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

describe('dispatchCommand — read path', () => {
  let cap: StdCapture;
  beforeEach(() => {
    cap = captureStd();
  });
  afterEach(() => {
    cap.restore();
  });

  it('emits a ReadResult envelope and exits 0 on a value-side ARXML fixture', async () => {
    const parsed: ParsedArgs = {
      kind: 'read',
      global: { projectPath: COM_ARXML, verbose: false, quiet: false, noColor: false },
      input: { projectPath: COM_ARXML, format: 'json' },
    };

    const code = await dispatchCommand(parsed);
    expect(code).toBe(EXIT_SUCCESS);
    const out = JSON.parse(cap.stdout.join('')) as {
      ok: boolean;
      command: string;
      summary: { moduleCount: number };
    };
    expect(out.ok).toBe(true);
    expect(out.command).toBe('read');
    expect(out.summary.moduleCount).toBeGreaterThanOrEqual(0);
  });

  it('exits 1 (fatal) when --project points at a missing file', async () => {
    const parsed: ParsedArgs = {
      kind: 'read',
      global: {
        projectPath: '/nonexistent/file.arxml',
        verbose: false,
        quiet: false,
        noColor: false,
      },
      input: { projectPath: '/nonexistent/file.arxml', format: 'json' },
    };

    const code = await dispatchCommand(parsed);
    expect(code).toBe(EXIT_FATAL);
    const out = JSON.parse(cap.stdout.join('')) as { ok: false; error: { kind: string } };
    expect(out.ok).toBe(false);
    expect(out.error.kind).toBe('file-not-found');
  });
});

describe('dispatchCommand — validate path (stub)', () => {
  let cap: StdCapture;
  beforeEach(() => {
    cap = captureStd();
  });
  afterEach(() => {
    cap.restore();
  });

  it('emits empty results + stub:true and exits 0', async () => {
    const parsed: ParsedArgs = {
      kind: 'validate',
      global: { projectPath: COM_ARXML, verbose: false, quiet: false, noColor: false },
      input: { projectPath: COM_ARXML, format: 'json', stub: true },
    };

    const code = await dispatchCommand(parsed);
    expect(code).toBe(EXIT_SUCCESS);
    const out = JSON.parse(cap.stdout.join('')) as {
      ok: boolean;
      command: string;
      stub: boolean;
      results: unknown[];
    };
    expect(out.ok).toBe(true);
    expect(out.command).toBe('validate');
    expect(out.stub).toBe(true);
    expect(out.results).toEqual([]);
  });
});

describe('dispatchCommand — generate path', () => {
  let cap: StdCapture;
  beforeEach(() => {
    cap = captureStd();
  });
  afterEach(() => {
    cap.restore();
  });

  it('routes ParsedArgs { kind: "generate" } through dispatchCommand via parseCliArgs (regression for missing sub-command wiring)', async () => {
    // Regression: pre-fix parseCliArgs would throw "Unhandled sub-command:
    // generate" before reaching dispatchCommand. The dispatcher side was
    // already wired (DispatchArgs widened at command-dispatcher.ts:39),
    // but no CLI invocation could reach it until commander.ts registered
    // the sub-command.
    const parsed = parseCliArgs([
      'node',
      'autosarcfg',
      'generate',
      '--project',
      COM_ARXML,
    ]);
    expect(parsed.kind).toBe('generate');
    const code = await dispatchCommand(parsed);
    // COM_ARXML is not a manifest, so the handler returns internal-error
    // (not file-not-found — the file exists) and the dispatcher exits 1.
    // Asserting error.kind === 'internal-error' pins the manifest-mode
    // loader short-circuit path: a regression that fell through to
    // existsSync would emit 'file-not-found' instead.
    expect(code).toBe(EXIT_FATAL);
    const out = JSON.parse(cap.stdout.join('')) as { ok: false; error: { kind: string } };
    expect(out.ok).toBe(false);
    expect(out.error.kind).toBe('internal-error');
  });
});

describe('dispatchCommand — mutate path', () => {
  let cap: StdCapture;
  beforeEach(() => {
    cap = captureStd();
  });
  afterEach(() => {
    cap.restore();
  });

  it('exits 1 (fatal) when patch file does not exist', async () => {
    const parsed: ParsedArgs = {
      kind: 'mutate',
      global: { projectPath: COM_ARXML, verbose: false, quiet: false, noColor: false },
      input: {
        projectPath: COM_ARXML,
        patch: '/nonexistent/patch.json',
        format: 'json',
        dryRun: false,
        strict: false,
        backup: true,
      },
    };

    const code = await dispatchCommand(parsed);
    expect(code).toBe(EXIT_FATAL);
  });

  it('exit code constants are exported', () => {
    expect(EXIT_SUCCESS).toBe(0);
    expect(EXIT_FATAL).toBe(1);
    expect(EXIT_WARNING).toBe(2);
    expect(EXIT_INVALID_INPUT).toBe(3);
  });
});

describe('HeadlessFailureError', () => {
  it('carries the HeadlessFailure envelope', () => {
    const failure = {
      ok: false as const,
      code: 1 as const,
      error: { kind: 'file-not-found' as const, path: '/x' },
      stderr: ['oops'],
    };
    try {
      throw new HeadlessFailureError(failure);
    } catch (err) {
      expect(err).toBeInstanceOf(HeadlessFailureError);
      if (err instanceof HeadlessFailureError) {
        expect(err.failure).toEqual(failure);
      }
    }
  });
});
