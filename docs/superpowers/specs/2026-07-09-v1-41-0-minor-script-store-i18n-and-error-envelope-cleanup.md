# v1.41.0 MINOR — Script Store + i18n + Error Envelope Cleanup

**Author**: claude-AutosarCfg post-ship review controller
**Date**: 2026-07-09
**Status**: design (awaiting spec self-review + user approval)
**Baseline**: v1.40.0 MINOR `9a5ec8a` (3119 + 7 SKIP / 0 fail)
**Target:** 3126 + 7 SKIP / 0 fail (+7 net: 4 small fix tests + 3 dispatch + ship)

## Goal

Close the **1 HIGH + 3 MEDIUM** Round-5 deep code review findings (file:line verified) on the i18n / error-envelope / Zustand-stale-state axis. The 1 HIGH is `useScriptStore.applyMutation` capturing a stale `runResult` snapshot — a real silent-wrong-output race if the user clicks `Discard` mid-apply. The 3 MEDIUMs are 1-line fixes: locale validation, raw-throw envelope, fire-and-forget catch.

**LOW findings (L1 file-size backlog)**: deferred to a separate `v1.41.x file-size PATCH` (4 files > 800 LoC need a mechanical split, not bugfix scope).

## Background — what's actually broken

**H1 — applyMutation stale state race** (`useScriptStore.ts:305-457`):

```ts
applyMutation: async (): Promise<void> => {
  const result = get().runResult;            // line 306: snapshot #1
  ...
  // ... await window.autosarApi.projectSave (async)
  ...
  set({ runResult: { ...result, mutations: [], warnings } });  // line 451: writes stale `result`
```

If `discardMutation` runs between line 306 and line 451, the final `set` overwrites the user's Discard with stale data. Real silent wrong output.

**M2 — pickDirHandler locale validation** (`pickDirHandler.ts:36`):

```ts
const locale: Locale = req.locale ?? 'en';
```

Tampered preload passing `'fr'` crashes `t('fr', key)` because `MESSAGES_BY_LOCALE['fr']` is `undefined` (TypeScript's closed union `'zh-CN' | 'en'` doesn't catch the runtime input).

**M3 — dcmConfigHandler raw throw** (`dcmConfigHandler.ts:91-95`):

```ts
throw new Error(`Dcm BSWMD fixture not found via discovery. ...`);
```

Round-1 H1 mandate: every IPC handler returns `Result<T, E>`. The outer catch narrows on `instanceof DcmConfigError`; the raw `Error` falls through to `kind: 'unknown'` → generic toast, hiding the actionable message.

**M4 — runScript fire-and-forget** (`useScriptStore.ts:237-277` + `ScriptPanel.handleRun`):

```ts
// useScriptStore.ts:253
return result;
// ScriptPanel.tsx:123
void runScript(selectedId); // fire-and-forget
```

Unhandled rejection if the IPC layer throws (e.g. unmounted renderer mid-call).

## Architecture

### T1 — applyMutation stale state fix (H1)

In `src/renderer/store/useScriptStore.ts:450-457`, replace the unconditional `set({runResult: {...result, mutations: [], warnings}})` with a re-check:

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

The check `current === result` is identity-equality: if the store still holds the original snapshot reference, the user's `Discard` didn't happen, and we can clear mutations. If `Discard` happened, `current` is a new object and we preserve whatever state the user set (with the warnings update applied).

**Test** (1 NEW, in `useScriptStore.test.ts`):

- Mock `applyMutation` to be slow (return a delayed promise).
- Click `Commit` → `applyMutation()` starts; snapshot `result` captured.
- Before the IPC resolves, call `discardMutation()` (set runResult to a new object with mutations cleared).
- Resolve the IPC.
- Assert: `runResult` is the post-`discard` state, NOT the stale `result`.

### T2 — pickDirHandler locale validation (M2)

In `src/main/ipc/pickDirHandler.ts:36`:

```ts
// Before
const locale: Locale = req.locale ?? 'en';

// After
const locale: Locale = req.locale === 'zh-CN' ? 'zh-CN' : 'en';
```

**Test** (1 NEW, in `pickDirHandler.test.ts`):

- Pass `req.locale = 'fr'` → handler should fall back to 'en' without throwing.
- Pass `req.locale = 'zh-CN'` → handler uses 'zh-CN'.
- Pass `req.locale = undefined` → handler uses 'en'.

### T3 — dcmConfigHandler error envelope (M3)

In `src/main/ipc/dcmConfigHandler.ts:91-95`, convert the raw `throw new Error(...)` to a typed `DcmConfigError`:

```ts
// Before
throw new Error(`Dcm BSWMD fixture not found via discovery. ...`);

// After
throw new DcmConfigError({
  kind: 'no-dcm-bswmd-fixture',
  message: `Dcm BSWMD fixture not found via discovery. Searched from cwd='${process.cwd()}' and from ODX dir='${pathResolve(odxPath, '..')}'. Expected '<some-dir>/samples/arxml/demo-ecu/bswmd/Bsw_Dcm_Bswmd.arxml' (T1 demo-ecu fixture).`,
});
```

**Tests** (1 NEW, in `dcmConfigHandler.test.ts`):

- Pass an ODX path that triggers the fixture-not-found branch → handler returns `{ ok: false, error: { kind: 'no-dcm-bswmd-fixture', message: ... } }` (not the generic `kind: 'unknown'` bucket).
- Pass a valid ODX + valid BSWMD → handler returns the expected success envelope (regression check).

### T4 — runScript fire-and-forget catch (M4)

In `src/renderer/components/ScriptPanel/ScriptPanel.tsx:123`:

```ts
// Before
const handleRun = (): void => {
  if (selectedId === null) return;
  void runScript(selectedId); // fire-and-forget
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

**Test** (1 NEW, in `ScriptPanel.test.tsx`):

- Mock `runScript` to reject with `new Error('IPC layer failure')`.
- Click `Run` button.
- Assert: `console.error` is called with the rejection.
- Assert: no unhandled rejection escapes to the test runner.

## Components & Files Touched

| Layer               | File                                                       | Change               |
| ------------------- | ---------------------------------------------------------- | -------------------- |
| renderer/store      | `src/renderer/store/useScriptStore.ts`                     | T1 stale state fix   |
| renderer/store      | `src/renderer/store/useScriptStore.test.ts`                | T1 1 NEW test        |
| main/ipc            | `src/main/ipc/pickDirHandler.ts`                           | T2 locale validation |
| main/ipc            | `src/main/ipc/__tests__/pickDirHandler.test.ts`            | T2 1 NEW test        |
| main/ipc            | `src/main/ipc/dcmConfigHandler.ts`                         | T3 envelope          |
| main/ipc            | `src/main/ipc/__tests__/dcmConfigHandler.test.ts`          | T3 1 NEW test        |
| renderer/components | `src/renderer/components/ScriptPanel/ScriptPanel.tsx`      | T4 catch             |
| renderer/components | `src/renderer/components/ScriptPanel/ScriptPanel.test.tsx` | T4 1 NEW test        |
| docs                | `docs/release-notes/v1.41.0/README.md` (NEW)               | release notes        |
| docs                | `CHANGELOG.md`                                             | v1.41.0 row          |

## Key Design Decisions

| #   | Decision                                                              | Rationale                                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **T1 identity-equality check** (`current === result`)                 | The original snapshot reference is unique to `applyMutation`. If the user calls `discardMutation`, it creates a new object; the snapshot reference is no longer in the store.                                     |
| D2  | **T2 `req.locale === 'zh-CN' ? 'zh-CN' : 'en'`** (ternary, not a Set) | Matches the project's locale narrowing pattern used in 5+ renderer-side places. Future locale additions update the ternary + the `Locale` type.                                                                   |
| D3  | **T3 new DcmConfigError kind** (vs reusing `read-failed`)             | The Round-3 lesson `error-classification-via-regex-prefix-vs-envelope-kind-trade-off` recommends distinct kinds for distinct failure modes. "No fixture" is a project-packaging concern, not a file-read concern. |
| D4  | **T4 `console.error` in catch** (not `console.warn`)                  | Unhandled IPC rejection is a programmer error (the contract should be tight enough that rejections are rare). `console.error` is the convention for this layer.                                                   |
| D5  | **T1 test design** (mock slow IPC + click Discard)                    | Matches the reviewer's repro. Forces the snapshot-vs-current state divergence.                                                                                                                                    |
| D6  | **M1 + L1 (file-size) deferred to v1.41.x file-size PATCH**           | Different scope (mechanical split, not bugfix). User-reviewed as a separate dispatch.                                                                                                                             |

## Testing Strategy

| Test surface                             | Coverage            | Δ tests    |
| ---------------------------------------- | ------------------- | ---------- |
| `useScriptStore.test.ts` (UPDATE)        | T1 stale state      | +1         |
| `pickDirHandler.test.ts` (UPDATE or NEW) | T2 locale fall-back | +1         |
| `dcmConfigHandler.test.ts` (UPDATE)      | T3 envelope         | +1         |
| `ScriptPanel.test.tsx` (UPDATE)          | T4 catch            | +1         |
| **Total**                                |                     | **+4 net** |

Baseline 3119 + 7 → **3123 + 7 SKIP / 0 fail** (target 3126; spec's +7 was wrong by 3; real is +4).

## Risks & Mitigations

| Risk                                                             | Mitigation                                                                                                              |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| T1 test races with the actual store timing                       | Use `vi.useFakeTimers()` + `vi.advanceTimersByTime` to control the async resolution order.                              |
| T2 locale ternary is non-exhaustive (TS doesn't narrow on `===`) | The explicit ternary is more readable than a `Set.has` check + keeps the Locale type closed.                            |
| T3 `DcmConfigError` constructor signature                        | Read `dcmConfigHandler.ts` to confirm the existing error class shape; the new kind may need a new variant in the union. |
| T4 `console.error` lint rule                                     | Add `eslint-disable-next-line no-console` per existing pattern.                                                         |
| Existing 4 files > 800 LoC                                       | Out of scope; tracked in v1.41.x file-size PATCH.                                                                       |

## Tasks (4 + 1 ship)

```
T1: H1 — useScriptStore stale state fix
T2: M2 — pickDirHandler locale validation
T3: M3 — dcmConfigHandler envelope
T4: M4 — runScript fire-and-forget catch
T5: docs release artifacts + ship
```

5 tasks total, Subagent-Driven execution.

## Global Constraints

(Inherit from v1.40.x + v1.39.x + v1.38.x + v1.37.x series.)

- All modified/new files end with trailing newline.
- No `console.log` in production code; `console.warn` / `console.error` allowed for defensive warnings (with `eslint-disable-next-line no-console` per project convention).
- 中文 for user-facing/business comments; 英文 for technical API/protocol/comments per CLAUDE.md.
- Subagent-driven execution; one implementer per task.
- Each task ends with its own test running and passing.
- Exact values (file paths, error kind strings, function signatures) MUST match this spec verbatim.
- Implementer MUST dispatch `pkm-capture` autonomously when work is capture-worthy (per v1.38.0 lesson `brief-explicit-must-not-clause-is-overridden-by-implementer-judgment-when-content-is-genuinely-capture-worthy`).
- Implementer MUST NOT make destructive git operations (`reset --hard`, `push --force`) on `origin/main`.
- **`pnpm verify` 7-stage MUST pass after every T** (per v1.40.0 T3 lesson `pre-flight-lint-must-be-7-stage-at-every-t-level`).

## Out of Scope (deferred to v1.41.x file-size PATCH)

- M1 (bswmd.ts 1531 LoC → split into bswmd/ directory)
- L1 (mutation.ts 1407 LoC + App.tsx 1375 LoC → split)
- validate.ts 1019 LoC (related to the M1 split)
- 6 file > 800 LoC backlog from Round-1 L8 (already addressed in the new lesson `file-size-backlog-recurs-every-patch-cycle-without-deliberate-patch`)

## Reverse-Closes

Closes Round-5 deep code review's 4 of 8 actionable findings (1 HIGH + 3 MEDIUM). 2 LOW + 1 NOTE deferred (L1 file-size backlog → separate PATCH; L2 console.error inventory → inventory PATCH; N1 confirmed clean).

## Lessons (NEW from this MINOR, candidates)

1. `redux-zustand-store-async-mutation-must-recheck-state-before-final-set` (H1) — pre-captured by Round-5 review.
2. `ipc-handler-locale-input-must-validate-or-default` (M2) — pre-captured by Round-5 review.
3. `file-size-backlog-recurs-every-patch-cycle-without-deliberate-patch` (M1 + L1) — pre-captured by Round-5 review. Drives the deferred file-size PATCH decision.

## Cross-references

- Round-5 review topic: `01-Projects/claude-AutosarCfg/development/code-review-round-5-i18n-locale-process-hygiene-2026-07-09.md`
- v1.40.0 plan: `docs/superpowers/plans/2026-07-09-v1-40-0-minor-ipc-size-cap-parity-and-launcher-stale-closure.md` (parent MINOR; closes Round-4 findings)
- v1.40.0 T3 lesson `pre-flight-lint-must-be-7-stage-at-every-t-level` (T-level pnpm verify rule)
