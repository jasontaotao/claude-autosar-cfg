# v1.41.0 MINOR Implementation Plan — Script Store + i18n + Error Envelope Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 1 HIGH + 3 MEDIUM findings from the Round-5 deep code review (i18n / error-envelope / Zustand-stale-state axis). HIGH: `useScriptStore.applyMutation` captures a stale `runResult` snapshot. MEDIUM: pickDirHandler locale not validated; dcmConfigHandler throws raw Error; runScript is fire-and-forget.

**Architecture:** Four small surgical fixes. T1 fixes the stale-state race. T2-T4 are 1-line validators/envelope. T5 docs + ship.

**Tech Stack:** Electron + TypeScript 5.6 + React 19 + vitest 3 + jsdom 30+. Pure TypeScript.

**Baseline:** v1.40.0 MINOR `9a5ec8a` (3119 + 7 SKIP / 0 fail)
**Target:** 3123 + 7 SKIP / 0 fail (+4 net: 4 small fix tests)

## Global Constraints

- All modified/new files end with trailing newline.
- No `console.log` in production code; `console.warn` / `console.error` allowed for defensive warnings (with `eslint-disable-next-line no-console` per project convention).
- 中文 for user-facing/business comments; 英文 for technical API/protocol/comments per CLAUDE.md.
- Subagent-driven execution; one implementer per task.
- Each task ends with its own test running and passing + `pnpm verify` 7-stage GREEN (per v1.40.0 T3 lesson `pre-flight-lint-must-be-7-stage-at-every-t-level`).
- Test additions must include the covering test command and pass locally before commit.
- Exact values (file paths, error kind strings, function signatures) MUST match this plan verbatim.
- Implementer MUST dispatch `pkm-capture` autonomously when work is capture-worthy (per v1.38.0 lesson `brief-explicit-must-not-clause-is-overridden-by-implementer-judgment-when-content-is-genuinely-capture-worthy`).
- Implementer MUST NOT make destructive git operations (`reset --hard`, `push --force`) on `origin/main`.

---

## Task 1 (H1): useScriptStore.applyMutation stale state fix

### Files

- Modify: `src/renderer/store/useScriptStore.ts:450-457` (the final set in applyMutation)
- Modify: `src/renderer/store/useScriptStore.test.ts` (1 NEW test)

### Why this is H1

The function captures `const result = get().runResult;` at line 306, then later does `set({runResult: {...result, mutations: [], warnings}});` at line 451. If the user clicks `Discard` (which creates a new runResult object) between line 306 and line 451, the final set overwrites the Discard with stale data.

### Plan summary

- **T1.1:** Read `src/renderer/store/useScriptStore.ts:300-460` to confirm the current `applyMutation` body.
- **T1.2:** Apply the identity-equality check:
  ```ts
  // Replace lines 450-457 with:
  const current = get().runResult;
  set({
    runResult:
      current === result
        ? { ...result, mutations: [], warnings } // owner still holds snapshot → safe to clear
        : { ...current, warnings }, // owner replaced (e.g. user discarded) → preserve
    dirty: false,
  });
  ```
- **T1.3:** Write 1 NEW test in `useScriptStore.test.ts`:
  - Mock `applyMutation` IPC to be slow (return a delayed promise that the test resolves manually).
  - Trigger `applyMutation()` → snapshot `result` captured.
  - Before the IPC resolves, call `discardMutation()` (set `runResult` to a new object with mutations cleared).
  - Resolve the IPC.
  - Assert: `runResult` is the post-Discard state, NOT the stale `result` reference.
- **T1.4:** Run tests + 7-stage pnpm verify:
  ```bash
  pnpm exec vitest run src/renderer/store/useScriptStore.test.ts
  pnpm exec vitest run 2>&1 | tail -5  # full regression (3119 + 1 = 3120)
  pnpm exec tsc --noEmit -p tsconfig.json
  pnpm exec tsc --noEmit -p tsconfig.web.json
  pnpm verify  # 7-stage GREEN
  ```
- **T1.5:** Commit atomically.

### Risk to mitigate

- **Test races with the actual store timing** — use `vi.useFakeTimers()` + manual `vi.advanceTimersByTime` to control the async resolution order. The mock IPC must hold a Promise that the test resolves explicitly.

---

## Task 2 (M2): pickDirHandler locale validation

### Files

- Modify: `src/main/ipc/pickDirHandler.ts:36`
- Modify: `src/main/ipc/__tests__/pickDirHandler.test.ts` (1 NEW test)

### Plan summary

- **T2.1:** Read `src/main/ipc/pickDirHandler.ts:1-50` to confirm the current shape.
- **T2.2:** Apply the ternary validation:
  ```ts
  // Before
  const locale: Locale = req.locale ?? 'en';
  // After
  const locale: Locale = req.locale === 'zh-CN' ? 'zh-CN' : 'en';
  ```
- **T2.3:** Write 1 NEW test in `pickDirHandler.test.ts`:
  - Test 1: `req.locale = 'fr'` → handler returns OK with `'en'` locale (no crash).
  - Test 2: `req.locale = 'zh-CN'` → handler returns OK with `'zh-CN'` locale.
  - Test 3: `req.locale = undefined` → handler returns OK with `'en'` locale.
- **T2.4:** Run tests + 7-stage pnpm verify:
  ```bash
  pnpm exec vitest run src/main/ipc/__tests__/pickDirHandler.test.ts
  pnpm exec vitest run 2>&1 | tail -5  # full regression (3120 + 1 = 3121)
  pnpm verify
  ```
- **T2.5:** Commit atomically.

---

## Task 3 (M3): dcmConfigHandler error envelope

### Files

- Modify: `src/main/ipc/dcmConfigHandler.ts:91-95`
- Modify: `src/main/ipc/__tests__/dcmConfigHandler.test.ts` (1 NEW test)

### Plan summary

- **T3.1:** Read `src/main/ipc/dcmConfigHandler.ts:1-110` to confirm the current shape + the `DcmConfigError` class constructor signature.
- **T3.2:** Apply the envelope:

  ```ts
  // Before (line 91-95)
  throw new Error(`Dcm BSWMD fixture not found via discovery. ...`);

  // After
  throw new DcmConfigError({
    kind: 'no-dcm-bswmd-fixture',
    message: `Dcm BSWMD fixture not found via discovery. ...`,
  });
  ```

  If the existing `DcmConfigError` constructor takes a different signature, adapt. Verify the `'no-dcm-bswmd-fixture'` kind is added to the `DcmConfigErrorKind` union (or equivalent).

- **T3.3:** Write 1 NEW test in `dcmConfigHandler.test.ts`:
  - Test 1: pass an ODX path that triggers the fixture-not-found branch → handler returns `{ ok: false, error: { kind: 'no-dcm-bswmd-fixture', message: ... } }` (NOT the generic `kind: 'unknown'` bucket).
  - Test 2 (regression): pass a valid ODX + valid BSWMD → handler returns the expected success envelope.
- **T3.4:** Run tests + 7-stage pnpm verify:
  ```bash
  pnpm exec vitest run src/main/ipc/__tests__/dcmConfigHandler.test.ts
  pnpm exec vitest run 2>&1 | tail -5  # full regression (3121 + 1 = 3122)
  pnpm verify
  ```
- **T3.5:** Commit atomically.

### Risk to mitigate

- **`DcmConfigError` constructor signature may differ from `{ kind, message }`** — read the existing class first. If it takes positional args, adapt. If it has additional required fields, include them.
- **New error kind may need a new i18n key** in `src/shared/i18n/odx.ts` for the renderer's toast routing. If the renderer-side toast router already handles `'unknown'` and falls back to a generic message, the new kind may not need a new key — verify the renderer's error-toast mapping.

---

## Task 4 (M4): runScript fire-and-forget catch

### Files

- Modify: `src/renderer/components/ScriptPanel/ScriptPanel.tsx:123` (the `void runScript(...)` call)
- Modify: `src/renderer/components/ScriptPanel/ScriptPanel.test.tsx` (1 NEW test)

### Plan summary

- **T4.1:** Read `ScriptPanel.tsx:115-130` to confirm the `handleRun` function.
- **T4.2:** Apply the catch:

  ```ts
  // Before
  const handleRun = (): void => {
    if (selectedId === null) return;
    void runScript(selectedId);
  };

  // After
  const handleRun = (): void => {
    if (selectedId === null) return;
    runScript(selectedId).catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[ScriptPanel] runScript failed:', e);
    });
  };
  ```

- **T4.3:** Write 1 NEW test in `ScriptPanel.test.tsx`:
  - Mock `runScript` to reject with `new Error('IPC layer failure')`.
  - Render the panel; click the `Run` button.
  - Assert: `console.error` is called with the rejection (use `vi.spyOn(console, 'error')`).
  - Assert: no unhandled rejection escapes to the test runner (use `vi.waitFor` + check that the test didn't fail with an unhandled rejection).
- **T4.4:** Run tests + 7-stage pnpm verify:
  ```bash
  pnpm exec vitest run src/renderer/components/ScriptPanel/ScriptPanel.test.tsx
  pnpm exec vitest run 2>&1 | tail -5  # full regression (3122 + 1 = 3123)
  pnpm verify
  ```
- **T4.5:** Commit atomically.

---

## Task 5: docs + ship v1.41.0

### Files

- Modify: `docs/release-notes/v1.41.0/README.md` (NEW)
- Modify: `CHANGELOG.md` (v1.41.0 row)
- Modify: `.git/sdd/progress-v1.41.0.md` (NEW)

### Plan summary

- **T5.1:** Verify `pnpm exec vitest run 2>&1 | tail -5` confirms 3123 + 7 SKIP / 0 fail.
- **T5.2:** Create `docs/release-notes/v1.41.0/README.md` (mirror v1.40.0 format). Cover:
  - Title: "v1.41.0 MINOR — Script Store + i18n + Error Envelope Cleanup"
  - Ship: 2026-07-08 (TAG PENDING — T7 fills)
  - Baseline: v1.40.0 MINOR `9a5ec8a` (3119 + 7 SKIP / 0 fail)
  - Target: 3123 + 7 SKIP / 0 fail (+4 net)
  - Sections per finding closed (H1, M2, M3, M4) with file:line citations
  - 3 NEW lessons (already captured by Round-5 review: redux-zustand-store-async-mutation, ipc-handler-locale-input, file-size-backlog)
  - Known follow-ups: L1 + L2 + N1 (file-size backlog → v1.41.x file-size PATCH; L2 console.error inventory)
- **T5.3:** Edit `CHANGELOG.md` — add v1.41.0 row above v1.40.0, with one-liner per finding + commit SHAs + test delta.
- **T5.4:** Run prettier + pnpm verify 7-stage GREEN. If prettier flagged files, format them.
- **T5.5:** Commit atomically.
- **T5.6:** Tag + push + gh release (2 separate pushes per the `follow-tags-unreliable-separate-push-tag` lesson).

### Risk to mitigate

- **Working-artifact prettier drift** — same issue as v1.38.0/v1.39.0/v1.40.0. Format the spec/plan files at T5 time before ship.
- **Push blocked on github.com:443** — `git pull --rebase origin main` + retry. If still blocked, Tier 3 fallback.

---

## Self-Review

### 1. Spec coverage

- **H1** (applyMutation stale state) → T1 ✓
- **M2** (pickDirHandler locale) → T2 ✓
- **M3** (dcmConfigHandler envelope) → T3 ✓
- **M4** (runScript fire-and-forget) → T4 ✓
- **M1 + L1** (file-size backlog) → deferred to v1.41.x file-size PATCH ✓
- **L2 + N1** (console.error inventory / CLI dispatcher exhaustive) → no action needed ✓

### 2. Placeholder scan

- All test code shown verbatim.
- All commands have expected output.
- No "implement later" / TBD strings.
- Each task's spec is small (1-line fix per file, +1 test per fix).

### 3. Type consistency

- T2's ternary preserves the `Locale` type narrowing.
- T3's new error kind must be added to the `DcmConfigErrorKind` union (or equivalent). Verify in T3.1.
- T1's identity-equality check uses the existing `get()` pattern.

### 4. Risk strategy

- 4 small fixes, each in its own commit. Per-task review is overkill (changes are 1-line); bundle T1-T4 review into a single round after T4 lands (matches v1.38.0 T5 polish pattern).
- `pnpm verify` 7-stage after every T (per v1.40.0 T3 lesson).
- Capture happens throughout (per v1.38.0 lesson).

### 5. Reverse-closes

Closes Round-5 deep review's 4 of 8 actionable findings (1 HIGH + 3 MEDIUM). 2 LOW + 1 NOTE deferred (L1 file-size → separate PATCH; L2 console.error inventory; N1 confirmed clean).
