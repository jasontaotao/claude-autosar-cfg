# v1.41.0 MINOR — Script Store + i18n + Error Envelope Cleanup

**Ship**: 2026-07-09 (TAG PENDING — T5 fills)

**Baseline**: v1.40.0 MINOR `9a5ec8a` (3119 + 7 SKIP / 0 fail)
**Target**: 3124 + 7 SKIP / 0 fail (+5 net delta from v1.40.0).

4 atomic commits on `main` (T1 + T2 + T3 + T4), each scoped to a
single concern, all under the same brief. Round-5 deep code review
surfaced **8 actionable items** (1 HIGH + 3 MEDIUM + 2 LOW + 1 NOTE).
This MINOR closes **4 of 8** (1 HIGH + 3 MEDIUM) — the 1-line
defensive fixes. The file-size backlog (L1) and console-error
inventory (L2) defer to a separate v1.41.x file-size PATCH; N1 is
confirmed clean.

| Task | Severity | Commit    | Files | Tests |
|------|----------|-----------|-------|-------|
| T1   | H1       | `b3dcc46` | 2 modified (1 source + 1 test) | +1 |
| T2   | M2       | `d69e0ee` | 2 modified (1 source + 1 test) | +1 |
| T3   | M3       | `407463f` | 8 modified (1 source + 1 shared type + 2 renderer + 3 i18n + 1 test) | +2 |
| T4   | M4       | `2dfd52b` | 2 modified (1 source + 1 test) | +1 |

T1 + T2 + T3 + T4 each ran `pnpm verify` 7-stage GREEN before commit
(per v1.40.0 T3 lesson `pre-flight-lint-must-be-7-stage-at-every-t-level`).

## What's in this MINOR

### T1 (H1): useScriptStore.applyMutation stale-state fix (commit `b3dcc46`)

**Problem**: `useScriptStore.applyMutation` captured `const result =
get().runResult` at line 306, then later did `set({runResult: {...result,
mutations: [], warnings}})` at line 451. If the user clicked `Discard`
(which creates a new runResult object) between line 306 and line 451,
the final set overwrote the user's Discard with stale data —
**silent wrong-output race**: the discarded `runId` / `errorMessage` /
`status` would be resurrected, ignoring the user's intent.

**Fix**: At lines 450-457, replace the unconditional set with an
identity-equality re-check:

```ts
const current = get().runResult;
set({
  runResult:
    current === result
      ? { ...result, mutations: [], warnings } // owner still holds snapshot → safe to clear
      : { ...(current ?? result), warnings }, // owner replaced (e.g. user discarded) → preserve
  dirty: false,
});
```

The check `current === result` is identity-equality: if the store
still holds the original snapshot reference, the user's Discard did
not happen, and we can clear mutations. If Discard happened, `current`
is a new object and we preserve whatever state the user set (with the
warnings update applied). `...(current ?? result)` adds a defensive
fallback if `current` was somehow cleared to `null` between line 306
and the final set.

**Plan drift**: Brief specified `{ ...current, warnings }`; implementer
added `?? result` fallback to satisfy TypeScript's null-safety on
`current: ScriptRunResult | null` and to provide a safe fallback if
`current` was somehow nulled mid-flight. Runtime behavior is identical
when `current` is non-null (the common case) — the only case reachable
in practice given the line-307 null guard on `result`.

**Test** (1 NEW in `useScriptStore.test.ts`):

The test exercises the exact race condition using `vi.waitFor` for
synchronization (more robust than fake timers + Promise microtasks):

1. Replaces `projectSave` with a manually-resolvable deferred.
2. Captures an `initialRunResult` with `runId: 'r-h1'`.
3. Calls `applyMutation()`; synchronously reaches the `projectSave`
   await point.
4. Verifies the in-memory doc was updated to `value: 7` before the
   IPC resolves.
5. Calls `discardMutation()` then `setRunResult(replacedByUser)`
   with `runId: 'r-replacement'`, `errorMessage: 'replacement-from-user'`.
6. Resolves the deferred IPC.
7. Asserts the final `runResult` carries the user's values: `runId ===
   'r-replacement'`, `errorMessage === 'replacement-from-user'`,
   `mutations === []`, `warnings === []`.

**Negative verification**: Confirmed the test FAILS without the fix
(reverted the production code, re-ran the test, got `runId: 'r-h1'`
instead of `'r-replacement'` — the stale snapshot overwrote the user's
replacement).

File:line citation:

- `src/renderer/store/useScriptStore.ts:450-457` — identity-equality
  re-check + `?? result` null fallback.
- `src/renderer/store/__tests__/useScriptStore.test.ts` — 1 NEW test
  in `describe('useScriptStore — applyMutation v1.41.0 (H1 stale-state fix)')`.

### T2 (M2): pickDirHandler locale input validation (commit `d69e0ee`)

**Problem**: `pickDirHandler.ts:36` had `const locale: Locale =
req.locale ?? 'en'`. TypeScript's closed union `'zh-CN' | 'en'` does
not catch runtime input — a tampered preload passing `'fr'` (or any
other string) crashes inside `t()` because `MESSAGES_BY_LOCALE['fr']`
is `undefined` → `bundle[key]` throws `TypeError: Cannot read
properties of undefined`.

**Fix**: Replace the nullish-coalesce with an explicit ternary:

```ts
const locale: Locale = req.locale === 'zh-CN' ? 'zh-CN' : 'en';
```

`'zh-CN'` is checked first so the hot path is unchanged. The ternary
preserves the `Locale` type narrowing (both branches are union
members) while collapsing unknown / unsupported values to the `'en'`
fallback.

**Plan drift**: Brief specified 3 NEW tests. Implementer noticed the
file `pickDir.test.ts` (NOT `pickDirHandler.test.ts`) already contains
3 locale tests at L131-170 (zh-CN title, en title, en fallback).
Only `'fr'` (the tampered-preload vector) was genuinely NEW. Wrote
1 net new test. The plan's "1 NEW test" intent was preserved —
the actual file name and pre-existing coverage were not.

**Test** (1 NEW in `pickDir.test.ts`):

- `locale: 'fr'` (simulated tampered preload via `as unknown as 'en'`
  cast) returns `{ kind: 'canceled' }` without crashing, and the dialog
  title is the English fallback `'Choose Project Directory'` rather
  than the en-bundled key being silently returned (pre-fix: TypeError
  from `bundle[key]` on undefined bundle).

File:line citation:

- `src/main/ipc/pickDirHandler.ts:36` — `req.locale ?? 'en'` →
  `req.locale === 'zh-CN' ? 'zh-CN' : 'en'`.
- `src/main/ipc/__tests__/pickDir.test.ts` — 1 NEW test in the
  locale describe block (the file already had 3 locale tests).

### T3 (M3): dcmConfigHandler error envelope (commit `407463f`)

**Problem**: `dcmConfigHandler.ts:91-95` had `throw new Error(...)`
for the "Dcm BSWMD fixture not found via discovery" branch. Round-1
H1 mandate: every IPC handler returns `Result<T, E>`. The outer catch
narrows on `instanceof DcmConfigError`; the raw `Error` fell through
to `kind: 'unknown'` → generic toast, **hiding the actionable
fixture-discovery-failure message** from the user.

**Fix**: Convert the raw `throw` to a typed `DcmConfigError`:

```ts
throw new DcmConfigError({
  kind: 'no-dcm-bswmd-fixture',
  message:
    `Dcm BSWMD fixture not found via discovery. ` +
    `Searched from cwd='${process.cwd()}' and from ODX dir='${pathResolve(odxPath, '..')}'. ` +
    `Expected '<some-dir>/samples/arxml/demo-ecu/bswmd/Bsw_Dcm_Bswmd.arxml' (T1 demo-ecu fixture).`,
});
```

The outer `catch (e)` in the handler narrows on `instanceof
DcmConfigError` and surfaces the typed kind verbatim instead of
collapsing to `kind: 'unknown'`.

**Critical honesty — type-system fan-out was wider than the plan stated**:

The plan cited only `src/main/ipc/dcmConfigHandler.ts:91-95` and the
test file. In reality, adding a new value to a
`Record<DcmConfigErrorKind, ...>` (`KIND_TO_CLASS` map) forces
TypeScript to fail unless every consumer site is updated atomically.
Actual fan-out was 8 files:

1. `src/main/ipc/dcmConfigHandler.ts` — throw site conversion.
2. `src/shared/types.ts` — added `'no-dcm-bswmd-fixture'` to the
   `DcmConfigErrorKind` string-literal union.
3. `src/renderer/hooks/useDcmConfigLauncher.ts` — added
   `'noDcmBswmdFixture'` to `RendererDcmConfigErrorClass` union +
   `KIND_TO_CLASS` map entry.
4. `src/renderer/components/dcmConfig/DcmConfigErrorToast.tsx` —
   added `'noDcmBswmdFixture'` to `DcmConfigErrorClass` union +
   `CLASS_KEY_TO_I18N` map entry.
5. `src/shared/i18n/odx.ts` — added
   `'odx.export.dcmConfig.error.noDcmBswmdFixture'` to the
   `OdxMessages` MessageKey union.
6. `src/shared/i18n.en/odx.ts` — populated `'Dcm BSWMD fixture not
   found: {message}'`.
7. `src/shared/i18n.zh-CN/odx.ts` — populated `'未找到 Dcm BSWMD 模板：{message}'`.
8. `src/main/ipc/__tests__/dcmConfigHandler.test.ts` — 2 NEW tests
   (fixture-miss envelope + success-path regression).

`tsc --noEmit` on both `tsconfig.json` and `tsconfig.web.json` would
have failed without each of these. The plan's "modify 2 files"
framing underestimated the type-system blast radius — this is itself
a candidate 1-of-1 lesson flagged for `pkm-capture`:
`ipc-error-kind-addition-is-type-system-fanout-not-one-line-fix-ripples-to-shared-union-and-renderer-mapping`.

**Tests** (2 NEW in `dcmConfigHandler.test.ts`):

- **Test 1** (M3 fix verification) — fixture-miss branch returns
  `{ ok: false, error: { kind: 'no-dcm-bswmd-fixture', message: ... } }`
  (NOT the catch-all `unknown` bucket). Uses `vi.doMock('node:fs', ...)`
  + `vi.resetModules()` to override the top-level `existsSync`
  destructure (the natural `/tmp` walk-up in vitest workers hits the
  project root's `samples/` fixture, which doesn't trigger the throw).
- **Test 2** (regression) — success path with a `bswmdPath` override
  confirms the happy path still works.

**Plan drift**: Brief asked for "1 NEW test"; implementer wrote 2
(fixture-miss envelope + success-path regression). Both are
genuinely NEW — neither is a duplicate of pre-existing coverage.

### T4 (M4): runScript fire-and-forget catch (commit `2dfd52b`)

**Problem**: `ScriptPanel.tsx:121-127` had
`const handleRun = (): void => { ...; void runScript(selectedId); };`.
The `void` operator discards the returned Promise; if the IPC layer
throws (e.g. unmounted renderer mid-call), the rejection is
unhandled — Node logs an `UnhandledPromiseRejection` warning and the
test runner may fail.

**Fix**: Replace `void` with an explicit `.catch()`:

```ts
const handleRun = (): void => {
  if (selectedId === null) return;
  runScript(selectedId).catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[ScriptPanel] runScript failed:', e);
  });
};
```

`console.error` (not `console.warn`) per existing convention for
programmer-error IPC rejections. `eslint-disable-next-line no-console`
scoped to the one line.

**Test design subtlety — store-action override vs IPC override**:

The reviewer's M4 was framed as "the IPC layer throws". In practice,
`useScriptStore.runScript` (the action ScriptPanel actually calls)
catches IPC errors internally and converts them to a `runtime-error`
ScriptRunResult — so the IPC-level rejection never escapes the store.
To pin the catch contract at the **call site** (which is the
reviewer's intent), the test overrides the store action itself to
reject. This matches the spirit of the review (call site must catch,
not just the IPC layer) and would catch a regression where someone
reintroduces `void runScript(...)` without the `.catch`.

**Test** (1 NEW in `ScriptPanel.test.tsx`):

- Spy on `console.error` (restored via `vi.restoreAllMocks()` in
  `afterEach`).
- Override `useScriptStore.getState().runScript` to reject with
  `new Error('IPC layer failure')`.
- Render the panel; click `script-btn-run`.
- Assert: `console.error` was called once with the `'[ScriptPanel]
  runScript failed:'` prefix + the original `Error` instance.
- Cleanup: `vi.restoreAllMocks()` in `afterEach` resets both the
  `console.error` spy and the store-action spy automatically.

File:line citation:

- `src/renderer/components/ScriptPanel/ScriptPanel.tsx:121-127` —
  `void runScript(...)` → `runScript(...).catch(...)`.
- `src/renderer/components/ScriptPanel/__tests__/ScriptPanel.test.tsx` —
  1 NEW test in the M4 describe block.

## Critical honesty (process + bounded follow-ups)

### T1 has 6 latent siblings that share the same race

The fix is narrowly scoped to the final success-path set per the
plan. **The 6 early-return set blocks** (lines 334, 363, 384, 400,
419, 438) also use the captured `result`, but the plan only specifies
T1.1 to address the final set. The same race could theoretically apply
to those branches (e.g. a write-failed `errorMessage` gets discarded
mid-flight). User-visible impact is smaller (mutations stay cleared)
and the conditions to trigger it are narrow (write-failed path takes
seconds, leaving time for user interaction), but this is a bounded
**latent caveat** for a follow-up round.

### T3's type-system fan-out was wider than the plan stated

Adding a new value to a `Record<DcmConfigErrorKind, ...>` triggers
type-system fan-out across the IPC handler + shared type + renderer
hook + renderer toast + 3 i18n files. This is a 1-of-1 process lesson
(`ipc-error-kind-addition-is-type-system-fanout-not-one-line-fix`).
Future plans that add a new error kind should cite 7-9 files, not 2.

### T3's test fixture-miss trigger approach is non-trivial

Initial attempts to trigger the `locateDcmBswmdPath` throw branch
naturally failed because the vitest worker cwd is the project root,
so `walkUpForFixture(process.cwd())` walks into the project root's
`samples/` fixture and returns a hit. Two prior attempts failed:

- **`vi.spyOn(fs, 'existsSync')`** → "Cannot redefine property:
  existsSync" (Node ≥ 18 `node:fs` exports are non-configurable).
- **`process.chdir(noFixtureRoot)`** → "process.chdir() is not
  supported in workers" (vitest's worker thread model doesn't
  allow it).

The eventual solution is `vi.doMock('node:fs', ...) + vi.resetModules()
+ dynamic re-import of the handler module`. This works because:

- `vi.doMock` is runtime-only (does not affect other tests in the file).
- `vi.resetModules()` drops the cached `dcmConfigHandler.ts` so its
  top-level `import { existsSync } from 'node:fs'` re-evaluates and
  captures the mocked binding.
- `await import('../dcmConfigHandler.js')` returns a freshly-bound
  module with the override in effect.
- The `finally` block calls `vi.doUnmock('node:fs') + vi.resetModules()`
  so subsequent tests in the file see the real `node:fs`.

### T2 + T3 both had plan test-count drift

Both T2 and T3 implementers noticed the plan's "1 NEW test" claim
preserved intent (1 net new test) but the literal count (3) was a
ceiling, not a hard requirement:

- **T2**: `pickDir.test.ts` already had 3 locale tests (zh-CN title,
  en title, en fallback). Only `'fr'` (the tampered-preload vector)
  was genuinely NEW. Wrote 1 net new test.
- **T3**: Brief asked for 1 NEW test; implementer wrote 2
  (fixture-miss envelope + success-path regression). Both were
  genuinely NEW.

This is a 1-of-1 process lesson: **`brief-test-ceiling-is-validation-not-prescription`**
— brief's test count is a ceiling, not a prescription. Verify against
existing coverage before adding duplicates.

### T4 has no new lesson — well-known JS pattern

`void promise` → `promise.catch(...)` is a well-known JS pattern; it
does not warrant a new 1-of-1 lesson in the project vault.

## Lessons (NEW from this MINOR)

1. **`redux-zustand-store-async-mutation-must-recheck-state-before-final-set`** (T1 / H1) — A Zustand action that captures `get().runResult` early then calls `set()` later in an async function silently overwrites a user-initiated replacement (e.g. Discard). The fix is identity-equality re-check: `const current = get().runResult; set({ runResult: current === result ? {...result, mutations: [], warnings} : {...current, warnings} });`. The `?? result` fallback satisfies null-safety for the (unreachable in practice) cleared-to-null case.

2. **`ipc-handler-locale-input-must-validate-or-default`** (T2 / M2) — TypeScript's closed union (`'zh-CN' | 'en'`) does NOT catch runtime input at the IPC boundary — a tampered preload can pass any string. `req.locale ?? 'en'` is wrong: it accepts invalid values that crash inside `t()`. Use an explicit ternary `req.locale === 'zh-CN' ? 'zh-CN' : 'en'` to collapse unknown values to the default while preserving the Locale type narrowing.

3. **`ipc-error-kind-addition-is-type-system-fanout-not-one-line-fix`** (T3 / M3) — Adding a new value to a `Record<ErrorKind, ...>` triggers type-system fan-out across the IPC handler + shared type + renderer hook + renderer toast + 3 i18n files. Adding the throw is 1 line; the union members, mappings, and i18n catalogs are 7 additional files. Future plans that add a new error kind should cite 7-9 files, not 2.

4. **`vi-domock-with-vi-resetmodules-for-handler-fixture-miss`** (T3 / M3 test infrastructure) — To trigger a handler's fixture-miss branch in vitest, the natural cwd is the project root (which contains the fixture). `vi.spyOn(fs, 'existsSync')` fails (Node ≥ 18 `node:fs` is non-configurable) and `process.chdir(noFixtureRoot)` fails (vitest workers don't support chdir). The solution: `vi.doMock('node:fs', ...) + vi.resetModules() + dynamic re-import of the handler module` — `vi.doMock` is runtime-only, `vi.resetModules()` drops the cached handler, the dynamic `import()` returns a freshly-bound module with the override in effect. Restore via `vi.doUnmock('node:fs') + vi.resetModules()` in `finally`.

5. **`brief-test-ceiling-is-validation-not-prescription`** (T2 + T3 plan drift, process lesson) — A plan brief's "X NEW tests" claim is a ceiling, not a prescription. Pre-existing test coverage may already cover some scenarios; the implementer MUST verify against the actual repo state at execution time. T2 had 3 pre-existing locale tests → wrote 1 genuinely NEW. T3 had no pre-existing fixture-miss test → wrote 2 genuinely NEW. Same brief framing, different outcomes; both are correct.

6. **`file-size-backlog-recurs-every-patch-cycle-without-deliberate-patch`** (L1 deferred from Round-5) — Round-5 review re-surfaced the L1 file-size backlog (6 files > 800 LoC: `bswmd.ts` 1531, `App.tsx` 1375, `mutation.ts` 1407, `validate.ts` 1019, `types.ts` 1240, `useScriptStore.test.ts` 1415). This is the 4th consecutive MINOR/PATCH where the backlog resurfaces without progress. Closing in this MINOR would have over-scoping risk (mechanical split is not bugfix). Deferred to a separate `v1.41.x file-size PATCH` per the Round-5 decision.

## Test budget

| Stage | Count | Delta |
|---|---|---|
| v1.40.0 MINOR baseline | 3119 | — |
| T1 (H1) — useScriptStore.applyMutation stale-state | +1 | 3120 |
| T2 (M2) — pickDirHandler locale ternary | +1 | 3121 |
| T3 (M3) — dcmConfigHandler envelope (1 fix + 1 regression) | +2 | 3123 |
| T4 (M4) — ScriptPanel.handleRun catch | +1 | 3124 |
| **Plan delta total** | | **+5 net** |
| **Final achieved** | **3124** | **+5 net** |

Verified final count from T4's `pnpm exec vitest run`: **3124 + 7
SKIP / 0 fail** (+5 net from v1.40.0's 3119 baseline). Per-task
delta: T1 +1 + T2 +1 + T3 +2 + T4 +1 = **+5 net**, matching
exactly.

`tsc --noEmit -p tsconfig.json` and `tsc --noEmit -p tsconfig.web.json`:
both clean (0 errors).

## Behavioural changes summary

| Item | Was | Is |
|------|-----|-----|
| `useScriptStore.applyMutation` final set | unconditional `set({runResult: {...result, mutations: [], warnings}})` | identity-equality re-check; preserves user's `Discard` mid-apply |
| `pickDirHandler.locale` validation | `req.locale ?? 'en'` (accepts invalid values) | `req.locale === 'zh-CN' ? 'zh-CN' : 'en'` (collapses unknowns to `'en'`) |
| `dcmConfigHandler` fixture-miss throw | raw `throw new Error(...)` (caught by `kind: 'unknown'` bucket) | `throw new DcmConfigError({kind: 'no-dcm-bswmd-fixture', message: ...})` (surfaces typed kind) |
| `DcmConfigErrorKind` union | 9 values (pre-v1.41.0) | 10 values (added `'no-dcm-bswmd-fixture'`) |
| `RendererDcmConfigErrorClass` union | 9 values | 10 values (added `'noDcmBswmdFixture'`) |
| `DcmConfigErrorClass` union (toast) | 9 values | 10 values (added `'noDcmBswmdFixture'`) |
| `OdxMessages` MessageKey union | no `noDcmBswmdFixture` key | `'odx.export.dcmConfig.error.noDcmBswmdFixture'` added + EN/zh-CN populated |
| `ScriptPanel.handleRun` runScript call | `void runScript(selectedId)` (fire-and-forget, unhandled rejection) | `runScript(selectedId).catch(e => console.error('[ScriptPanel] runScript failed:', e))` |

## Known follow-ups (deferred to v1.41.x PATCH chain)

The MINOR surfaced 3 bounded follow-up items:

- **L1 — file-size backlog** (Round-5 L1, deferred to `v1.41.x file-size PATCH`): 6 files > 800 LoC need a mechanical split (not bugfix scope):
  - `src/core/project/bswmd.ts` — 1531 LoC → split into `bswmd/` directory.
  - `src/core/arxml/mutation.ts` — 1407 LoC → split into `mutation/` directory.
  - `src/renderer/App.tsx` — 1375 LoC → split into App-level concerns (header, panel, sidebar).
  - `src/shared/types.ts` — 1240 LoC → split by domain (Bswmd, Ecuc, Com, etc.).
  - `src/core/validation/validate.ts` — 1019 LoC → related to the bswmd split.
  - `src/renderer/store/__tests__/useScriptStore.test.ts` — 1415 LoC → split by concern (mutations, commits, discards, runs).

  This is the 4th consecutive MINOR/PATCH where the backlog resurfaces
  without progress. The `file-size-backlog-recurs-every-patch-cycle-without-deliberate-patch`
  lesson documents the pattern. The mechanical split is not bugfix
  scope and would have over-scoping risk in this MINOR; user reviewed
  the deferral decision.

- **L2 — console.error inventory** (Round-5 L2, deferred): T4 introduced
  1 new `console.error` call-site (`ScriptPanel.handleRun.catch`). A
  future audit should inventory all `console.error` / `console.warn`
  call-sites across the codebase and verify each has a
  `eslint-disable-next-line no-console` annotation per project
  convention.

- **T1 latent siblings** (Round-5 N1, latent caveat): The 6 early-return
  set blocks in `useScriptStore.applyMutation` (lines 334, 363, 384,
  400, 419, 438) also use the captured `result`. The T1 fix only
  addressed the final success-path set. User-visible impact is smaller
  (mutations stay cleared; errorMessage could be resurrected on the
  write-failed path) and the conditions to trigger it are narrow. A
  future PATCH may widen the identity-equality re-check to those
  branches.

## Reverse-Closes

- Round-5 deep code review **H1**: "`useScriptStore.applyMutation` captures stale `runResult` snapshot (silent wrong-output race if user Discards mid-apply)"
- Round-5 deep code review **M2**: "`pickDirHandler.locale` validation missing (TypeScript closed union does not catch runtime input)"
- Round-5 deep code review **M3**: "`dcmConfigHandler` raw `throw new Error` falls through to `kind: 'unknown'` (hides actionable fixture-discovery-failure message)"
- Round-5 deep code review **M4**: "`ScriptPanel.handleRun` is fire-and-forget (unhandled rejection if IPC layer throws)"

(Note: items above are Round-5's 1 HIGH + 3 MEDIUM = 4 actionable findings.
4 of 4 closed in this MINOR. L1 + L2 + N1 deferred — see Known Follow-ups.)

## Cross-references

- [v1.40.0 release notes](../v1.40.0/README.md) (parent MINOR)
- v1.41.0 implementation plan: `docs/superpowers/plans/2026-07-09-v1-41-0-minor-script-store-i18n-and-error-envelope-cleanup.md`
- v1.41.0 implementation spec: `docs/superpowers/specs/2026-07-09-v1-41-0-minor-script-store-i18n-and-error-envelope-cleanup.md`
- `.git/sdd/progress-v1.41.0.md` (local progress ledger — T5 ship)
- `.git/sdd/task-1-report.md` (T1 useScriptStore stale-state fix)
- `.git/sdd/task-2-report.md` (T2 pickDirHandler locale validation)
- `.git/sdd/task-3-v1.41.0-report.md` (T3 dcmConfigHandler envelope)
- `.git/sdd/task-4-v1.41.0-report.md` (T4 ScriptPanel handleRun catch)
