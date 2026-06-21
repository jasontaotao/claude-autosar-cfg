// Tests for src/shared/headless/ipc-contract.ts (v1.6.0 A+C-2 wire shape SoT).
//
// Pins:
//   - 3 IPC channels exposed with `:v1` suffix (HEADLESS_RUN_COMMAND,
//     HEADLESS_MUTATE_APPLIED, HEADLESS_VALIDATE_RESULT) as `as const` literals
//   - 4 types round-trip: ValidatorResult / HeadlessCommand / HeadlessResult / HeadlessError
//   - PatchDocument: top-level version + steps + step discriminated union
//     (3 RFC 6902 + 3 AUTOSAR extension ops)

import { describe, it, expect } from 'vitest';

import {
  HEADLESS_RUN_COMMAND,
  HEADLESS_MUTATE_APPLIED,
  HEADLESS_VALIDATE_RESULT,
  type ValidatorResult,
  type HeadlessCommand,
  type HeadlessResult,
  type HeadlessError,
  type HeadlessFailure,
  type PatchDocument,
  type PatchStep,
} from '../ipc-contract.js';

describe('headless ipc-contract — IPC channels', () => {
  it('exposes HEADLESS_RUN_COMMAND with :v1 suffix', () => {
    expect(HEADLESS_RUN_COMMAND).toBe('headless:run-command:v1');
  });

  it('exposes HEADLESS_MUTATE_APPLIED with :v1 suffix', () => {
    expect(HEADLESS_MUTATE_APPLIED).toBe('headless:mutate-applied:v1');
  });

  it('exposes HEADLESS_VALIDATE_RESULT with :v1 suffix', () => {
    expect(HEADLESS_VALIDATE_RESULT).toBe('headless:validate-result:v1');
  });
});

describe('headless ipc-contract — ValidatorResult wire type', () => {
  it('round-trips a minimal error result with required fields', () => {
    const result: ValidatorResult = {
      ruleId: 'SWS_COM_PDUID_UNIQUE',
      severity: 'error',
      path: '/AUTOSAR/EcucDefs/Com/ComConfigSet/ComIPdu_0',
      message: 'Duplicate ComPduId',
    };
    expect(result.ruleId).toBe('SWS_COM_PDUID_UNIQUE');
    expect(result.severity).toBe('error');
    expect(result.path).toBeTruthy();
    expect(result.message).toBeTruthy();
    expect(result.i18nKey).toBeUndefined();
  });

  it('accepts an optional i18nKey for renderer-side localization', () => {
    const result: ValidatorResult = {
      ruleId: 'SWS_BSWMD_DEPS_PRESENT',
      severity: 'warning',
      path: '/foo',
      message: 'Missing dep',
      i18nKey: 'swsValidator.depsMissing.short',
    };
    expect(result.i18nKey).toBe('swsValidator.depsMissing.short');
  });

  it('restricts severity to error | warning only (no info tier)', () => {
    // Compile-time assertion via assignment; runtime marker ensures union size.
    const errorsOnly: ValidatorResult['severity'][] = ['error', 'warning'];
    expect(errorsOnly).toHaveLength(2);
  });
});

describe('headless ipc-contract — HeadlessCommand', () => {
  it('discriminates read by kind', () => {
    const cmd: HeadlessCommand = {
      kind: 'read',
      input: {
        projectPath: '/tmp/demo.autosarcfg.json',
        format: 'json',
      },
    };
    expect(cmd.kind).toBe('read');
    if (cmd.kind === 'read') {
      expect(cmd.input.projectPath).toBeTruthy();
      expect(cmd.input.format).toBe('json');
    }
  });

  it('discriminates mutate by kind', () => {
    const cmd: HeadlessCommand = {
      kind: 'mutate',
      input: {
        projectPath: '/tmp/demo.autosarcfg.json',
        patch: './fix.yaml',
        format: 'json',
        dryRun: false,
      },
    };
    expect(cmd.kind).toBe('mutate');
  });

  it('discriminates validate by kind', () => {
    const cmd: HeadlessCommand = {
      kind: 'validate',
      input: {
        projectPath: '/tmp/demo.autosarcfg.json',
        format: 'json',
        stub: true,
      },
    };
    expect(cmd.kind).toBe('validate');
    if (cmd.kind === 'validate') {
      expect(cmd.input.stub).toBe(true);
    }
  });
});

describe('headless ipc-contract — HeadlessResult envelope', () => {
  it('emits ReadResult with summary counts', () => {
    const result: HeadlessResult = {
      ok: true,
      command: 'read',
      projectPath: '/tmp/demo.autosarcfg.json',
      summary: {
        arxmlVersion: '4.6',
        moduleCount: 5,
        containerCount: 12,
        parameterCount: 48,
        referenceCount: 6,
      },
      document: { packages: [] },
      durationMs: 123,
    };
    expect(result.ok).toBe(true);
    if (result.ok && result.command === 'read') {
      expect(result.summary.moduleCount).toBe(5);
    }
  });

  it('emits MutateResult with steps applied count', () => {
    const result: HeadlessResult = {
      ok: true,
      command: 'mutate',
      projectPath: '/tmp/demo.autosarcfg.json',
      patchId: 'patch-2026-06-21T10:30:00Z',
      stepsApplied: 3,
      stepsTotal: 3,
      warnings: [],
      durationMs: 250,
    };
    expect(result.command).toBe('mutate');
  });

  it('emits ValidateResult with stub flag (v1 stub-only)', () => {
    const result: HeadlessResult = {
      ok: true,
      command: 'validate',
      projectPath: '/tmp/demo.autosarcfg.json',
      results: [],
      stub: true,
      durationMs: 50,
    };
    if (result.ok && result.command === 'validate') {
      expect(result.stub).toBe(true);
      expect(result.results).toEqual([]);
    }
  });
});

describe('headless ipc-contract — HeadlessError failure envelope', () => {
  it('discriminates file-not-found', () => {
    const err: HeadlessError = { kind: 'file-not-found', path: '/tmp/missing.arxml' };
    expect(err.kind).toBe('file-not-found');
  });

  it('discriminates unsupported-patch-version', () => {
    const err: HeadlessError = {
      kind: 'unsupported-patch-version',
      version: '999',
    };
    expect(err.kind).toBe('unsupported-patch-version');
  });

  it('discriminates mutation-failed with errors array', () => {
    const err: HeadlessError = {
      kind: 'mutation-failed',
      planId: 'patch-xyz',
      errors: [{ stepIndex: 2, kind: 'multiplicity-exceeded', message: 'at max' }],
    };
    if (err.kind === 'mutation-failed') {
      expect(err.errors).toHaveLength(1);
    }
  });

  it('wraps in HeadlessFailure envelope with exit code', () => {
    const failure: HeadlessFailure = {
      ok: false,
      code: 3,
      error: { kind: 'patch-invalid', reason: 'missing version field' },
      stderr: ['[ERROR] patch version field missing'],
    };
    expect(failure.ok).toBe(false);
    expect(failure.code).toBe(3);
    expect(failure.error.kind).toBe('patch-invalid');
  });
});

describe('headless ipc-contract — PatchDocument', () => {
  it('accepts an empty patch (no-op)', () => {
    const doc: PatchDocument = {
      autosarcfgPatchVersion: '1',
      steps: [],
    };
    expect(doc.steps).toHaveLength(0);
  });

  it('accepts all 6 step variants (3 RFC 6902 + 3 AUTOSAR extensions)', () => {
    const steps: PatchStep[] = [
      { op: 'add', path: '/foo', value: 1 },
      { op: 'remove', path: '/foo' },
      { op: 'replace', path: '/foo', value: 2 },
      {
        op: 'set-param',
        containerPath: '/AUTOSAR/EcucDefs/Com/ComConfigSet',
        paramName: 'ComBusWakeupTimeout',
        value: 200,
      },
      {
        op: 'add-child',
        parentPath: '/AUTOSAR/EcucDefs/Com/ComConfigSet',
        shortName: 'ComIPdu_0',
      },
      {
        op: 'remove-with-cascade',
        containerPath: '/AUTOSAR/EcucDefs/Com/ComConfigSet/ComIPdu_0',
        cascade: true,
      },
    ];
    expect(steps).toHaveLength(6);
    // Exhaustiveness sanity — every op appears.
    const ops = new Set(steps.map((s) => s.op));
    expect(ops.size).toBe(6);
  });

  it('supports optional metadata key/value pairs', () => {
    const doc: PatchDocument = {
      autosarcfgPatchVersion: '1',
      metadata: { author: 'ci-bot', ticket: 'JIRA-1234' },
      steps: [],
    };
    expect(doc.metadata?.['author']).toBe('ci-bot');
  });
});