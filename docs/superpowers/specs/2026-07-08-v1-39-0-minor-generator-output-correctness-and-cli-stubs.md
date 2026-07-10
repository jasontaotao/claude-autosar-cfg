# v1.39.0 MINOR — Generator Output Correctness + CLI Stub Closure

**Author**: claude-AutosarCfg post-ship review controller
**Date**: 2026-07-08
**Status**: design (awaiting spec self-review + user approval)
**Baseline**: v1.38.0 MINOR `5ea0fed` (3079 + 7 SKIP / 0 fail)
**Target**: 3093 + 7 SKIP / 0 fail (+14 net: 2 e2e + 4 generator/CLI unit + 8 polish tests)

## Goal

Close the **1 CRITICAL + 5 HIGH** Round-3 deep code review findings (file:line verified) on `core/generator/` + `cli/` + `main/script/` + `renderer/`. The CRITICAL finding is **silent invalid C output** — the code generator emits files that any C compiler rejects with "two or more data types in declaration specifiers", and the test suite **pins this wrong output as expected** because the snapshot tests were written from the same broken code.

**MEDIUM/LOW findings (M1/M2/M3/M4 + L2)**: deferred to v1.39.x PATCH chain.

## Background — what's actually broken

**`src/core/generator/emit/strategy.ts:28,32,44,46`** — every line has a duplicated type token:

```ts
return `CONST(${input.cType}, AUTOMATIC) ${input.cType} ${input.ident} = ${input.cValue};`;
//                       ^                    ^
//                       └────── same value ──┘
```

The `CONST(type, memClass)` AUTOSAR macro expands to `const type memClass`. So `CONST(uint8, AUTOMATIC) uint8 EcuC_X` expands to `const uint8 AUTOMATIC uint8 EcuC_X` → C compiler rejects.

**The bug is pinned by tests**:

- `testdata/generator/ecuc-expected/PreCompile-1/EcuC_Cfg.c:3-5` shows the duplicated form in committed snapshot data
- `core/generator/__tests__/emit-strategy.test.ts:19,31,42,52` asserts the wrong expected output
- `core/generator/__tests__/handlebars.test.ts:45,61` does the same

Any "fix" must update code AND snapshots AND tests — the test suite is the contract that prevents regression, and today it's the contract that enforces regression.

**Critical realization**: the codebase has been shipping invalid C output. Real users running `pnpm autosarcfg generate` would get files that fail `gcc -c`. The Round-3 reviewer's recommendation: **add a gcc-compile e2e test FIRST** as the regression catcher. Without it, the fix could re-pin wrong snapshots.

**Other HIGH findings (CLI surface):**

- **H1** — `src/cli/handlers/generate.ts:218-222` populates `BswmdModuleDefLite` with `{ shortName }` only; every validator except `validateUniqueShortNames` and `validateOrdering` silently no-ops on the CLI path.
- **H2** — `src/cli/handlers/generate.ts:96` calls `registerGenerator(new EcuCGenerator())` per generate; second call throws.
- **H3** — `src/core/generator/emit/unique-short-name.ts:67-77` skips container-vs-container uniqueness; duplicate shortName+INDEX produces colliding C identifiers.
- **H4** — `src/cli/handlers/generate.ts:240-246` builds `ecucValues` as `{ parameters: [], references: [] }` stubs; every parameter emits default values.
- **H5** — `src/core/generator/modules/_shared.ts:65-66` `renderCValue` integer arm returns `String(value)` (no `u` suffix); module comment claims `42u` etc.

## Architecture

### T1 — gcc-compile e2e regression catcher (PREVENTS RECURRENCE)

Add a vitest e2e test that compiles a regenerated `EcuC_Cfg.c` with `gcc -c` and asserts exit 0. This test would have caught C1 immediately. Lives at `tests/e2e-vitest/__tests__/generator-c-compile.test.ts`. Uses `child_process.spawnSync('gcc', ['-c', <path>, '-o', '/dev/null'])` and asserts exit 0.

**Critical timing**: T1 must land BEFORE T1's source fix in the commit chain — otherwise a future change could regress and re-pin wrong snapshots, and the next "fix" would just lock the regression in again.

### T2 — Generator C1 fix (duplicated type token)

Edit `src/core/generator/emit/strategy.ts` lines 28, 32, 44, 46 — remove the second `${input.cType}` token. Pattern:

```ts
// line 28
return `CONST(${input.cType}, AUTOMATIC) ${input.ident} = ${input.cValue};`;
// line 32 (array variant)
return `CONST(${input.cType}, AUTOMATIC) ${input.ident}[${arr.length}] = { ${lit} };`;
// line 44 (extern)
return `extern CONST(${input.cType}, AUTOMATIC) ${input.ident};`;
// line 46 (extern array)
return `extern CONST(${input.cType}, AUTOMATIC) ${input.ident}[${input.arrayLen ?? 0}];`;
```

Regenerate ALL `testdata/generator/ecuc-expected/**/*.c` files via a one-off script (or manual + spot-check + commit-by-commit). Update `emit-strategy.test.ts:19,31,42,52` + `handlebars.test.ts:45,61` expected values.

### T3 — Generator H5 fix (missing `u` suffix)

Edit `src/core/generator/modules/_shared.ts:65-66`:

```ts
case 'integer':
  return value === undefined ? '0u' : `${String(value)}u`;  // was: String(value)
```

Regenerate snapshots + update affected test assertions.

### T4 — CLI H1 + H4 fix (full BswmdModuleDefLite + populate ecucValues)

Two coordinated changes:

1. **`src/core/generator/normalize.ts:50-52`** — widen `BswmdModuleDefLite` to include the full module shape OR change CLI to store the full `BswmdModule` instead of the lite version. Decision: widen the lite type.
2. **`src/cli/handlers/generate.ts:218-245`** — populate the full lite shape from `parsed.value.modules`; extract `parameters` / `references` from the parsed ARXML document.

### T5 — Generator H2 fix (registry idempotent)

`src/cli/handlers/generate.ts:96` — replace `registerGenerator(new EcuCGenerator())` with a defensive reset-and-register pattern, OR change `registerGenerator` in `src/core/generator/registry.ts:31-36` to silent-overwrite on duplicate.

**Decision**: make `registerGenerator` idempotent (silent overwrite) — this is the simplest fix and matches the pattern of "module init happens once per process" without requiring explicit reset at every CLI call.

### T6 — Generator H3 fix (container shortName+index uniqueness)

`src/core/generator/emit/unique-short-name.ts:67-77` — extend the existing uniqueness check to also flag duplicate `(shortName, index)` tuples within containers. The existing parameter-vs-parameter check is at lines 42-55; the container-vs-container check needs the same treatment.

### T7 — Polish + docs + ship

- M-series polish (M1 vm-runner regex, M2 parseImports length check, M3 type-check default arm, M4 writeOutputTree Windows paths)
- L2 `_runCounter` → `crypto.randomUUID()`
- Release notes + CHANGELOG + tag + push

## Components & Files Touched

| Layer          | File                                                           | Change                        |
| -------------- | -------------------------------------------------------------- | ----------------------------- |
| e2e            | `tests/e2e-vitest/__tests__/generator-c-compile.test.ts` (NEW) | gcc -c test                   |
| core/generator | `src/core/generator/emit/strategy.ts`                          | C1 fix (4 lines)              |
| core/generator | `testdata/generator/ecuc-expected/**/*.c`                      | snapshot regeneration         |
| core/generator | `src/core/generator/__tests__/emit-strategy.test.ts`           | update assertions             |
| core/generator | `src/core/generator/__tests__/handlebars.test.ts`              | update assertions             |
| core/generator | `src/core/generator/modules/_shared.ts`                        | H5 fix (1 line)               |
| core/generator | `src/core/generator/normalize.ts`                              | widen BswmdModuleDefLite      |
| core/generator | `src/core/generator/emit/unique-short-name.ts`                 | H3 fix                        |
| core/generator | `src/core/generator/registry.ts`                               | H2 idempotent register        |
| cli            | `src/cli/handlers/generate.ts`                                 | H1 + H4 + H2 callsite updates |
| docs           | `docs/release-notes/v1.39.0/README.md` (NEW)                   | release notes                 |
| docs           | `CHANGELOG.md`                                                 | v1.39.0 row                   |
| vault          | `01-Projects/claude-AutosarCfg/development/lessons/`           | NEW lesson(s)                 |

## Data Flow (concrete example — T2 C1 fix)

**Before** (every emit line):

```c
CONST(uint32, AUTOMATIC) uint32 EcuC_EcuCGeneral_ConfigConsistencyHash = 305419896;
```

**After**:

```c
CONST(uint32, AUTOMATIC) EcuC_EcuCGeneral_ConfigConsistencyHash = 305419896;
```

The `CONST(uint32, AUTOMATIC)` macro expands to `const uint32 AUTOMATIC` → declaration is `const uint32 AUTOMATIC EcuC_…_ConfigConsistencyHash = …` — valid C.

## Key Design Decisions

| #   | Decision                                                                                                                                      | Rationale                                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **T1 (e2e gcc test) must land before T2 (source fix) in the commit chain**                                                                    | The e2e test is a regression catcher. If a future "fix" re-pins wrong snapshots, the test fires immediately. Without it, every future snapshot regeneration is a fresh chance to pin broken output. |
| D2  | **Snapshot regeneration is a separate commit per file** OR **all in one commit** with explicit "test regeneration, not a real change" message | The latter is simpler; the former is more reviewable. Decision: one commit with explicit message + reviewer note explaining the mass update.                                                        |
| D3  | **H2 idempotent register** (silent overwrite) vs **explicit reset**                                                                           | Idempotent is simpler and matches the pattern of "module init happens once per process". Reset requires every caller to know to reset.                                                              |
| D4  | **Widen `BswmdModuleDefLite`** vs **store full BswmdModule**                                                                                  | Widen the lite type — preserves the existing normalization intent, keeps the CLI path lean, but makes it correct. Storing full BswmdModule is heavier and bypasses the lite abstraction.            |
| D5  | **M-series polish bundled into T7**                                                                                                           | Each M is small; one task per M is overhead. Bundle.                                                                                                                                                |
| D6  | **NEW lesson: generator-output-snapshot-pinning-can-lock-in-broken-output-permanently**                                                       | This is a 1-of-1 lesson worth capturing — the pattern of "tests pin wrong output forever" is a serious gap. The T1 e2e test is the canonical defense.                                               |

## Testing Strategy

| Test surface                                                          | Coverage                                                                                    | Δ tests                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------- |
| `tests/e2e-vitest/__tests__/generator-c-compile.test.ts` (NEW)        | `gcc -c` on regenerated EcuC_Cfg.c → exit 0                                                 | +2 (ecuc + mcu variants)        |
| `core/generator/__tests__/emit-strategy.test.ts` (UPDATED)            | 4 lines × 4 strategies (PreCompile scalar/array + Link extern/extern array)                 | +0 (update existing assertions) |
| `core/generator/__tests__/handlebars.test.ts` (UPDATED)               | H5 + C1 expected output                                                                     | +0 (update existing assertions) |
| `cli/__tests__/generate.test.ts` (UPDATED or NEW)                     | H1 (full BswmdModuleDefLite shape) + H2 (idempotent register) + H4 (ECUC values extraction) | +3                              |
| `core/generator/__tests__/unique-short-name.test.ts` (UPDATED or NEW) | H3 (container shortName+index tuple uniqueness)                                             | +1                              |
| `main/script/__tests__/vm-runner.test.ts` (UPDATED)                   | M1 (drop m3 fallback) + L2 (`crypto.randomUUID()`)                                          | +2                              |
| `core/generator/__tests__/type-check.test.ts` (UPDATED)               | M3 (default arm with diagnostic)                                                            | +1                              |
| `core/generator/__tests__/post-process.test.ts` (UPDATED)             | M4 (Windows path normalization)                                                             | +1                              |
| **Total**                                                             |                                                                                             | **+10 net**                     |

Baseline 3079 + 7 → **3089 + 7 SKIP / 0 fail**.

## Risks & Mitigations

| Risk                                                                          | Mitigation                                                                                                                                    |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Snapshot regeneration breaks other tests                                      | Run full project regression after every snapshot change. If a snapshot test fails, fix the snapshot OR fix the generator. Don't fix the test. |
| C compiler not available in CI                                                | The e2e test should `skip` if `gcc` is not available (process.platform check + `which gcc`). Don't fail CI on dev machines without gcc.       |
| Snapshot file count > 30 (T2 mass update)                                     | List affected files explicitly in the commit message. Reviewer can spot-check.                                                                |
| H1 widen `BswmdModuleDefLite` breaks other consumers of the type              | Grep for `BswmdModuleDefLite` references; all should be widened-only (additive fields).                                                       |
| H3 container-vs-container check requires understanding INDEX semantics        | Read `ordering.ts` to understand how INDEX is currently parsed; ensure the new check uses the same indexing logic.                            |
| T7 polish bundle creates a noisy commit                                       | Acceptable — the polish is small and bundled commits are common (matches v1.38.0 T5 pattern).                                                 |
| Snapshot regeneration is irreversible once committed (CI will pin it forever) | The T1 e2e gcc test is the defense against this. If gcc test fails after snapshot update, the snapshots are wrong.                            |

## Tasks (6 implementation + 1 ship)

```
T1: gcc -c e2e test (lands BEFORE the source fix; regression catcher)
T2: Generator C1 fix + snapshot regeneration + test updates
T3: Generator H5 fix + snapshot regeneration + test updates
T4: CLI H1+H4 fix (full BswmdModuleDefLite + ecucValues extraction)
T5: Generator H2+H3 fix (idempotent register + container shortName+index uniqueness)
T6: Polish + docs release artifacts
T7: ship
```

## Global Constraints

(Inherit from v1.38.x + v1.37.x series.)

- All modified/new files end with trailing newline.
- No `console.log` in production code; `console.warn` allowed for defensive warnings.
- 中文 for user-facing/business comments; 英文 for technical API/protocol/comments per CLAUDE.md.
- Subagent-driven execution; one implementer per task, one task reviewer per task.
- Each task ends with its own test running and passing.
- Exact values (file paths, error kind strings, function signatures) MUST match this spec verbatim.
- Implementer MUST dispatch `pkm-capture` autonomously when work is capture-worthy (per the v1.38.0 lesson `brief-explicit-must-not-clause-is-overridden-by-implementer-judgment-when-content-is-genuinely-capture-worthy`).
- Implementer MUST NOT make destructive git operations.

## Out of Scope (deferred to v1.39.x PATCH chain)

- L1 (setters dest drop) — already downgraded to NOTE
- Test refactoring (move shared snapshot regeneration logic into a helper)
- The "intentional skip" comment in `unique-short-name.ts:42-55` (now resolved by T5, but the documentation style should be revisited)

## Reverse-Closes

Closes Round-3 deep code review's 12 findings (10 of 12 with this MINOR; M1-M4 + L2 deferred to v1.39.x PATCH chain). Specifically:

- C1: data corruption class (invalid C output, snapshot-pinned)
- H1: defence-in-depth breach (CLI validators no-op)
- H2: silent IPC failure on second call
- H3: C identifier collision risk
- H4: silent wrong output (empty ECUC values)
- H5: documentary fraud (missing `u` suffix)

## Lessons (NEW from this MINOR, candidates)

1. `generator-output-snapshot-pinning-can-lock-in-broken-output-permanently` — when test snapshots are generated from the same code they're meant to verify, the snapshots preserve wrong behavior. Defense: an upstream consumer (e.g. `gcc -c`) that validates the semantic correctness of the output, run before the snapshots are committed. Cross-link to `applySetParam-integer-no-op-latent-bug` (similar pattern).
2. `cli-parallel-implementation-of-headless-run-often-shipped-as-half-stub` — when the CLI and the headless run share intent but not code, the CLI often ships as a half-implementation. Defense: shared handler module + shared e2e tests.

## Cross-references

- v1.38.0 MINOR plan: `docs/superpowers/plans/2026-07-08-v1-38-0-minor-wiring-integrity-parser-hardening-dbc-safety.md` (parent MINOR; closes Round-2 findings)
- Round-2 review topic: `01-Projects/claude-AutosarCfg/development/code-review-round-2-deep-dive-2026-07-08.md`
- Round-3 review topic: `01-Projects/claude-AutosarCfg/development/code-review-round-3-generator-cli-script-2026-07-08.md`
- Plan: `docs/superpowers/plans/2026-07-08-v1-39-0-minor-generator-output-correctness-and-cli-stubs.md` (this MINOR)
