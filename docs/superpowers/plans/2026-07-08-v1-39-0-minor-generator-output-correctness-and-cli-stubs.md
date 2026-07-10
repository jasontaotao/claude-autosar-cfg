# v1.39.0 MINOR Implementation Plan — Generator Output Correctness + CLI Stub Closure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 1 CRITICAL + 5 HIGH + 4 MEDIUM/LOW findings from the Round-3 deep code review. CRITICAL: code generator emits syntactically invalid C output pinned by test snapshots. HIGH: CLI manifest path drops BSWMD data, registerGenerator isn't idempotent, container shortName+index uniqueness gap, ECUC values are empty stubs, missing `u` suffix on integer literals.

**Architecture:** Six surgical fixes. T1 lands an upstream gcc -c e2e regression catcher BEFORE the source fix (so future "snapshot pinning wrong output" cannot recur). T2-T5 fix the generator/CLI bugs. T6 polish + docs. T7 ship.

**Tech Stack:** Electron + TypeScript 5.6 + React 19 + vitest 3 + jsdom 30+. Pure TypeScript core; gcc for the e2e test.

**Baseline:** v1.38.0 MINOR `5ea0fed` (3079 + 7 SKIP / 0 fail)
**Target:** 3093 + 7 SKIP / 0 fail (+14 net)

## Global Constraints

- All modified/new files end with trailing newline.
- No `console.log` in production code; `console.warn` allowed for defensive warnings.
- 中文 for user-facing/business comments; 英文 for technical API/protocol/comments per CLAUDE.md.
- Subagent-driven execution; one implementer per task, one task reviewer per task.
- Each task ends with its own test running and passing.
- Test additions must include the covering test command and pass locally before commit.
- Exact values (file paths, error kind strings, function signatures) MUST match this plan verbatim.
- Implementer MUST dispatch `pkm-capture` autonomously when work is capture-worthy (per v1.38.0 lesson `brief-explicit-must-not-clause-is-overridden-by-implementer-judgment-when-content-is-genuinely-capture-worthy`).
- Implementer MUST NOT make destructive git operations (`reset --hard`, `push --force`) on `origin/main`.

---

## Task 1: gcc -c e2e regression catcher (BEFORE the source fix)

### Files

- Create: `tests/e2e-vitest/__tests__/generator-c-compile.test.ts` (NEW)

### Interfaces

**Consumes:**

- Existing snapshot files in `testdata/generator/ecuc-expected/**/*.c` (will be regenerated in T2; for now they have the BUG)

**Produces:**

```ts
// gcc -c test that compiles the regenerated EcuC_Cfg.c and asserts exit 0
test('regenerated EcuC_Cfg.c compiles with gcc -c', () => {
  if (!hasGcc()) return; // skip if gcc not available
  const cFile = resolveFixture('testdata/generator/ecuc-expected/PreCompile-1/EcuC_Cfg.c');
  const result = spawnSync('gcc', ['-c', cFile, '-o', '/dev/null', '-Wall', '-Werror']);
  expect(result.status).toBe(0);
  expect(result.stderr.toString()).toBe('');
});
```

### Why this is T1

The CRITICAL bug is pinned by test snapshots. Any fix must update snapshots AND code. Without an upstream semantic-correctness test, future "fixes" can re-pin wrong snapshots. The e2e gcc test fires when the generated C is invalid — independent of the snapshot.

This MUST land BEFORE T2 (the source fix). The commit chain: T1 (test) → T2 (source fix + snapshot regen). T1's test should FAIL today (because the broken EcuC_Cfg.c doesn't compile). T2's fix makes T1 PASS.

### Steps

#### Step 1.1: Read the existing snapshot structure

```bash
ls testdata/generator/ecuc-expected/ | head -20
find testdata/generator/ecuc-expected/ -name "*.c" | head -10
```

The snapshot files are organized by strategy variant (PreCompile-1, Link, etc.). Pick 1-2 representative files for the e2e test.

#### Step 1.2: Write the failing e2e test

Create `tests/e2e-vitest/__tests__/generator-c-compile.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

function hasGcc(): boolean {
  if (process.platform === 'win32') return false; // skip on Windows
  const probe = spawnSync('gcc', ['--version'], { stdio: 'ignore' });
  return probe.status === 0;
}

function compileC(cFile: string): { status: number; stderr: string } {
  const result = spawnSync('gcc', ['-c', cFile, '-o', '/dev/null', '-Wall', '-Werror'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status ?? -1,
    stderr: result.stderr?.toString() ?? '',
  };
}

const REPO_ROOT = resolve(__dirname, '../../..');

describe.skipIf(!hasGcc())('v1.39.0 MINOR T1 — generator output is valid C', () => {
  test('EcuC_Cfg.c (PreCompile variant) compiles with gcc -Wall -Werror', () => {
    const cFile = resolve(REPO_ROOT, 'testdata/generator/ecuc-expected/PreCompile-1/EcuC_Cfg.c');
    expect(existsSync(cFile)).toBe(true);
    const result = compileC(cFile);
    expect(result.status, `gcc failed with stderr: ${result.stderr}`).toBe(0);
  });

  test('Mcu_Cfg.c (PreCompile variant) compiles with gcc -Wall -Werror', () => {
    const cFile = resolve(REPO_ROOT, 'testdata/generator/ecuc-expected/Mcu-PreCompile/Mcu_Cfg.c');
    expect(existsSync(cFile)).toBe(true);
    const result = compileC(cFile);
    expect(result.status, `gcc failed with stderr: ${result.stderr}`).toBe(0);
  });
});
```

#### Step 1.3: Run the test — expect FAILURE (RED)

```bash
pnpm exec vitest run tests/e2e-vitest/__tests__/generator-c-compile.test.ts
```

Expected: 2 tests FAIL. The current `EcuC_Cfg.c` has the duplicated `uint32 uint32` form, gcc rejects with "two or more data types in declaration specifiers" or similar. The stderr will show the compiler error.

If gcc isn't available, the test is `skipIf`-ed, and the assertion never runs. This is intentional — don't fail CI on dev machines without gcc.

If the test passes already, STOP — the snapshot was already correct.

#### Step 1.4: Commit the failing test

```bash
git add tests/e2e-vitest/__tests__/generator-c-compile.test.ts
git commit -m "test(e2e): v1.39.0 MINOR T1 — gcc compile regression catcher for generator output

Adds a vitest e2e test that compiles the regenerated
EcuC_Cfg.c / Mcu_Cfg.c snapshots with gcc -c -Wall -Werror
and asserts exit 0. Currently FAILS because the
generator emits invalid C (duplicated type token
in CONST() macro calls; see v1.39.0 MINOR spec).

This is the regression catcher for the C1 finding in
the Round-3 deep code review: test snapshots that were
generated from the same code they're meant to verify
can lock in wrong output forever. The gcc compile test
fires whenever the generated C is semantically invalid,
independent of snapshot assertions.

T2 (the source fix + snapshot regeneration) will make
this test PASS."
```

The T1 commit lands on `main` BEFORE T2.

---

## Task 2: Generator C1 fix — duplicated type token

### Files

- Modify: `src/core/generator/emit/strategy.ts` (lines 28, 32, 44, 46)
- Modify: `testdata/generator/ecuc-expected/**/*.c` (snapshot regeneration — likely 30+ files)
- Modify: `src/core/generator/__tests__/emit-strategy.test.ts` (assertion updates)
- Modify: `src/core/generator/__tests__/handlebars.test.ts` (assertion updates)

### Why this is C1

The generator emits `CONST(${input.cType}, AUTOMATIC) ${input.cType} ${input.ident}` — the type appears TWICE. C compiler rejects. The fix: remove the second occurrence.

### Steps

#### Step 2.1: Read strategy.ts current state

Read `src/core/generator/emit/strategy.ts:1-80` to confirm the current code shape matches the review (lines 28, 32, 44, 46).

#### Step 2.2: Write the source fix

Edit the 4 emit lines:

```ts
// Before line 28
return `CONST(${input.cType}, AUTOMATIC) ${input.cType} ${input.ident} = ${input.cValue};`;
// After
return `CONST(${input.cType}, AUTOMATIC) ${input.ident} = ${input.cValue};`;

// Before line 32
return `CONST(${input.cType}, AUTOMATIC) ${input.cType} ${input.ident}[${arr.length}] = { ${lit} };`;
// After
return `CONST(${input.cType}, AUTOMATIC) ${input.ident}[${arr.length}] = { ${lit} };`;

// Before line 44
return `extern CONST(${input.cType}, AUTOMATIC) ${input.cType} ${input.ident};`;
// After
return `extern CONST(${input.cType}, AUTOMATIC) ${input.ident};`;

// Before line 46
return `extern CONST(${input.cType}, AUTOMATIC) ${input.cType} ${input.ident}[${input.arrayLen ?? 0}];`;
// After
return `extern CONST(${input.cType}, AUTOMATIC) ${input.ident}[${input.arrayLen ?? 0}];`;
```

#### Step 2.3: Regenerate ALL snapshot files

The exact regeneration process depends on the codebase — typically:

1. Find the generator's CLI invocation (likely `pnpm autosarcfg generate --project <fixture> --output <tmp>`)
2. Run for each fixture in `testdata/generator/`
3. Replace the existing snapshot files in `testdata/generator/ecuc-expected/`

If the regeneration process isn't obvious, search for the snapshot-generation logic in the codebase (likely a test helper or a script). Read it.

Alternatively: if the snapshot files are too numerous to regenerate one-by-one, run the affected unit tests with `--update-snapshots` flag (if vitest supports it). Verify the snapshot format before relying on this.

#### Step 2.4: Update affected test assertions

- `src/core/generator/__tests__/emit-strategy.test.ts:19,31,42,52` — update expected strings
- `src/core/generator/__tests__/handlebars.test.ts:45,61` — update expected strings

Find these assertions via grep + update.

#### Step 2.5: Run tests

```bash
pnpm exec vitest run tests/e2e-vitest/__tests__/generator-c-compile.test.ts  # T1 should now PASS
pnpm exec vitest run src/core/generator/__tests__/  # generator unit tests
pnpm exec vitest run 2>&1 | tail -5  # full regression
pnpm exec tsc --noEmit -p tsconfig.json
pnpm exec tsc --noEmit -p tsconfig.web.json
```

Expected:

- T1 (gcc compile) now PASSES (the C is now valid)
- Generator unit tests PASS
- Full regression: 3079 → 3079 (no test count change yet; just T1's 2 tests pass and T2 added 0 new)
- tsc clean

#### Step 2.6: Commit

```bash
git add src/core/generator/emit/strategy.ts
git add testdata/generator/ecuc-expected/
git add src/core/generator/__tests__/emit-strategy.test.ts
git add src/core/generator/__tests__/handlebars.test.ts
git commit -m "fix(generator): v1.39.0 MINOR T2 (C1) — remove duplicated type token from emit

The CONST() macro expands to 'const <type> <memClass>'.
Pre-fix emit added a redundant <type> between the
memClass and the identifier name, producing
'const uint8 AUTOMATIC uint8 EcuC_X' which C
compilers reject with 'error: two or more data types
in declaration specifiers'.

C1 (Round-3 deep code review) — silent invalid C
output. The generator has been shipping broken
*_Cfg.c files since the strategy module was written.
Snapshot tests pinned the broken output as expected.

Removes the second \${input.cType} token from the
4 emit lines (lines 28, 32, 44, 46). Regenerates
~30 snapshot files in testdata/generator/ecuc-expected/.
Updates 2 unit test files with the corrected expected
strings. T1's gcc -c e2e test (committed just before this
commit) now passes."
```

---

## Task 3: Generator H5 fix — missing `u` suffix

### Files

- Modify: `src/core/generator/modules/_shared.ts:65-66` (`renderCValue` integer arm)
- Modify: `testdata/generator/ecuc-expected/**/*.c` (snapshot regeneration for `u` suffix)
- Modify: relevant test assertions (where?)

### Why this is H5

The module header comment claims EcuC and Mcu emit `42u` for integer-valued constants. The integer arm of `renderCValue` returns `String(value)` → `"42"` (no `u`). When `cType` is `uint32`, C compiler warns "implicit conversion changes signedness". Strict mode may warn-as-error.

### Steps

#### Step 3.1: Read `_shared.ts:50-100`

Confirm the current shape of `renderCValue`.

#### Step 3.2: Apply the fix

```ts
case 'integer':
  return value === undefined ? '0u' : `${String(value)}u`;
```

#### Step 3.3: Regenerate snapshots + update test assertions

Same approach as T2.3-T2.4.

#### Step 3.4: Run tests

```bash
pnpm exec vitest run tests/e2e-vitest/__tests__/generator-c-compile.test.ts  # still PASSES (with -u suffix gcc happy)
pnpm exec vitest run src/core/generator/__tests__/
pnpm exec vitest run 2>&1 | tail -5
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: still 3079 (no new tests, just snapshot updates).

#### Step 3.5: Commit

```bash
git commit -m "fix(generator): v1.39.0 MINOR T3 (H5) — append u suffix to integer literal

Module header comment at _shared.ts:9-13 claims:
'EcuC and Mcu both emit 0u / 1u / 42u for integer-valued
constants'. But the integer arm returned String(value)
→ '42' (no u). When cType is uint32 and value literal is
signed int, C compiler issues 'implicit conversion
changes signedness' warning. C99 strict mode may
warn-as-error this.

H5 (Round-3) — same documentary-fraud pattern that
v1.37.0 lesson 'api-comment-vs-implementation-divergence-
is-a-symptom-of-an-api-gap' warns about.

Appends 'u' suffix to the integer arm. Regenerates
~30 snapshot files. Updated test assertions."
```

---

## Task 4: CLI H1 + H4 fix — full BswmdModuleDefLite + populate ecucValues

### Files

- Modify: `src/core/generator/normalize.ts:50-52` (widen `BswmdModuleDefLite`)
- Modify: `src/cli/handlers/generate.ts:218-245` (populate full lite shape + extract ECUC values)
- Test: `src/cli/handlers/__tests__/generate.test.ts` (NEW if doesn't exist; or UPDATE)

### Why H1 + H4 together

Both fixes are in the same file + both depend on understanding the manifest→BSWMD→ECUC values pipeline. Bundling keeps the implementer in one context.

### Steps

#### Step 4.1: Read current code

Read:

- `src/core/generator/normalize.ts:30-80` — current `BswmdModuleDefLite` definition + how it's populated
- `src/cli/handlers/generate.ts:200-260` — current CLI loader

#### Step 4.2: Widen `BswmdModuleDefLite`

```ts
// Before
export interface BswmdModuleDefLite {
  readonly shortName: string;
}

// After — add the fields validators actually need
export interface BswmdModuleDefLite {
  readonly shortName: string;
  readonly containers: readonly ContainerDef[];
  readonly parameters: readonly ParamDef[];
  readonly references: readonly ReferenceDef[];
  readonly moduleHeader?: string | undefined;
  readonly includes: readonly string[];
}
```

#### Step 4.3: Populate the full lite shape in CLI

Edit `src/cli/handlers/generate.ts:218-225`:

```ts
for (const mod of parsed.value.modules) {
  bswmdIndex.set(mod.shortName, {
    shortName: mod.shortName,
    containers: mod.containers ?? [],
    parameters: mod.parameters ?? [],
    references: mod.references ?? [],
    moduleHeader: mod.moduleHeader,
    includes: mod.includes ?? [],
  });
}
```

#### Step 4.4: Extract ECUC values from parsed ARXML

Edit `src/cli/handlers/generate.ts:240-260` — replace the stub construction with a real walk:

```ts
const ecucValues = new Map<
  string,
  { parameters: readonly EcucParamValue[]; references: readonly EcucRefValue[] }
>();
// ... for each module in the project, parse its ArxmlDocument and extract:
//   - <ECUC-MODULE-CONFIGURATION-VALUES> → module's container tree
//   - <ECUC-NUMERICAL-PARAM-VALUE> entries → parameters[]
//   - <ECUC-REFERENCE-VALUE> entries → references[]
// Use the existing extractModuleShortName + a sibling helper to walk the ECUC value tree.
```

#### Step 4.5: Write 3 NEW tests in `cli/handlers/__tests__/generate.test.ts`

- **Test 1:** CLI loads a manifest → BswmdModuleDefLite contains containers/parameters/references (full shape).
- **Test 2:** CLI populates ecucValues from parsed ARXML (not empty stubs).
- **Test 3:** Multiplicity validator fires on a manifest with bad BSWMD multiplicity (was no-op pre-fix).

#### Step 4.6: Run tests

```bash
pnpm exec vitest run src/cli/handlers/__tests__/generate.test.ts
pnpm exec vitest run 2>&1 | tail -5
pnpm exec tsc --noEmit -p tsconfig.json
pnpm exec tsc --noEmit -p tsconfig.web.json
```

Expected: 3079 → 3082 (+3 new tests).

#### Step 4.7: Commit

```bash
git commit -m "fix(cli): v1.39.0 MINOR T4 (H1 + H4) — full BswmdModuleDefLite + populated ecucValues

H1 (Round-3) — CLI manifest path populated BswmdModuleDefLite
with only shortName. Every Stage-1 validator except
validateUniqueShortNames + validateOrdering silently
no-op'd on the CLI path. Defence-in-depth breach.

H4 (Round-3) — CLI ecucValues was built as { parameters: [],
references: [] } stubs. The generator ran against an empty
values map; every parameter emitted with its default.
Silent wrong output.

Widens BswmdModuleDefLite to include containers,
parameters, references, moduleHeader, includes (matches
the shape validators expect). Populates the full lite
shape in generate.ts:218-222. Extracts ecucValues from
parsed ARXML instead of stubbing.

+3 tests: full lite shape; populated ecucValues;
multiplicity validator fires on bad BSWMD.
tsc clean."
```

---

## Task 5: Generator H2 + H3 fix — idempotent register + container shortName+index uniqueness

### Files

- Modify: `src/core/generator/registry.ts:31-36` (silent overwrite on duplicate)
- Modify: `src/core/generator/emit/unique-short-name.ts:67-77` (add container shortName+index tuple uniqueness)
- Test: `src/core/generator/__tests__/unique-short-name.test.ts` (UPDATE if exists; NEW otherwise)

### Steps

#### Step 5.1: H2 idempotent register

Edit `src/core/generator/registry.ts:31-36`:

```ts
// Before
if (generators.has(g.moduleShortName)) {
  throw new Error(`Generator for ${g.moduleShortName} already registered`);
}

// After — idempotent: silent overwrite
if (generators.has(g.moduleShortName)) {
  generators.delete(g.moduleShortName);
}
generators.set(g.moduleShortName, g);
```

#### Step 5.2: H3 container shortName+index tuple uniqueness

Edit `src/core/generator/emit/unique-short-name.ts:67-77`:

```ts
// Extend the existing check to also flag duplicate (shortName, index) tuples within containers.
// Existing parameter check at lines 42-55 is the pattern to follow.
// Container uniqueness: group by shortName, within each group flag duplicate INDEX values.
// (Or document the gap loudly if the decision is to NOT add this check at this scope.)
```

Read `ordering.ts` first to understand how INDEX is currently parsed (so the new check uses the same parsing).

#### Step 5.3: Write 2 NEW tests

- **Test 1 (H2):** Calling `registerGenerator(EcuC)` twice does not throw.
- **Test 2 (H3):** `validateUniqueShortNames` flags duplicate container shortName+index tuples.

#### Step 5.4: Run tests + commit

```bash
pnpm exec vitest run src/core/generator/__tests__/unique-short-name.test.ts
pnpm exec vitest run 2>&1 | tail -5
pnpm exec tsc --noEmit -p tsconfig.json
pnpm exec tsc --noEmit -p tsconfig.web.json
```

Expected: 3082 → 3084 (+2 new tests).

```bash
git commit -m "fix(generator): v1.39.0 MINOR T5 (H2 + H3) — idempotent register + container shortName+index uniqueness

H2 (Round-3) — registerGenerator threw on duplicate.
Second 'generate' call from renderer/GUI crashed. Tests
masked via _resetRegistryForTest(); production didn't.
Renderer's Generate button failed on every 2nd click.

H3 (Round-3) — validateUniqueShortNames intentionally
skipped container-vs-container uniqueness. Two
containers with same shortName+INDEX produced colliding
C identifiers → link error. validateOrdering is NOT a
substitute (allows [1,1,2]).

registerGenerator now silently overwrites on duplicate
(idempotent pattern). unique-short-name.ts:67-77
extended to flag duplicate (shortName, index) tuples
within containers.

+2 tests: idempotent register; duplicate shortName+index
flagged by validator.
tsc clean."
```

---

## Task 6: Polish + docs release artifacts

### Files

- Modify: `src/main/script/vm-runner.ts:248-251` (drop m3 fallback or restrict to .js)
- Modify: `src/main/script/import-resolver.ts:99-129` (replace length check or drop)
- Modify: `src/core/generator/emit/type-check.ts:39-58` (add default arm)
- Modify: `src/core/generator/post-process.ts:64-67` (Windows path normalization)
- Modify: `src/main/script/vm-runner.ts:59-63` (`_runCounter` → `crypto.randomUUID()`)
- Modify: `docs/release-notes/v1.39.0/README.md` (NEW)
- Modify: `CHANGELOG.md` (v1.39.0 row)
- Modify: `.git/sdd/progress-v1.39.0.md` (NEW)
- Test: relevant test files (5 NEW tests — one per fix)

### Steps

#### Step 6.1: Apply 5 polish fixes

Read each file first to confirm shape, then apply. Keep each fix minimal-diff.

#### Step 6.2: Write 5 NEW tests

- **Test M1:** vm-runner parseStackLocation rejects Node-internal frame patterns
- **Test M2:** import-resolver parseImports validates target identity (not just count)
- **Test M3:** type-check validateTypeMatches handles unknown kind with explicit diagnostic
- **Test M4:** post-process writeOutputTree handles Windows mixed-separator paths (or skip on Windows)
- **Test L2:** vm-runner nextRunId uses crypto.randomUUID() format

#### Step 6.3: Run tests + prettier + pnpm verify

```bash
pnpm exec vitest run 2>&1 | tail -5  # expect 3089 (+5)
pnpm exec prettier --write ...  # auto-format if drift
pnpm exec tsc --noEmit -p tsconfig.json
pnpm verify  # 7-stage GREEN
```

#### Step 6.4: Write release-notes README

Mirror v1.38.0 README format. Cover:

- Title: "v1.39.0 MINOR — Generator Output Correctness + CLI Stub Closure"
- Ship: 2026-07-08 (TAG PENDING — T7 fills)
- Baseline: v1.38.0 MINOR `5ea0fed` (3079 + 7 SKIP / 0 fail)
- Target: 3093 + 7 SKIP / 0 fail (+14 net: 2 e2e + 4 generator/CLI + 8 polish; spec's planned +14 was wrong — actual is +10 + 4 e2e)
- Sections per finding closed (C1 + H1 + H2 + H3 + H4 + H5 + M1/M2/M3/M4 + L2) with file:line citations
- Critical callout: T1's gcc -c e2e test is the regression catcher for "snapshot pinning wrong output"
- NEW lessons (2 candidates from spec §Lessons)

#### Step 6.5: Update CHANGELOG

Add v1.39.0 MINOR row above v1.38.0 (newest first), with one-liner per finding + commit SHAs + test delta + T1 regression-catcher note.

#### Step 6.6: Commit release artifacts

```bash
git add docs/release-notes/v1.39.0/README.md CHANGELOG.md
git commit -m "docs(release): v1.39.0 MINOR T6 — release notes + CHANGELOG + polish"
```

Plus a separate `chore(format)` commit if prettier drift exists.

Do NOT commit the progress ledger file (local working artifact).

---

## Task 7: ship v1.39.0 MINOR

### Steps

#### Step 7.1: Pre-ship sanity check

```bash
git status  # clean tree
git log --oneline origin/main..HEAD  # exactly 6 commits (T1-T6) + chore(format) if needed
pnpm verify  # 7-stage GREEN
```

#### Step 7.2: Push commits to origin/main

```bash
git push origin main
```

If blocked: `git pull --rebase origin main` (per v1.37.1 recovery pattern) then retry. If still blocked: Tier 3 fallback.

#### Step 7.3: Create tag

```bash
git tag -a v1.39.0 -m "v1.39.0 MINOR — Generator output correctness + CLI stub closure"
git push origin v1.39.0
```

If push blocked, use `gh api` (per v1.37.0 recovery pattern).

#### Step 7.4: Create GH release

```bash
gh release create v1.39.0 \
  --title "v1.39.0 MINOR" \
  --notes-file docs/release-notes/v1.39.0/README.md
```

#### Step 7.5: Verify + finalize

```bash
gh release view v1.39.0 --json tagName,publishedAt,url
```

Append to `.git/sdd/progress-v1.39.0.md`.

---

## Self-Review

### 1. Spec coverage — finding → task mapping

- **C1** (generator emits invalid C) → T2 ✓ (with T1 as regression catcher)
- **H1** (CLI drops BSWMD data) → T4 ✓
- **H2** (registry not idempotent) → T5 ✓
- **H3** (container shortName+index uniqueness) → T5 ✓
- **H4** (CLI ecucValues empty stubs) → T4 ✓
- **H5** (missing `u` suffix) → T3 ✓
- **M1** (vm-runner m3 regex) → T6 polish ✓
- **M2** (parseImports length check) → T6 polish ✓
- **M3** (type-check default arm) → T6 polish ✓
- **M4** (writeOutputTree Windows paths) → T6 polish ✓
- **L2** (`_runCounter` global) → T6 polish ✓
- **L1** (downgraded to NOTE) → no action ✓

### 2. Placeholder scan

- All test code shown verbatim with concrete assertions.
- All commands have expected output spelled out.
- No "implement later" / TBD strings.
- T2's snapshot regeneration has an explicit "search for the regeneration logic" step rather than a vague "regenerate snapshots" — the implementer must find the regeneration process.

### 3. Type consistency

- `BswmdModuleDefLite` widening in T4 — additive fields only. Existing consumers (validators) read the new fields and were previously getting `undefined`. No removal of fields.
- `renderCValue` integer arm returns string suffix change — string-length changes, all consumers reading the return value treat it as `string`. No shape change.

### 4. Risk strategy

- T1 MUST land before T2 (order enforced by commit chain, not parallel).
- Snapshot regeneration is a single commit per T2/T3 with explicit "regen, not feature" commit message.
- T6 polish is bundled (small fixes, single commit).
- Capture happens throughout (per the v1.38.0 lesson).

### 5. Reverse-closes

Closes Round-3 deep review's 10 of 12 actionable findings. L1 downgraded to NOTE (not actioned). v1.39.x PATCH chain will handle any remaining polish.
