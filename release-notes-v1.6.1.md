# claude-AutosarCfg v1.6.1 SHIPPED

## Source

- Repo: <https://github.com/jasontaotao/claude-autosarcfg>
- Tag: `v1.6.1`
- Commits since v1.6.0: **12**
- HEAD: `101335b`

## What's in this release

### Sprint 17 P3 + P4 — BSWMD remove-from-disk UI complete

| Phase | What | Why |
| --- | --- | --- |
| **P3 T3.1** | ProjectPanel `<li>` right-click context menu | Per-row entry point for the 4-option dialog (matches the existing cascade-delete UX). |
| **P3 T3.2** | Tree `kind:'module'` forwarding | Same right-click flow for module nodes in the left-panel tree. |
| **P3 T3.3** | ContextMenu "Remove module" item + App.tsx router + i18n | Single action type `'remove-module'` plumbed through the existing Sprint 16 router. |
| **P3 T3.4** | LeftPanel `×` button rewire | `removeBswmdWithGuard` (pre-Sprint-17 silent removal) → `removeBswmdWithFullFlow` (4-option dialog). Single source of truth across UI entry points. |
| **P4 T4.1** | `removeBswmd.fullFlow.test.tsx` integration test | 6 tests drive the hook against the mounted `RemoveModuleConfirmRoot`: all 4 dispatch paths + partial-failure + undo round-trip. |
| **P4 T4.2** | `remove-bswmd.spec.ts` Playwright E2E | Add BSWMD → right-click → cascade. |
| **P4 T4.3** | `remove-bswmd-from-disk.spec.ts` Playwright E2E | cascade-and-unlink disk verification via `fs.stat`. |

### v1.6.0 deferred #1 — SWS Validator runner hook

`src/renderer/hooks/useSwsValidatorRunner.ts` (49 lines): debounced 300ms subscription to `useArxmlStore` doc + dirtyPaths. Calls `useSwsValidatorStore.run()` after the quiet period. Mounted once at App level. Gated on `experimental.swsValidator` feature flag — no-op when OFF (per G spec §2 G5). Closes the v1.6.0 release-note caveat "no GUI caller exists yet". 4 new tests.

### v1.6.0 deferred #2 — A+C CLI `mutate` real applyMutation

New renderer-agnostic core engine `src/core/mutation/applyPatchSteps.ts` (533 lines). Maps the A+C patch wire format to existing mutation primitives:

| Wire op | Backend |
| --- | --- |
| `set-param` | `setParamInDocument` (Sprint 14-era in-place; pre/post value snapshots detect "did anything change?") |
| `add-child` | `coreAddContainer` + BSWMD multiplicity check (requires `moduleDef` in `ApplyContext`) |
| `remove-with-cascade` | `coreRemoveWithCascade` (refuses `cascade: false` with `cascade-required` error — CLI has no dialog) |
| `add` / `remove` / `replace` (RFC 6902 subset) | `add` delegates to `add-child`; `remove` delegates to `coreRemoveWithCascade`; `replace` finds the param + sets the value |

**Code-reviewer found a CRITICAL bug in the initial ship**: `add` was a silent no-op (returned `{doc, error: null}` without mutating), causing the dispatcher to count `applied: 1` for a step that did nothing. Fixed in `101335b` — now delegates to `add-child` (extracts `shortName` / `SHORT-NAME` from `value`, returns `patch-invalid` for malformed payloads).

Atomic disk write via existing `writeAtomic` helper. 19 new tests (14 unit + 5 integration). 4 new integration tests use temp-copied fixture (CI-safe + parallel-safe).

### Archive housekeeping

15 shipped plan/spec files moved from `docs/superpowers/{plans,specs}/` to `docs/superpowers/archive/{plans,specs}/` per the archive's "Adding to this archive" policy. archive/ now 18 plans + 14 specs + 1 HTML preview covering v0.12.0 → v1.6.0. Saves ~30 KB context per dev session that would otherwise scan shipped artifacts as if they were TODO.

## Quality bar

- **2010 tests pass + 1 skipped, 0 fail** (1976 → 2010, +34 new)
- **0 type errors** (`npx tsc --noEmit`)
- **0 lint errors, 0 warnings** (`npx eslint . --ext .ts,.tsx --max-warnings 0`)
- `pnpm verify` passes all 7 stages: `format` / `lint` / `type-check` / 2010 tests / `coverage` / `build` / `import-regression`

## What's still in the v1.6.0+ backlog

- `D:/claude_proj2/...` hardcoded fixture path in 5 integration tests — pre-existing v1.6.0 pattern; refactor to portable helper when CI moves to Linux.
- `cascade-required` error kind not in A+C spec §9.3 — spec update needed.
- True RFC 6902 array-index `add` semantics — closed for now by `patch-invalid`; spec promises array-index but implementation supports only sub-container insert.

## Next: v1.7.0 Cluster 3 (dbc-forge reuse)

Design doc: `docs/superpowers/specs/2026-06-21-v1-7-0-dbc-forge-integration-design.md` (Option A: git submodule + `file:` dep recommended, awaiting implementation).