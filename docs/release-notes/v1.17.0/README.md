# v1.17.0 Release Notes (2026-06-30) — MINOR

**Type Rip (Batch 1 of joint-review plan)**

See [CHANGELOG](../../CHANGELOG.md#v1170-2026-06-30--minor) for the headline.

## 关键决策

- **3 new optional schema fields, no breaking changes** — `BswModuleDef.derivedFrom`, `ReferenceDef.destDialect`, `BswmdDocument.moduleRefs`. All OPTIONAL so existing ARXML inputs continue to parse identically.
- **BSW-SEC-005 validator** — POST-BUILD params without variant coverage now error at Stage 1 (was silent). Sets up v1.18.0 C8 variant engineering.
- **MODULE-REF parser** — `<MODULE-REF>` elements previously silently dropped now surface at the document level via new `walkPackagesForModuleRefs` helper. Mirrors the existing `walkPackagesForModules` recursion pattern.
- **stencilSaveHandler FIO-2** — last remaining raw fs.writeFile in src/main/ migrated to writeAtomic. Closes v1.15.5 C1 grep miss (sync-only grep missed async form).
- **SCRIPT_PROGRESS emit** — orphan subscription closed. New `getMainWindow`/`setMainWindow` accessor extracted to dedicated `src/main/window.ts` module to isolate IPC handlers from boot sequence (which calls `app.whenReady`) import graph. Bidirectional audit (declared → registered → emitter → listener) all green.

## 推迟到 v1.18.0 MINOR

- Batch 2 (7 items) — C13 split, Obs-3 warnings, IPC envelopes, crash recovery, shutdown drain, sandbox flip
- Batch 3 (1 item, C8) — variant engineering coupled to Obs-3 StepWarning shape

Per spec §15.1.

## 流程教训（PKM）

1. **Phase 2.5 brief-drift correction Shape 7 promoted** — T1 dispatch BLOCKED on first attempt (2026-06-30) due to 5 fictional file paths + 3 fictional type shapes from aspirational spec. Re-spec fixed. Shape 7 (file-exists + existing-type-shape verification) added to `phase-2-5-brief-drift-correction.md`.
2. **Parallel-test wall-clock drift** — 2 occurrences (vitest testTimeout + sandbox-internal timeoutMs) promoted to dedicated memory file `parallel-test-wall-clock-drift.md`. Fix pattern: sweep ALL wall-clock constants, not just outer testTimeout.
3. **State accessor module pattern** — 1-of-1 NEW memory file `state-accessor-module-pattern.md` promoted at T5 (getMainWindow extracted to window.ts). Documented cross-link to v1.15.5 C4 precedent.
4. **Agent self-report on pnpm verify exit code is unreliable** — T1 implementer falsely claimed "exit 0" (actual was 1). Reinforced: controller always re-runs verify after agent completion.
5. **Push channel bidirectional audit** — IPC-1 closed the only orphan push channel. Lesson: every push channel needs full audit not just declared→registered.

## Ship Method

- Branch `feature/v1-17-0-minor` (TBD — fresh branch per Gate D execution if applicable; otherwise direct on main)
- 6 task commits (T1-T6 from this plan) + 1 release artifacts commit (T7)
- 1 re-spec commit + 1 baseline-fix commit + 1 prettier-fix commit (pre-task prep)
- 1 M1 follow-up commit (T3 review REQUEST CHANGES fix)
- `pnpm verify` 7-stage green at every task boundary
- `gh pr create` → squash merge → `git tag v1.17.0` → `gh release create`
- Ship method mirrors v1.16.0/v1.16.1 pattern; use gh api 5-step chain if direct git push fails (network flapping observed 2026-06-30)

## 测试基线

- v1.16.1: 2505 + 2 SKIP / 0 fail
- v1.17.0: 2525 + 2 SKIP / 0 fail (+20 net: 3 C10 + 4 C9 + 5 C11 + 2 FIO-2 + 2 IPC-1 + 4 SE-7 — exceeds plan target of +10 due to extra defensive tests)
- pnpm verify 7-stage 全绿