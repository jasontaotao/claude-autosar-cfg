// @ts-check
// v1.39.0 MINOR T1 — gcc -c regression catcher for generator output.
//
// Why this test exists (carries the rationale forward to future readers):
// the ECUC C code generator emits `CONST(${cType}, AUTOMATIC) ${cType}
// ${ident}` — i.e. the type token is duplicated inside the macro and
// again as the declaration specifier. The output is NOT valid C; any
// toolchain that compiles the generated source will fail with
// "two or more data types in declaration specifiers" (gcc) or
// equivalent.
//
// Previous coverage pinned the broken output via snapshot files
// (`testdata/generator/ecuc-expected/*/EcuC_Cfg.c` and the matching
// snapshot tests under `src/core/project/__tests__/`). A future "fix"
// therefore had to update both the generator AND the snapshots AND
// the snapshot test assertions. With no upstream semantic-correctness
// gate, a careless snapshot regenerate could re-pin the wrong text
// and silently re-introduce the bug.
//
// This test is the canonical defense: it does NOT compare the
// generated text against any snapshot. It asks the single question
// "does the generated source compile as valid C?". If the generator
// regresses to the broken template, this test fails loudly with the
// gcc error message — independent of whatever the snapshot tests say.
//
// Test shape (per CLAUDE.md + common/testing.md):
// - Skips cleanly when gcc is unavailable (Windows CI without
//   MSYS/MinGW, minimal container images). `skipIf` makes the skip
//   a no-result rather than a pass/fail so CI aggregate counts stay
//   honest.
// - Hard-coded `-Wall -Werror` so any future unused-variable or
//   implicit-declaration regression trips the gate.
// - One `it()` per available snapshot file so a partial regression
//   is pinpointed to the specific variant.
//
// File path resolution: this test runs from the repo root via
// `pnpm exec vitest run tests/e2e-vitest/__tests__/generator-c-compile.test.ts`,
// so `process.cwd()` is the project root and `__dirname` reliably
// walks up to it (`tests/e2e-vitest/__tests__/foo.ts` -> 3 levels up).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Platform / toolchain gating
// ---------------------------------------------------------------------------

/**
 * Returns true when a POSIX-style gcc is on PATH and responds to
 * `--version` with exit code 0. On Windows we still allow the test
 * to run if a gcc (MinGW / Cygwin / WSL-bridged) is reachable; the
 * pre-existing snapshots assume a hosted generator run, not a
 * Windows ECU toolchain.
 */
function hasGcc(): boolean {
  const probe = spawnSync('gcc', ['--version'], { stdio: 'ignore' });
  return probe.status === 0;
}

// ---------------------------------------------------------------------------
// Compile helper
// ---------------------------------------------------------------------------

interface CompileResult {
  readonly status: number;
  readonly stderr: string;
}

/**
 * Resolve the platform's null device for use as gcc's `-o` target.
 *
 * `os.devNull` (Node 22+) returns the Windows device-path form
 * `\\.\nul`, which is rejected by MinGW gcc with
 * "can't create \\.\nul: Invalid argument". gcc only accepts the
 * bare device name `NUL` (case-insensitive). On POSIX, `os.devNull`
 * is already the canonical `/dev/null` and is passed through as-is.
 */
function resolveGccNullDevice(): string {
  if (process.platform === 'win32') {
    return 'NUL';
  }
  return devNull;
}

/**
 * Compile a single C source file to the platform null device with
 * strict warnings. We use `os.devNull` (imported as `devNull`)
 * rather than the POSIX literal `/dev/null` so the test runs on
 * both POSIX (`/dev/null`) and Windows (the bare device name
 * `NUL`, since MinGW gcc rejects Node 22's `\\.\nul` device-path
 * form) without a skip gate.
 *
 * `includeDir` is prepended via `-I` so the C file's
 * `#include "EcuC/EcuC_Cfg.h"` resolves: the generator emits the
 * `EcuC/` prefix on the include path (see
 * `src/core/generator/modules/ecuc.ts:351`), so the compile env
 * needs `EcuC_Cfg.h` reachable as `<includeDir>/EcuC/EcuC_Cfg.h`.
 * The snapshot dir flattens both files at its root, so we mirror
 * the layout into a per-test temp dir (mkdtempSync under the OS
 * tmp dir) before invoking gcc.
 */
function compileC(cFile: string, includeDir: string): CompileResult {
  const result = spawnSync(
    'gcc',
    ['-c', cFile, '-o', resolveGccNullDevice(), '-Wall', '-Werror', `-I${includeDir}`],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return {
    status: result.status ?? -1,
    stderr: result.stderr?.toString() ?? '',
  };
}

// ---------------------------------------------------------------------------
// Snapshot enumeration
// ---------------------------------------------------------------------------

interface SnapshotCase {
  readonly label: string;
  /** Path relative to repo root. */
  readonly relPath: string;
  /** Path of the header (same dir as relPath, basename = EcuC_Cfg.h). */
  readonly headerRelPath: string;
}

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

// Snapshot files the test compiles. Excluded on purpose:
//   - Refs-1: its snapshot header includes `Os/Os_Cfg.h` and
//     declares an extern with an initializer (`extern CONST(...)
//     EcuC_EcuCGeneral_PartitionRef = &Os_OsCore_OsCore_0`).
//     Those two realities are independent of the C1 generator
//     template bug this gate guards against; keeping Refs-1 in
//     the list would conflate "fix the generator template" with
//     "fix snapshot header layout". PreCompile-1 + Mixed-1
//     already exercise both shapes the generator emits (a uint32
//     hash + uint8/uint32 params) without those complications.
const SNAPSHOTS: readonly SnapshotCase[] = [
  {
    label: 'PreCompile-1',
    relPath: 'testdata/generator/ecuc-expected/PreCompile-1/EcuC_Cfg.c',
    headerRelPath: 'testdata/generator/ecuc-expected/PreCompile-1/EcuC_Cfg.h',
  },
  {
    label: 'Mixed-1',
    relPath: 'testdata/generator/ecuc-expected/Mixed-1/EcuC_Cfg.c',
    headerRelPath: 'testdata/generator/ecuc-expected/Mixed-1/EcuC_Cfg.h',
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!hasGcc())(
  'v1.39.0 MINOR T1 — generator output is valid C (gcc -c -Wall -Werror)',
  () => {
    for (const tc of SNAPSHOTS) {
      it(`${tc.label}: ${tc.relPath} compiles cleanly`, () => {
        const cFile = resolve(REPO_ROOT, tc.relPath);
        const headerFile = resolve(REPO_ROOT, tc.headerRelPath);
        expect(existsSync(cFile), `snapshot C file missing: ${cFile}`).toBe(true);
        expect(existsSync(headerFile), `snapshot header missing: ${headerFile}`).toBe(true);

        // Mirror the generator's intended include layout into a
        // per-test temp dir: gcc needs `<tmp>/EcuC/EcuC_Cfg.h`
        // resolvable so the C file's `#include "EcuC/EcuC_Cfg.h"`
        // finds the header that ships next to the snapshot.
        const tmpRoot = mkdtempSync(join(tmpdir(), `claude-autosarcfg-gcc-${tc.label}-`));
        try {
          const mirrorDir = join(tmpRoot, 'EcuC');
          mkdirSync(mirrorDir, { recursive: true });
          const headerContent = readFileSync(headerFile, 'utf8');
          writeFileSync(join(mirrorDir, 'EcuC_Cfg.h'), headerContent, 'utf8');

          // The snapshot headers include `<Std_Types.h>` (AUTOSAR
          // standard type header) and the C files rely on `CONST`
          // + `AUTOMATIC` (AUTOSAR Compiler.h). The repo is a code
          // generator, not an ECU codebase, so no vendor headers
          // ship here. Drop minimal stubs at the include root so
          // the compile reaches the actual generated body — only
          // THEN does it surface the duplicated-type-token bug we
          // are guarding against.
          writeFileSync(join(tmpRoot, 'Std_Types.h'), STD_TYPES_STUB, 'utf8');
          writeFileSync(join(tmpRoot, 'Compiler.h'), COMPILER_STUB, 'utf8');

          const result = compileC(cFile, tmpRoot);
          expect(
            result.status,
            `gcc failed for ${tc.relPath}\n--- stderr ---\n${result.stderr}\n--- end ---`,
          ).toBe(0);
        } finally {
          rmSync(tmpRoot, { recursive: true, force: true });
        }
      });
    }
  },
);

// Minimal AUTOSAR Std_Types.h stub — just enough typedefs + macros
// for gcc to type-check the EcuC snapshot C files. The generator
// emits `CONST(uint8, AUTOMATIC)`, `CONST(uint32, AUTOMATIC)`,
// and uses `uint8`/`uint32` literals; nothing else from the
// AUTOSAR SWS types is referenced by the current snapshots.
//
// The stub pulls in our `Compiler.h` (defining `CONST` and
// `AUTOMATIC`) so the snapshot C files — which use `CONST(...)`
// without including Compiler.h themselves — find the macro.
// In real AUTOSAR projects Compiler.h is reached via the same
// transitive chain (Std_Types.h -> Platform_Types.h ->
// Compiler.h / Compiler_Cfg.h).
const STD_TYPES_STUB = `/* v1.39.0 MINOR T1 — minimal AUTOSAR Std_Types.h stub
 * generated at test time so gcc can reach the snapshot body. NOT a
 * vendor file: it is intentionally minimal so the regression
 * catcher asks only "is the generated C syntactically and
 * semantically valid C?" — it does NOT prove RTE integration. */
#ifndef STD_TYPES_H
#define STD_TYPES_H

#include "Compiler.h"

typedef unsigned char uint8;
typedef unsigned short uint16;
typedef unsigned int uint32;
typedef signed char sint8;
typedef signed short sint16;
typedef signed int sint32;

#ifndef TRUE
#define TRUE 1u
#endif
#ifndef FALSE
#define FALSE 0u
#endif

#endif /* STD_TYPES_H */
`;

// Minimal AUTOSAR Compiler.h stub — defines `CONST(type, memclass)`
// and `AUTOMATIC` so the generator-emitted
// `CONST(uint8, AUTOMATIC) uint8 <ident>` declarations type-check
// up to the duplicated-type-token defect. The macro expands
// identically to a plain `const <type>` qualifier so the bug
// surfaces as gcc's "two or more data types in declaration
// specifiers" on the next token rather than as an opaque
// "unknown type name 'AUTOMATIC'".
const COMPILER_STUB = `/* v1.39.0 MINOR T1 — minimal AUTOSAR Compiler.h stub
 * (NOT a vendor file). Expands CONST(type, memclass) to plain
 * 'const type' so the generator's declaration form reaches the
 * type-token check gcc performs after macro expansion. */
#ifndef COMPILER_H
#define COMPILER_H

#define CONST(type, memclass) const type
#define AUTOMATIC

#endif /* COMPILER_H */
`;
