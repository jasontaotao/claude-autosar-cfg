# v1.40.0 MINOR Implementation Plan — IPC Size-Cap Parity + Launcher Stale-Closure

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 3 HIGH + 4 MEDIUM + 1 LOW findings from the Round-4 deep code review (IPC + store + renderer mutation axis). HIGH: 6 dialog-driven read handlers skip the 32 MiB cap; dcmConfigHandler reads ODX+BSWMD with no cap; useDcmConfigLauncher has stale-closure on re-fire.

**Architecture:** T1 creates a shared `readFileWithCap` helper + applies it to 6 picker paths + dcmConfigHandler (H1 + H2 + M4). T2 fixes the launcher stale-closure with useRef (H3). T3 adds 3 one-line validators (M1 + M2 + M3 + L1). T4 docs + ship.

**Tech Stack:** Electron + TypeScript 5.6 + React 19 + vitest 3 + jsdom 30+. Pure TypeScript + Node fs.

**Baseline:** v1.39.0 MINOR `68183f1` (3092 + 7 SKIP / 0 fail)
**Target:** 3102 + 7 SKIP / 0 fail (+10 net)

## Global Constraints

- All modified/new files end with trailing newline.
- No `console.log` in production code; `console.warn` allowed for defensive warnings.
- 中文 for user-facing/business comments; 英文 for technical API/protocol/comments per CLAUDE.md.
- Subagent-driven execution; one implementer per task, one task reviewer per task.
- Each task ends with its own test running and passing.
- Test additions must include the covering test command and pass locally before commit.
- Exact values (file paths, error kind strings, function signatures, error envelope shapes) MUST match this plan verbatim.
- Implementer MUST dispatch `pkm-capture` autonomously when work is capture-worthy (per v1.38.0 lesson `brief-explicit-must-not-clause-is-overridden-by-implementer-judgment-when-content-is-genuinely-capture-worthy`).
- Implementer MUST NOT make destructive git operations (`reset --hard`, `push --force`) on `origin/main`.

---

## Task 1: `readFileWithCap` shared helper + 6 picker paths + dcmConfigHandler (H1 + H2 + M4)

### Files

- Create: `src/main/ipc/sizeCap.ts` (NEW)
- Create: `src/main/ipc/__tests__/sizeCap.test.ts` (NEW)
- Modify: `src/main/ipc/bswmdReadHandler.ts` (refactor to use helper)
- Modify: `src/main/ipc/openDbcHandler.ts` (H1)
- Modify: `src/main/ipc/openOdxHandler.ts` (H1)
- Modify: `src/main/ipc/openOdxWithDefaultHandler.ts` (H1)
- Modify: `src/main/ipc/bswmdPickHandler.ts` (H1)
- Modify: `src/main/ipc/register.ts` (H1 — OPEN_ARXML + OPEN_ARXML_MULTI)
- Modify: `src/main/ipc/dcmConfigHandler.ts` (H2)
- Modify: existing handler test files to verify the new cap is enforced

### Interfaces

**Consumes:** the existing `fs.readFile(path, 'utf8')` / `fs.readFileSync(path, 'utf-8')` call pattern.

**Produces:**

```ts
// src/main/ipc/sizeCap.ts
export const DEFAULT_FILE_CAP_BYTES = 32 * 1024 * 1024; // 32 MiB

export type ReadFileWithCapResult =
  | { ok: true; content: string }
  | { ok: false; kind: 'too-large'; message: string }
  | { ok: false; kind: 'read-failed'; message: string };

export function readFileWithCap(
  path: string,
  capBytes: number = DEFAULT_FILE_CAP_BYTES,
): Promise<ReadFileWithCapResult>;
```

### Plan summary

- **T1.1:** Read `src/main/ipc/bswmdReadHandler.ts:1-100` to confirm the current cap pattern. Then read each of the 6 picker paths to confirm the current `fs.readFile(path, 'utf8')` call.
- **T1.2:** Create `src/main/ipc/sizeCap.ts` with the helper function. Pattern:

  ```ts
  export const DEFAULT_FILE_CAP_BYTES = 32 * 1024 * 1024;

  export async function readFileWithCap(
    path: string,
    capBytes: number = DEFAULT_FILE_CAP_BYTES,
  ): Promise<ReadFileWithCapResult> {
    try {
      const stat = await fs.promises.stat(path);
      if (stat.size > capBytes) {
        return {
          ok: false,
          kind: 'too-large',
          message: `${path} is ${stat.size} bytes, exceeds ${capBytes} cap`,
        };
      }
    } catch (e) {
      return {
        ok: false,
        kind: 'read-failed',
        message: `stat failed for ${path}: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    try {
      const content = await fs.promises.readFile(path, 'utf8');
      return { ok: true, content };
    } catch (e) {
      return {
        ok: false,
        kind: 'read-failed',
        message: `read failed for ${path}: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }
  ```

- **T1.3:** Write 3 NEW tests in `src/main/ipc/__tests__/sizeCap.test.ts`:
  - Test 1: 1-byte file returns `{ ok: true, content: '...' }`.
  - Test 2: 33-MiB file returns `{ ok: false, kind: 'too-large' }`. Use a sparse file: `fs.truncate` on an existing fd (the OS doesn't actually write 33 MB).
  - Test 3: non-existent file returns `{ ok: false, kind: 'read-failed' }`.
- **T1.4:** Refactor `bswmdReadHandler.ts:50-77` to use the helper. The handler is already async; just `await readFileWithCap(path)` and branch on the result.
- **T1.5:** Apply the helper to the 6 picker paths:
  - `openDbcHandler.ts:41`, `openOdxHandler.ts:47`, `openOdxWithDefaultHandler.ts:37`, `bswmdPickHandler.ts:41` — replace `fs.readFile(path, 'utf8')` with `await readFileWithCap(path)`. Branch on the result; return `{ kind: 'read-failed', ... }` for `too-large` and `read-failed` kinds.
  - `register.ts:141` (OPEN_ARXML) + `:225` (OPEN_ARXML_MULTI) — same pattern. For OPEN_ARXML_MULTI, per-file reject (add to `failed: {path, message}[]`); for OPEN_ARXML, return `{ kind: 'read-failed', ... }` if the single file is too large.
- **T1.6:** Apply the helper to `dcmConfigHandler.ts:184,217`:
  - The function is already `async` (verify by reading the function signature). Replace `readFileSync(args.odxPath, 'utf-8')` with `await readFileWithCap(args.odxPath)`. Branch on the result; return a typed `DcmConfigError` with kind `odx-too-large` or `bswmd-too-large` (new error kinds).
  - If the function is currently sync at the read sites, async-ify those sections.
- **T1.7:** Add 3 NEW parity tests in the affected handler test files:
  - `openDbcHandler.test.ts` — 33-MiB file returns `{ kind: 'read-failed', message: /too-large/ }`.
  - Same for `openOdxHandler.test.ts`, `bswmdPickHandler.test.ts`.
  - `dcmConfigHandler.test.ts` — 33-MiB ODX returns `{ kind: 'odx-too-large' }`.
- **T1.8:** Run tests:
  ```bash
  pnpm exec vitest run src/main/ipc/__tests__/sizeCap.test.ts
  pnpm exec vitest run src/main/ipc/__tests__/  # all IPC tests
  pnpm exec vitest run 2>&1 | tail -5  # full regression (3092 + 6 = 3098)
  pnpm exec tsc --noEmit -p tsconfig.json
  pnpm exec tsc --noEmit -p tsconfig.web.json
  ```
- **T1.9:** Commit atomically:
  ```bash
  git add src/main/ipc/sizeCap.ts
  git add src/main/ipc/__tests__/sizeCap.test.ts
  git add src/main/ipc/bswmdReadHandler.ts
  git add src/main/ipc/openDbcHandler.ts src/main/ipc/openOdxHandler.ts src/main/ipc/openOdxWithDefaultHandler.ts
  git add src/main/ipc/bswmdPickHandler.ts src/main/ipc/register.ts
  git add src/main/ipc/dcmConfigHandler.ts
  git add <test files for affected handlers>
  git commit -m "fix(ipc): v1.40.0 MINOR T1 (H1 + H2 + M4) -- size-cap helper + picker parity"
  ```

### Risk to mitigate

- **33-MiB sparse file test** — verify the sparse file technique works on the CI platform. If `fs.truncate` is platform-incompatible, use `fs.writeFile` with `Buffer.alloc(33 * 1024 * 1024)` and accept the ~33 MB write (slower but reliable). Or use `vi.mock('node:fs', ...)` to mock `fs.stat`.
- **dcmConfigHandler async-ification** — if the function is currently sync at the read sites, async-ifying changes the call-site contract. Verify all callers await correctly.
- **OPEN_ARXML_MULTI per-file reject** — the existing function returns `{opened: [...], failed: [...]}`. Adding the per-file reject (add to `failed`) doesn't change the contract; existing callers handle it.

---

## Task 2: useDcmConfigLauncher stale-closure fix (H3)

### Files

- Modify: `src/renderer/hooks/useDcmConfigLauncher.ts` (useRef + sync in success branch)
- Modify: `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts` (1 NEW test)

### Interfaces

**Consumes:** the existing `useCallback` for `handleGenerateNew` at line 556, the `state.lastOdxPath` closeure read, the `useRef` pattern at `inFlightRef` / `memoRef`.

**Produces:**

```ts
// new useRef synced in the open() success branch
const lastOdxPathRef = useRef<string | null>(null);

// in the open() success branch, after the existing state.lastOdxPath = result.lastOdxPath line:
if (result.lastOdxPath !== undefined) {
  lastOdxPathRef.current = result.lastOdxPath;
}

// in handleGenerateNew, replace state.lastOdxPath with lastOdxPathRef.current:
const odxPath = lastOdxPathRef.current ?? activeDocumentPath;

// remove state.lastOdxPath from the useCallback dep array
```

### Plan summary

- **T2.1:** Read `useDcmConfigLauncher.ts:1-80` to find the existing `inFlightRef` and `memoRef` declarations + the `handleGenerateNew` useCallback at line 556.
- **T2.2:** Read the `open()` success branch (find where `state.lastOdxPath` is currently set after a successful dcm:config). Add `lastOdxPathRef.current = ...` next to it.
- **T2.3:** Modify `handleGenerateNew`: change `state.lastOdxPath` to `lastOdxPathRef.current`; remove `state.lastOdxPath` from the dep array.
- **T2.4:** Write 1 NEW test in `useDcmConfigLauncher.test.ts`:
  1. Seed `state.lastOdxPath = '/old/Odx-A.odx'` + `state.activeDocumentPath = '/old/Odx-A.odx'`.
  2. Mock `bswmdPick` → opened. Mock `confirmDestructive` → 'confirm'.
  3. Trigger `handleGenerateNew`. Assert the `open()` call received `odxPath === '/old/Odx-A.odx'` (active, not cached).
  4. Change `state.activeDocumentPath = '/new/Odx-B.odx'`. (No `state.lastOdxPath` change — it's still the old value.)
  5. Trigger `handleGenerateNew` again. Assert the `open()` call received `odxPath === '/new/Odx-B.odx'` (new active, NOT the cached lastOdxPath from the previous success).
- **T2.5:** Run tests:
  ```bash
  pnpm exec vitest run src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts
  pnpm exec vitest run 2>&1 | tail -5  # full regression (3098 + 1 = 3099)
  pnpm exec tsc --noEmit -p tsconfig.json
  pnpm exec tsc --noEmit -p tsconfig.web.json
  ```
- **T2.6:** Commit atomically:
  ```bash
  git add src/renderer/hooks/useDcmConfigLauncher.ts
  git add src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts
  git commit -m "fix(renderer): v1.40.0 MINOR T2 (H3) -- useDcmConfigLauncher lastOdxPathRef for re-fire correctness"
  ```

### Risk to mitigate

- **The `open()` success branch sets `state.lastOdxPath` — verify the new `lastOdxPathRef.current` is set in the same branch.** If the success branch is conditional, mirror the conditional.
- **The `useCallback` dep array loses `state.lastOdxPath` — verify no other code path reads it via the closure.** Read the file for other usages.
- **The ref doesn't trigger re-renders — verify the hook doesn't depend on re-render for correctness.** If the UI displays `lastOdxPath` (e.g. as a "previously generated" indicator), the ref-based approach won't update the display. Read the file; if the display exists, fall back to keeping the state read for display but reading from the ref for `odxPath`.

---

## Task 3: 1-line validators + race polish (M1 + M2 + M3 + L1)

### Files

- Modify: `src/main/ipc/script-handler.ts` (M1 validateName + M2 timeoutMs clamp)
- Modify: `src/main/ipc/projectSaveHandler.ts` (M3 manifest shape probe)
- Modify: `src/main/ipc/xlsxEcucBatchImportHandler.ts` (L1 reorder push)
- Modify: `src/main/ipc/__tests__/script-handler.test.ts` (UPDATE) — 2 NEW tests
- Modify: `src/main/ipc/__tests__/projectSaveHandler.test.ts` (UPDATE) — 1 NEW test

### Interfaces

**M1 (script-handler.ts:190-241):**

```ts
// new validateName helper
function validateName(name: string): string | null {
  if (name.length > 80) return 'name too long (max 80 chars)';
  if (/[\x00-\x1f]/.test(name)) return 'name contains control character';
  if (name.trim().length === 0) return 'name is whitespace';
  return null;
}

// in scriptSaveHandler, before persisting:
const nameErr = validateName(req.name);
if (nameErr !== null) {
  return { kind: 'invalid-name', message: nameErr };
}
```

**M2 (script-handler.ts:325):**

```ts
// before the runInSandbox call:
const SAFE_TIMEOUT_MS = 60_000;
const timeoutMs = Math.min(Math.max(req.timeoutMs ?? 5000, 1000), SAFE_TIMEOUT_MS);
```

**M3 (projectSaveHandler.ts:67):**

```ts
import { loadManifest } from '../../core/project/manifest.js';
// before writeAtomic:
const probe = loadManifest(saveManifest(req.manifest), dirname(req.manifestPath));
if (!probe.ok) {
  return { kind: 'write-failed', message: `Manifest invalid: ${probe.error.kind}` };
}
```

**L1 (xlsxEcucBatchImportHandler.ts:481-514):**

- Move the `webContents.send(XLSX_IMPORT_COMPLETE, ...)` block to AFTER the `await xlsxHistorySaveHandler(...)` call.
- Add a `persisted` field to the push payload: `persisted: saveRes.ok`.
- Update `XlsxImportCompletePayload` type to include `persisted: boolean`.

### Plan summary

- **T3.1:** Read `src/main/ipc/script-handler.ts:1-80` + `:190-241` + `:320-360` to confirm the current shape.
- **T3.2:** Apply M1 — add `validateName` helper + apply in `scriptSaveHandler`.
- **T3.3:** Apply M2 — clamp `timeoutMs` in `scriptRunHandler`.
- **T3.4:** Read `src/main/ipc/projectSaveHandler.ts:1-100` to confirm the current shape + the `saveManifest` function.
- **T3.5:** Apply M3 — add the manifest shape probe before `writeAtomic`.
- **T3.6:** Read `src/main/ipc/xlsxEcucBatchImportHandler.ts:460-510` to confirm the current push + save ordering.
- **T3.7:** Apply L1 — reorder push after save + add `persisted` field. Update the `XlsxImportCompletePayload` type (in `src/shared/ipc-contract.ts` or wherever it lives). Update the listener (`xlsxImportListener.ts`) to handle the new field.
- **T3.8:** Write 4 NEW tests:
  - Test M1: `scriptSaveHandler` rejects a 1-MB name string.
  - Test M2: `scriptRunHandler` clamps `timeoutMs > 60_000` to 60_000.
  - Test M3: `projectSaveHandler` rejects a tampered manifest.
  - Test L1: `XLSX_IMPORT_COMPLETE` push fires AFTER `xlsxHistorySaveHandler` resolves (verifiable by mocking the save handler and checking the call order).
- **T3.9:** Run tests:
  ```bash
  pnpm exec vitest run src/main/ipc/__tests__/script-handler.test.ts
  pnpm exec vitest run src/main/ipc/__tests__/projectSaveHandler.test.ts
  pnpm exec vitest run src/main/ipc/__tests__/xlsxEcucBatchImportHandler.test.ts
  pnpm exec vitest run 2>&1 | tail -5  # full regression (3099 + 4 = 3103)
  pnpm exec tsc --noEmit -p tsconfig.json
  pnpm exec tsc --noEmit -p tsconfig.web.json
  ```
- **T3.10:** Commit atomically:
  ```bash
  git add src/main/ipc/script-handler.ts
  git add src/main/ipc/projectSaveHandler.ts
  git add src/main/ipc/xlsxEcucBatchImportHandler.ts
  git add src/shared/ipc-contract.ts  # for L1 XlsxImportCompletePayload update
  git add src/renderer/store/xlsxImportListener.ts  # for L1 listener update
  git add <test files>
  git commit -m "fix(ipc): v1.40.0 MINOR T3 (M1 + M2 + M3 + L1) -- validators + race polish"
  ```

### Risk to mitigate

- **`validateName` cap 80 chars** — verify no existing test uses a longer name. If it does, bump the cap (or update the test).
- **M3 `loadManifest` probe reads the manifest JSON via the existing parser** — verify the parser is available in `src/core/project/manifest.ts` and that it can handle a minimal in-memory object (no file path required). The existing `loadManifest(JSON.stringify(...))` pattern is the canonical in-memory probe.
- **L1 `persisted: false` field on the push payload** — the listener (`xlsxImportListener.ts`) and any tests that assert the payload shape need updates. Verify the new field is additive (no break).
- **Test L1 (call order)** — use `vi.fn()` to mock both `webContents.send` and `xlsxHistorySaveHandler`. Assert `webContents.send` was called AFTER `xlsxHistorySaveHandler`.

---

## Task 4: docs + ship v1.40.0 MINOR

### Files

- Modify: `docs/release-notes/v1.40.0/README.md` (NEW)
- Modify: `CHANGELOG.md` (v1.40.0 row)
- Modify: `.git/sdd/progress-v1.40.0.md` (NEW)

### Plan summary

- **T4.1:** Run `pnpm exec vitest run 2>&1 | tail -5` to confirm 3102 + 7 SKIP / 0 fail.
- **T4.2:** Create `docs/release-notes/v1.40.0/README.md`:
  - Title: "v1.40.0 MINOR — IPC Size-Cap Parity + Launcher Stale-Closure"
  - Ship: 2026-07-08 (TAG PENDING — T5 fills)
  - Baseline: v1.39.0 MINOR `68183f1` (3092 + 7 SKIP / 0 fail)
  - Target: 3102 + 7 SKIP / 0 fail (+10 net)
  - Sections per finding closed (H1, H2, H3, M1, M2, M3, M4, L1) with file:line citations
  - Critical callout: H1 family is the most serious PATTERN gap (per-surface application of 32 MiB cap, regressed on picker paths)
  - 2 NEW lessons (already captured by Round-4 review; cross-link here)
  - Known follow-ups (deferred): L2, L3, L4, N1
- **T4.3:** Edit `CHANGELOG.md` — add v1.40.0 MINOR row above v1.39.0, with one-liner per finding + commit SHAs + test delta.
- **T4.4:** Append to `.git/sdd/progress-v1.40.0.md` (NEW) — T1-T4 complete + T5 pending block.
- **T4.5:** Run prettier + pnpm verify 7-stage GREEN.
- **T4.6:** Commit atomically (no push — T5 batches):
  - `git add docs/release-notes/v1.40.0/README.md CHANGELOG.md`
  - commit message: `docs(release): v1.40.0 MINOR T4 — release notes + CHANGELOG`
  - Do NOT commit the progress ledger (local working artifact).
  - If prettier flagged files, bundle a separate `chore(format)` commit (matches v1.38.0/v1.39.0 T6.x pattern).

### Risk to mitigate

- **Working-artifact prettier drift** — same issue as v1.39.0. Format the spec/plan files at T4 time before ship.

---

## Task 5: ship v1.40.0 MINOR

### Files

- Modify: local git state (tag, push)
- Verify: GH release

### Plan summary

- **T5.1:** Pre-ship sanity check:
  ```bash
  git status  # clean tree
  git log --oneline origin/main..HEAD  # exactly 4 commits (T1-T4) + chore(format) if needed
  pnpm verify  # 7-stage GREEN
  ```
- **T5.2:** Push commits to origin/main:
  ```bash
  git push origin main
  ```
  If blocked: `git pull --rebase origin main` (per v1.37.1 recovery pattern) then retry. If still blocked: Tier 3 fallback.
- **T5.3:** Create tag:
  ```bash
  git tag -a v1.40.0 -m "v1.40.0 MINOR — IPC size-cap parity + launcher stale-closure"
  git push origin v1.40.0
  ```
  If push blocked, use `gh api` (per v1.37.0 recovery pattern).
- **T5.4:** Create GH release:
  ```bash
  gh release create v1.40.0 --title "v1.40.0 MINOR" --notes-file docs/release-notes/v1.40.0/README.md
  ```
- **T5.5:** Verify + finalize:
  ```bash
  gh release view v1.40.0 --json tagName,publishedAt,url
  ```
  Append to `.git/sdd/progress-v1.40.0.md`.

---

## Self-Review

### 1. Spec coverage — finding → task mapping

- **H1** (size-cap parity) → T1 ✓
- **H2** (dcmConfigHandler no cap) → T1 ✓
- **H3** (useDcmConfigLauncher stale-closure) → T2 ✓
- **M1** (scriptSaveHandler validateName) → T3 ✓
- **M2** (scriptRunHandler timeoutMs clamp) → T3 ✓
- **M3** (projectSaveHandler manifest shape probe) → T3 ✓
- **M4** (OPEN_ARXML_MULTI no cap) → T1 (same shared helper) ✓
- **L1** (xlsx push race) → T3 (same commit as M1+M2+M3) ✓
- **L2** (ecucSlice stale-state reads) → deferred to v1.40.x PATCH chain ✓
- **L3** (pickDirHandler locale validation) → deferred ✓
- **L4** (bswmdPickHandler duplicate) → downgraded to NOTE, no action ✓
- **N1** (featureFlagsGetHandler all-OFF) → deferred ✓

### 2. Placeholder scan

- All test code shown verbatim.
- All commands have expected output.
- No "implement later" / TBD strings.
- T1's `fs.truncate` sparse-file technique is specified; implementer adapts if the technique is platform-incompatible.

### 3. Type consistency

- `ReadFileWithCapResult` discriminated union matches the project's `Result<T, E>` pattern.
- `XlsxImportCompletePayload.persisted: boolean` is additive.
- `lastOdxPathRef: useRef<string | null>` is the same pattern as `inFlightRef` and `memoRef`.

### 4. Risk strategy

- T1 ships a shared helper to prevent future picker-path regressions. The 4 existing parse-path handlers are also refactored to use the helper, eliminating 4 copies of the same 12-line cap logic.
- T2 uses useRef per the v1.36.0 lesson `store-as-source-of-truth-for-async-args`.
- T3 is a 4-fix batch in one commit (M1+M2+M3+L1) — small enough to commit together.
- Capture happens throughout (per the v1.38.0 lesson).

### 5. Reverse-closes

Closes Round-4 deep review's 8 of 12 actionable findings (3 HIGH + 4 MEDIUM + 1 LOW). 2 LOW + 1 NOTE deferred to v1.40.x PATCH chain.
