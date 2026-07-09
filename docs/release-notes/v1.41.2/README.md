# v1.41.2 PATCH — Round-5 Deferred Sweep

**Ship:** 2026-07-10
**Tag:** `v1.41.2` (pending — T3 fills)
**Baseline:** v1.41.1 PATCH `5803f46` (3124 + 7 SKIP / 0 fail)
**Target:** 3124 + 7 SKIP / 0 fail (zero test delta — pure defect-fix PATCH)

## Goal

Close the remaining Round-5 deep code review deferred items in 1 source commit + 0 test changes. Three categories of deferred items:

1. **6 latent `useScriptStore` stale-state siblings** (Round-5 H1 caveat)
2. **N1 CLI dispatcher exhaustive check** (Round-5 NOTE)
3. **L1 / L3 console.error inventory** (Round-5 LOW + Round-1 L3)

## What shipped

### T1: 6 useScriptStore stale-state siblings

`src/renderer/store/useScriptStore.ts` — extracted `commitRunResult(patch, dirty)` helper inside `applyMutation` (closure-scoped to `result` + `set` + `get`). All 7 `set({ runResult: ... })` calls in `applyMutation` now go through the helper:

- Line 334 (no active doc): `commitRunResult({ mutations: [] }, false)`
- Line 363 (applyResult errors): `commitRunResult({ mutations: [], warnings, errorMessage }, false)`
- Line 384 (no project manifest): `commitRunResult({ mutations: [], warnings, errorMessage: 'project save skipped: ...' }, false)`
- Line 400 (serialize failed): `commitRunResult({ mutations: [], warnings, errorMessage: 'serialize: ...' }, false)`
- Line 419 (projectSave write-failed): `commitRunResult({ mutations: [], warnings, errorMessage: 'projectSave: ...' }, true)`
- Line 438 (atomic-write threw): `commitRunResult({ mutations: [], warnings, errorMessage: e.message }, true)`
- Line 450 (v1.41.0 MINOR T1 success path): `commitRunResult({ mutations: [], warnings }, false)` (collapsed from inline)

Helper semantics:

```ts
const commitRunResult = (patch: Partial<typeof result>, dirty: boolean): void => {
  const current = get().runResult;
  set({
    runResult: current === result
      ? { ...result, ...patch }                          // owner still holds snapshot → safe
      : { ...(current ?? result), ...patch },             // owner replaced → preserve user state
    dirty,
  });
};
```

Closes the Round-5 caveat:

> "the 6 early-return set blocks (lines 334, 363, 384, 400, 419, 438) share the same theoretical race -- bounded/latent, deferred to v1.41.x PATCH"

The race is: between line 306's `const result = get().runResult` (snapshot) and any of the 6 set() calls, the user can click `Discard` (which creates a new `runResult` object). The pre-T1 set() calls would silently overwrite the user's Discard with the stale snapshot. Now they preserve the user's Discard and only layer the patch (`errorMessage` / `warnings`) on top.

### T2: N1 CLI dispatcher exhaustive check

**No code change.** Verified `src/cli/command-dispatcher.ts:54-70` switch on `parsed.kind` covers all 4 union members of `DispatchArgs = ParsedArgs | { kind: 'generate'; ... }`:

- `case 'read'`: `readHeadlessProject(parsed.input)`
- `case 'mutate'`: `mutateHeadlessProject(parsed.input)`
- `case 'validate'`: `validateHeadlessProject(parsed.input)`
- `case 'generate'`: `generateHeadlessProject(parsed.input)`

`pnpm exec tsc --noEmit -p tsconfig.json` reports no exhaustiveness warning. **N1 closed by verification only.**

### T3: L1 / L3 console.error inventory

**No code change.** `grep -rn 'console\.' src/ --include="*.ts" --include="*.tsx"` returns **0 results**. All error reporting migrated to `setError` Zustand store action (rendered as toast). Round-5 L1 + Round-1 L3 were both deferred-with-no-action-required; refactor over time (v1.36.x → v1.41.0) closed them automatically.

## Key design decisions

- **D1 — Helper extraction over inline copy (6x)** — DRY principle (common coding-style rule): don't duplicate 11-line re-check block 6 times. The closure-scoped helper `commitRunResult` is functionally equivalent but 1/6 the LoC.
- **D2 — Single commit for 6 fixes** — The 6 siblings have IDENTICAL semantics (re-check + apply patch). Bundling them into 1 T-level commit is appropriate for identical fixes. Distinct fixes (different semantics) would warrant per-fix T-level work.
- **D3 — Helper closure-scoped, NOT module-level** — The helper needs `result` (the snapshot) + `set` + `get` (closure). A module-level helper would require threading `result` as a parameter at every call site, defeating the DRY win.
- **D4 — `partial typeof result` for type safety** — The patch parameter is typed as `Partial<typeof result>` so callers can omit any subset of fields (`{ mutations: [] }` alone, or `{ mutations: [], warnings, errorMessage }` together). The merged spread is structurally safe at the type level.

## 1 commit on origin/main (T1 + T2/T3 verify-only)

| Commit    | Description                                                                  | Files changed |
| --------- | ---------------------------------------------------------------------------- | ------------- |
| `8261edb` | T1: extract `commitRunResult` helper in `useScriptStore.applyMutation` (closes 6 latent stale-state siblings) | 1 file |

T2 + T3 closed by verification only (no source change). 1 atomic commit total for the v1.41.2 PATCH.

## 1 NEW 1-of-1 lesson

`multi-occurrence-stale-state-fix-requires-helper-extraction-not-inline-copy` (T1) — When 6+ sibling set() blocks suffer the same race-condition fix, extract a closure-scoped helper rather than duplicating the re-check pattern inline 6x. The helper inherits the original `result` capture (closure scope) and the re-check semantics. Sub-pattern of `redux-zustand-store-async-mutation-must-recheck-state-before-final-set`: that lesson covers the SINGLE-fix case; this lesson covers the MULTI-FIX-CASE where the pattern is repeated across N early-return paths.

## Known follow-ups (out of scope)

- **v1.42.0 MINOR T0**: App.tsx (1375) + AppHeader.tsx (894) JSX refactor (deferred from v1.41.x T3)
- **bswmd/parse.ts** at 1196 LoC: accepted as known ceiling (ECUC builder chain shared-state coupling)
- **Shim removal sweep** (8 latent shim files, requires `moduleResolution: "node16"` migration)
- **Test mirroring** (6 monolithic test files, latent)
- **Pre-commit file-size hook** enforcement (deferred; candidate lesson `file-size-cap-must-be-enforced-in-pre-commit-hook`)

## Round-5 + Round-1 closure status

| Item                                              | Status                                   |
| ------------------------------------------------- | ---------------------------------------- |
| Round-5 H1 (useScriptStore.applyMutation)         | **CLOSED** (v1.41.0 T1)                  |
| Round-5 H1 caveat (6 latent siblings)             | **CLOSED** (v1.41.2 T1)                  |
| Round-5 M1 / M2 / M3 / M4 (i18n / dcm / script)    | **CLOSED** (v1.41.0 T1-T4)               |
| Round-5 L1 (console.error inventory)              | **CLOSED** (auto-closed, no code change) |
| Round-5 L2 (file-size backlog)                    | **CLOSED** (v1.41.x PATCH, 5/8 files)    |
| Round-5 L3 (file-size follow-up)                  | **CLOSED** (L1 equivalent, auto-closed)  |
| Round-5 N1 (CLI dispatcher exhaustive)            | **CLOSED** (verify-only, no code change) |
| Round-1 L8 (file-size cap)                       | **PARTIAL** (5/8 closed; 3 deferred)     |
| Round-1 M1-M4 / H1-H5                            | **CLOSED** (v1.36.0 - v1.40.0)           |
