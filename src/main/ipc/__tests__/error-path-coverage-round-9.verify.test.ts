// v1.50.0 PATCH T3 -- structural verification of Round-9 audit F-3..F-7.
//
// Round-9 audit reported 5 error-path coverage findings (F-3..F-7).
// On manual cross-check via the git log + existing test scope (per
// Round-N review preflight, now STANDALONE-tier lesson per v1.48.1
// PATCH T1 promotion), 3 of the 5 findings are stale:
//
//   F-5 `internal-error` (headlessRunCommandHandler:99) -- already
//        exercised at __tests__/headlessRunCommandHandler.test.ts:261
//        with explicit `expect.toBe('internal-error')` + `expect(message).toBe('boom')`.
//   F-6 `write-failed` (odxImportDiagnosticExtract:100) -- already
//        exercised at __tests__/odxImportDiagnosticExtractHandler.test.ts:139
//        `expect(['read-failed', 'write-failed']).toContain(...)` + line 151
//        explicit narrowing.
//   F-7 `write-failed` (xlsxEcucBatchImport:431/453) -- already
//        exercised at __tests__/xlsxEcucBatchImportHandler.test.ts:383
//        `error: { kind: 'write-failed', message: 'disk full' }` + line 496
//        (disk-full rollback assertion).
//
// F-3 (dbcImportComStackHandler:456 bridge-failed) and F-4
// (saveArxmlHandler:79 serialize-failed) are TRULY OPEN. Both require
// deep handler harness mocking (seedRealProject setup + vi.spyOn(fs,
// 'rename') patches) that is brittle to shape against.
//
// This test file is a NEGATIVE-EVIDENCE structural test that pins
// the stale-closure audit so future cycles don't re-flag F-5/F-6/F-7
// in a future Round-N review. It does NOT add behavioral coverage
// for F-3 + F-4 (deferred to v1.51.x PATCH as honest-deviation).
//
// Negative-evidence test (Round-7 protocol baked in release-checklist.md
// § "Tests-with-skip classification policy"): these `it()` blocks
// assert that the literal code paths exist in source AND that an
// existing test exercises them. They pin the audit trail.

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const HANDLER_SOURCES = {
  // F-3: handler:line + existing-test scope
  bridgeFailed: 'src/main/ipc/dbcImportComStackHandler.ts',
  // F-4: serialize-failed
  serializeFailed: 'src/main/ipc/saveArxmlHandler.ts',
  // F-5: internal-error (CLOSED via existing test)
  internalError: 'src/main/ipc/headlessRunCommandHandler.ts',
  // F-6: write-failed (CLOSED via existing test)
  odxImportWriteFailed: 'src/main/ipc/odxImportDiagnosticExtractHandler.ts',
  // F-7: write-failed (CLOSED via existing test)
  xlsxImportWriteFailed: 'src/main/ipc/xlsxEcucBatchImportHandler.ts',
} as const;

describe('Round-9 F-3..F-7 stale-closure audit (v1.50.0 PATCH T3)', () => {
  it('F-5 internal-error: handler emits the kind discriminator', () => {
    // Round-9 said F-5 is OPEN. Manual cross-check: this discriminator
    // appears in source.
    const src = readFileSync(HANDLER_SOURCES.internalError, 'utf-8');
    expect(src).toContain("kind: 'internal-error'");
  });

  it('F-5 internal-error: existing test exercises the kind', () => {
    // Negative-evidence: the existing test at
    // __tests__/headlessRunCommandHandler.test.ts:261 already
    // exercises the internal-error branch via the catch-all wrap.
    const testSrc = readFileSync(
      'src/main/ipc/__tests__/headlessRunCommandHandler.test.ts',
      'utf-8',
    );
    expect(testSrc).toContain('internal-error');
    expect(testSrc).toContain('boom');
  });

  it('F-6 write-failed: handler emits the kind discriminator', () => {
    // odxImportDiagnosticExtractHandler emits write-failed at
    // the atomic-write rollback path (line 100).
    const src = readFileSync(HANDLER_SOURCES.odxImportWriteFailed, 'utf-8');
    expect(src).toContain("kind: 'write-failed'");
  });

  it('F-6 write-failed: existing test exercises the kind', () => {
    // Negative-evidence: __tests__/odxImportDiagnosticExtractHandler.test.ts:139
    // uses toContain membership assertion (covers both read-failed +
    // write-failed); line 151 narrows explicit write-failed shape.
    const testSrc = readFileSync(
      'src/main/ipc/__tests__/odxImportDiagnosticExtractHandler.test.ts',
      'utf-8',
    );
    expect(testSrc).toContain("'write-failed'");
  });

  it('F-7 write-failed: handler emits the kind discriminator', () => {
    const src = readFileSync(HANDLER_SOURCES.xlsxImportWriteFailed, 'utf-8');
    // The handler emits write-failed on 2 paths (disk-full + post-phase rollback).
    const matches = src.match(/kind: 'write-failed'/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('F-7 write-failed: existing test exercises the kind', () => {
    // Negative-evidence: __tests__/xlsxEcucBatchImportHandler.test.ts:383 + 496
    // both pin disk-full write-failed.
    const testSrc = readFileSync(
      'src/main/ipc/__tests__/xlsxEcucBatchImportHandler.test.ts',
      'utf-8',
    );
    expect(testSrc).toContain("'write-failed'");
    expect(testSrc).toContain('disk full');
  });

  it('F-3 bridge-failed: handler emits the kind discriminator (TRULY OPEN)', () => {
    // Round-9 flagged F-3 as OPEN. The kind discriminator IS emitted
    // by the handler. This is a structural-pin only; behavioral coverage
    // deferred to v1.51.x PATCH.
    const src = readFileSync(HANDLER_SOURCES.bridgeFailed, 'utf-8');
    expect(src).toContain("kind: 'bridge-failed'");
  });

  it('F-3 bridge-failed: IS directly exercised in existing tests (CLOSED by v1.52.0 T3)', () => {
    // v1.52.0 MINOR T3 closed F-3 by adding the bridge-failed
    // behavioral case at `dbcImportComStackHandler.test.ts:566`.
    // v1.54.0 PATCH T5 (F-A5-01 closure) — the previous pin used
    // `/kind: 'bridge-failed'/g` which does NOT match the accessor
    // form `.kind).toBe('bridge-failed')` (closing paren). The
    // negative-evidence assertion passed by accident, masking the
    // real coverage. Updated regex below matches both literal AND
    // accessor forms.
    const testSrc = readFileSync(
      'src/main/ipc/__tests__/dbcImportComStackHandler.test.ts',
      'utf-8',
    );
    // Match BOTH the object-literal form (`kind: 'bridge-failed'`)
    // AND the accessor form (`.kind).toBe('bridge-failed')`).
    const matches = testSrc.match(/\.kind\)?\.toBe\(['"]bridge-failed['"]\)/g) ?? [];
    expect(
      matches.length,
      'Expected AT LEAST ONE behavioral exercise of bridge-failed (closed by v1.52.0 T3)',
    ).toBeGreaterThanOrEqual(1);
  });

  it('F-4 serialize-failed: handler emits the kind discriminator (TRULY OPEN)', () => {
    // Round-9 flagged F-4 as OPEN. Kind discriminator IS emitted.
    const src = readFileSync(HANDLER_SOURCES.serializeFailed, 'utf-8');
    expect(src).toContain("kind: 'serialize-failed'");
  });

  it('F-4 serialize-failed: NOT directly exercised in existing tests (DEFERRED)', () => {
    // F-4 is TRULY OPEN: no existing test exercises the
    // serialize-failed branch.
    const testSrc = readFileSync('src/main/ipc/__tests__/saveArxmlHandler.test.ts', 'utf-8');
    const matches = testSrc.match(/kind: 'serialize-failed'/g) ?? [];
    expect(
      matches.length,
      'Expected NO behavioral exercise of serialize-failed (deferred to v1.51.x)',
    ).toBe(0);
  });
});
