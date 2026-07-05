# v1.25.x PATCH — Close-out 3 Follow-ups — Design

> **For agentic workers:** This is a design spec, not a plan. Use superpowers:writing-plans to author the implementation plan after this spec is approved.

**Date**: 2026-07-05
**Author**: brainstorming session
**Status**: APPROVED — pending plan authoring
**Branch**: main (post v1.25.0 MINOR SHIP at tag v1.25.0)
**Baseline tests**: 2831 + 6 SKIP / 0 fail

## Motivation

v1.25.0 MINOR SHIPPED at `980d04a0acdee8652a1610dd2edcaf202dc190b4` with 9 implementation commits + 1 ship-hash fix + 1 cleanup. The FINAL whole-branch review (Sonnet) identified 4 follow-ups; this PATCH closes 3 of them and defers 1.

The most consequential item is **C1 (`applySetParam` integer-default cosmetic)** which v1.25.0's release notes transparently document as a Known Issue. T4's implementer misdiagnosed the root cause; the FINAL whole-branch reviewer's code reading suggests the real source is either (a) ARXML serializer default-omission (AUTOSAR convention) or (b) T1 mapper step omission. **This PATCH runs the actual diagnostic before touching any code** — per the T4 lesson: investigate before fixing.

The other items are housekeeping: remove a 1-line dead-code artifact, and enrich the demo project's BSWMDs so end users (not just test fixtures) can run the wizard's template download against a real local project.

User-confirmed scope (A path):

1. **T1**: Remove dead `void xlsxToEcucBatch;` line + the corresponding unused import in `xlsxEcucBatchParseHandler.ts` (cosmetic, 1-line cleanup).
2. **T2**: **Diagnose first**, then root-cause-based fix of C1 (`applySetParam` integer-default cosmetic). Diagnostic test pinpoint whether the source is mapper / serializer / engine / misdiagnosed; fix targets the confirmed site only.
3. **T3**: Enrich `samples/arxml/demo-ecu/bswmd/{Com,CanIf,PduR}_Bswmd.arxml` to declare all 5 Com-stack kinds (`ComIPdu` / `ComSignal` / `CanIfTxPdu` / `CanIfRxPdu` / `PduRRoutingPath`) with ≥3 params each, mirroring the v1.25.0 T4 fixture pattern. Add 1 regression test that calls `xlsxEcucBatchTemplateHandler` on demo-ecu and verifies 5-sheet output.

Deferred (YAGNI until 3rd caller materializes):

- `translateStepPath` split into case-translator + leaf-strip helpers (single caller today)

## Goals

1. **Eliminate C1 silent data-loss risk** — when a `.xlsx` cell encodes an integer matching BSWMD `<DEFAULT-VALUE>`, the user's value must reach the ARXML. Either by serializer emitting `<VALUE>X</VALUE>` always, or by mapper emitting `set-param` always, or by engine no longer over-reporting `noChange`.
2. **Demo project usable end-to-end** — `xlsxEcucBatchTemplateHandler` works against `samples/arxml/demo-ecu/` without falling back to the dedicated `comstack-existing-fixture/` folder.
3. **Remove dead code** — clean up the `void xlsxToEcucBatch;` workaround from T2 (implementer left it as "documentation"; reviewer's reviewer called it YAGNI smell).

## Non-Goals (explicit YAGNI)

- **No `translateStepPath` split** — single caller today; refactor would add files without changing behavior. Defer until 3rd caller materializes.
- **No `.csv` support** — independent PATCH (was in v1.25.0 release notes "Next Steps").
- **No Dcm services generator (v1.26.0 MINOR)** — deferred; v1.26.0 depends on C1 being fixed first because Dcm BSWMDs are deeper than Com-stack and will exercise the integer-default path more aggressively.
- **No PHYSICAL-TYPE / SCALING / COMPU-METHOD** for v1.24.x PATCH ODX data — independent workstream.
- **No `pnpm verify` re-run mid-PATCH** — run only at T4 ship-time.

## Scope

**In scope**:

- T1: 1-line dead-code removal in `src/main/ipc/xlsxEcucBatchParseHandler.ts` (line 16 import + lines 219-222 void block).
- T2:
  - 1 diagnostic test (`src/core/__tests__/c1-integer-default-diagnostic.test.ts`, ~50 lines) that runs the full pipeline end-to-end on a hand-crafted integer-param fixture, prints `PatchStep[]` + serialized ARXML, and asserts which of the 4 root-cause branches is the source.
  - Based on diagnostic result, fix the confirmed site (mapper / serializer / engine / nothing). 1-2 task briefs scoped per root-cause branch.
  - 1 regression test (appended to `src/main/ipc/__tests__/xlsxEcucBatchImportHandler.real.test.ts`) that pins an integer `ComPduId=1` value landing as `<VALUE>1</VALUE>` in the output ARXML.
- T3:
  - Extend `samples/arxml/demo-ecu/bswmd/Bsw_Com_Bswmd.arxml` to add `ComSignal` container + ≥3 params per container.
  - Extend `samples/arxml/demo-ecu/bswmd/Bsw_CanIf_Bswmd.arxml` to add `CanIfConfig` containing `CanIfTxPdu` + `CanIfRxPdu`, each with ≥3 params.
  - Extend `samples/arxml/demo-ecu/bswmd/Bsw_PduR_Bswmd.arxml` to add `PduRRoutingTables` containing `PduRRoutingPath` with ≥3 params.
  - 1 regression test (`src/main/ipc/__tests__/xlsxEcucBatchTemplateHandler.real.demo-ecu.test.ts`) verifying demo-ecu template handler produces 5 sheets with non-empty header rows.

**Out of scope**:

- `translateStepPath` split (defer to follow-up PATCH when 3rd caller appears)
- DBC bridge handler refactor (existing 38 tests must continue to pass; behavior change from demo BSWMD enrichment is the only "regression" we accept)
- ARXML serializer signature changes beyond a single optional `emitExplicitDefaults` flag (if T2 fix is in serializer)

## Architecture (one paragraph)

Three sequential fix tasks: T1 (trivial) → T2 (diagnose-then-fix) → T3 (BSWMD enrichment). Each task runs TDD per project convention: write failing test → RED → implement minimal fix → GREEN → commit. T2's diagnostic test doubles as a regression guard after the fix. T3's enrichment introduces no architectural change — only adds `<ECUC-PARAM-CONF-CONTAINER-DEF>` blocks to existing BSWMDs. The v1.25.0 PATCH scope is contained to 4 files modified + 2 files added (no new IPC, no new shared types, no new devDeps).

## Data flow

### T1 (dead code)

```
src/main/ipc/xlsxEcucBatchParseHandler.ts
  ├── line 16:  import { xlsxToEcucBatch } from '../../core/bridge/xlsxToEcucBatch.js';   ← DELETE
  ├── lines 219-222:
  │     // Touch xlsxToEcucBatch to keep the import used ...
  │     void xlsxToEcucBatch;   ← DELETE
  └── end of file
```

No data flow change.

### T2 (C1 diagnosis + fix)

```
Diagnostic test:
  1. Construct EcucInstanceRow[] with ComPduId=1 (integer, BSWMD DEFAULT-VALUE=0)
  2. Call xlsxToEcucBatch(rows) → log PatchStep[]
  3. Call applyPatchSteps + serializeArxml → log serialized text
  4. Assert which root-cause branch is active (see Root-cause decision matrix below)
  5. If all branches false: report "T4 misdiagnosis confirmed", rewrite release notes Known Issues

Fix (per root cause branch):
  Branch A (mapper omission):  modify xlsxToEcucBatch.ts to emit set-param even when
                                 value === BSWMD default (1-line: drop the null-skip)
  Branch B (serializer omission): add emitExplicitDefaults?: boolean flag to
                                 serializeArxml options; xlsxEcucBatchImportHandler
                                 passes true; default = false (preserves DBC bridge behavior)
  Branch C (engine noChange):  modify applySetParam noChange detection (deeper review;
                                 may break 38 DBC bridge tests — dispatch fix subagent
                                 with DBC bridge test budget as risk constraint)
  Branch D (misdiagnosis):      update release notes Known Issues with corrected
                                 explanation; no code change
```

### T3 (demo BSWMD enrichment)

```
samples/arxml/demo-ecu/bswmd/Bsw_Com_Bswmd.arxml
  ├── <ECUC-PARAM-CONF-CONTAINER-DEF> SHORT-NAME="ComConfig"   (existing)
  │     ├── <ECUC-PARAM-CONF-CONTAINER-DEF> SHORT-NAME="ComIPdu"   (existing, add 3 params)
  │     │     ├── ComPduId   (existing integer, no DEFAULT-VALUE)
  │     │     ├── ComBitPosition   (new integer)
  │     │     ├── ComIPduDirection   (new enum: SEND / RECEIVE)
  │     │     └── ComPduId default   (new <DEFAULT-VALUE>0</DEFAULT-VALUE> for C1 regression)
  │     └── <ECUC-PARAM-CONF-CONTAINER-DEF> SHORT-NAME="ComSignal"   (NEW)
  │           ├── ComBitPosition   (integer)
  │           ├── ComSignalDirection   (enum)
  │           └── ComErrorNotification   (enum)

samples/arxml/demo-ecu/bswmd/Bsw_CanIf_Bswmd.arxml
  ├── <ECUC-PARAM-CONF-CONTAINER-DEF> SHORT-NAME="CanIfInitCfg"   (existing, keep)
  └── <ECUC-PARAM-CONF-CONTAINER-DEF> SHORT-NAME="CanIfConfig"   (NEW)
        ├── <ECUC-PARAM-CONF-CONTAINER-DEF> SHORT-NAME="CanIfTxPdu"   (NEW, 3 params)
        └── <ECUC-PARAM-CONF-CONTAINER-DEF> SHORT-NAME="CanIfRxPdu"   (NEW, 3 params)

samples/arxml/demo-ecu/bswmd/Bsw_PduR_Bswmd.arxml
  └── <ECUC-PARAM-CONF-CONTAINER-DEF> SHORT-NAME="PduRRoutingTables"   (NEW)
        └── <ECUC-PARAM-CONF-CONTAINER-DEF> SHORT-NAME="PduRRoutingPath"   (NEW, 3 params)
```

## Components

| File | Action | Approx lines |
|---|---|---|
| `src/main/ipc/xlsxEcucBatchParseHandler.ts` | T1: delete 6 lines (import + void block) | -6 |
| `src/core/__tests__/c1-integer-default-diagnostic.test.ts` | T2: NEW | 80-120 |
| `src/main/ipc/__tests__/xlsxEcucBatchImportHandler.real.test.ts` | T2: append 1 regression test | +30-50 |
| Per-fix file (T2 branch dependent) | T2: modify one of `xlsxToEcucBatch.ts` / `serializer.ts` / `applyPatchSteps.ts` | 1-20 |
| `samples/arxml/demo-ecu/bswmd/Bsw_Com_Bswmd.arxml` | T3: add 2 params + 1 container | +30 |
| `samples/arxml/demo-ecu/bswmd/Bsw_CanIf_Bswmd.arxml` | T3: add 1 container tree | +30 |
| `samples/arxml/demo-ecu/bswmd/Bsw_PduR_Bswmd.arxml` | T3: add 1 container tree | +30 |
| `src/main/ipc/__tests__/xlsxEcucBatchTemplateHandler.real.demo-ecu.test.ts` | T3: NEW | 60-100 |
| `docs/release-notes/v1.25.1/README.md` | T4: NEW (or update v1.25.0 with errata if PATCH scope is small) | 60-100 |
| `CHANGELOG.md` | T4: add v1.25.1 row | +5 |
| `docs/user-manual.html` | T4: bump baseline to v1.25.1 | +1-2 |

No new IPC, no new shared types, no new devDeps.

## IPC contract

**No changes.** All 3 existing IPC contracts (`XlsxParseBatch*`, `XlsxWriteBatchTemplate*`, `XlsxCommitBatch*`) ship as-is from v1.25.0.

T2 branch B (serializer option) adds an optional `emitExplicitDefaults?: boolean` field to `serializeArxml` options — this is INTERNAL to `core/arxml/serializer.ts`, not exposed via IPC.

## Error handling

- **T1**: 0 errors.
- **T2 diagnostic**: If the diagnostic test's root-cause decision matrix returns false on all 4 branches (truly no defect), the test reports `T4 misdiagnosis confirmed` and the PATCH **stops** — no code change, only release-notes erratum.
- **T2 fix (any branch)**: Existing error envelope patterns preserved. No new error kinds.
- **T3 BSWMD enrichment**: Existing `parseBswmd` and `lookupContainerDef` validate each new container def at test setup. Syntax errors caught by `pnpm type-check` (BSWMDs parsed at fixture setup). Multiplicity errors caught at runtime via `applyPatchSteps`.

## Testing strategy

**T1 tests**:
- Full `pnpm vitest run` must preserve 2831 + 6 SKIP / 0 fail (0 net change; pure deletion).

**T2 tests**:
- 1 diagnostic test: ~50 lines, runs the pipeline end-to-end, prints intermediate outputs to console, asserts which root-cause branch is active. **This test stays in the suite as a regression guard** even after the fix lands.
- 1 regression test: pins `ComPduId=1` (integer) landing as `<VALUE>1</VALUE>` in the output ARXML. Appended to `xlsxEcucBatchImportHandler.real.test.ts`.
- Full `pnpm vitest run` target: 2831 + 6 SKIP / 0 fail + 2 net (diagnostic + regression) = ~2833.

**T3 tests**:
- 1 regression test (`xlsxEcucBatchTemplateHandler.real.demo-ecu.test.ts`): builds the demo-ecu fixture (manifest + 3 BSWMDs + 3 stub value ARXMLs), calls `xlsxEcucBatchWriteBatchTemplateHandler`, parses the returned bytes via SheetJS, asserts all 5 sheet names present + each sheet has ≥3 header columns.
- Full `pnpm vitest run` target: 2833 + 6 SKIP / 0 fail + 1 net = ~2834.
- **DBC bridge impact**: The v1.23.0 DBC bridge's `path-not-found` filter previously suppressed `add-child` steps for kinds the demo BSWMDs didn't declare (ComSignal / CanIfTxPdu / CanIfRxPdu / PduRRoutingPath). After T3 enrichment, these steps will SUCCEED. This is **expected behavior change**, not a regression — DBC bridge tests will likely shift in count but should still pass. If any DBC test fails, document the failure as part of T3 review; do NOT silently revert the BSWMD enrichment.

**T4 ship**:
- `pnpm verify` 7-stage GREEN (replaces the v1.25.0 verify run).
- Tag `v1.25.1` at ship commit, gh release with 40-char SHA per MEMORY.md `gh API 推 commit workflow`.

**Backward-compat tests** (no new — must continue to pass):
- v1.23.x (57 tests), v1.24.x (44 tests), v1.25.x (2831 tests baseline) — total 2932+ existing tests must remain GREEN.

## Tasks (4 total)

### T1: Dead code cleanup
**Files**: `src/main/ipc/xlsxEcucBatchParseHandler.ts`
**Commits**: 1
**Tests**: 0 net (pure deletion)
**Duration estimate**: ~15 min

### T2: C1 diagnosis + root-cause-based fix
**Files**:
- NEW: `src/core/__tests__/c1-integer-default-diagnostic.test.ts` (diagnostic + regression in one)
- MODIFY: per root-cause branch — one of `src/core/bridge/xlsxToEcucBatch.ts` / `src/core/arxml/serializer.ts` / `src/core/mutation/applyPatchSteps.ts`
- MODIFY: `src/main/ipc/__tests__/xlsxEcucBatchImportHandler.real.test.ts` (append regression)
**Commits**: 1-2 (diagnostic commit + fix commit)
**Tests**: +2 net (diagnostic + regression)
**Duration estimate**: ~1-2 hours depending on root cause

### T3: Demo BSWMD enrichment
**Files**:
- MODIFY: `samples/arxml/demo-ecu/bswmd/Bsw_Com_Bswmd.arxml`
- MODIFY: `samples/arxml/demo-ecu/bswmd/Bsw_CanIf_Bswmd.arxml`
- MODIFY: `samples/arxml/demo-ecu/bswmd/Bsw_PduR_Bswmd.arxml`
- NEW: `src/main/ipc/__tests__/xlsxEcucBatchTemplateHandler.real.demo-ecu.test.ts`
**Commits**: 2 (BSWMD commit + test commit)
**Tests**: +1 net
**Duration estimate**: ~1 hour

### T4: Ship
**Files**:
- CREATE: `docs/release-notes/v1.25.1/README.md`
- MODIFY: `CHANGELOG.md`
- MODIFY: `docs/user-manual.html`
- TAG: `v1.25.1` at ship commit
- GH release: `v1.25.1`
**Commits**: 1
**Tests**: 0 net
**Duration estimate**: ~30 min

## Risks

1. **T2 branch B (serializer change) might affect 38 DBC bridge tests** — `serializeArxml` is also used by the DBC bridge. Adding `emitExplicitDefaults: true` to its default path would change DBC bridge output XML shape. **Mitigation**: only the xlsxEcucBatchImportHandler opts in; serializer default = `false` preserves DBC bridge behavior.

2. **T2 branch C (engine `noChange` semantics)** — modify `applySetParam` to not over-report `noChange`. This is the most invasive branch: DBC bridge uses `applyPatchSteps` for 38 tests, and the `noChange` counter is the basis for `applied` counting. A wrong fix could break DBC bridge idempotent dedup. **Mitigation**: T2 fix subagent dispatched with explicit DBC bridge test budget (38 tests must continue to pass); if branch C fix breaks > 5 DBC tests, escalate to user and consider "document + no fix" (branch D) instead.

3. **T3 demo BSWMD enrichment changes DBC bridge behavior** — the `path-not-found` filter that previously suppressed `add-child` for undeclared kinds will no longer catch them. DBC tests that previously expected "no Signal in output" may now see "Signal in output". **Mitigation**: T3 review runs DBC bridge tests; any shift in count is acceptable if 0 actual regressions (test count fluctuation ≠ failure). If specific DBC test fails because of BSWMD enrichment, document in T3 review and decide per-case whether to (a) adjust the BSWMD, (b) adjust the DBC test expectation, or (c) leave the enrichment out of v1.25.x PATCH (defer to v1.26.0).

4. **T3 BSWMD syntax errors break existing tests** — extending 3 BSWMDs with new containers / params could introduce malformed ARXML if hand-crafted. **Mitigation**: T3 implementer uses `parseBswmd` + `lookupContainerDef` to validate each new container def at test setup; any error surfaces immediately at RED step.

5. **`pnpm verify` 7-stage may surface latent issues** — full verify pipeline (format / lint / type-check / test / coverage / build / import-regression) has not been re-run since v1.25.0. Any new failure at T4 ship-time must be triaged and either fixed or explicitly deferred.

## Cross-references

- v1.25.0 MINOR release notes Known Issues section: `docs/release-notes/v1.25.0/README.md` (lines documenting C1 integer-default cosmetic)
- v1.25.0 T4 final review adjudication: `.git/sdd/progress.md` minor-findings log
- v1.25.0 T4 fixture pattern: `samples/comstack-existing-fixture/` (template for T3 BSWMD enrichment)
- MEMORY.md `real-oem-fixture-required-for-vendor-format-work` PKM note
- MEMORY.md `gh API 推 commit workflow` (40-char SHA for gh release `--target`)
- v1.23.0 DBC bridge precedent for atomic write + BSWMD lookup: `src/main/ipc/dbcImportComStackHandler.ts`

## Self-Review

1. **Spec coverage**: Goals 1-3 each have a component in Architecture / Tasks. Non-goals explicit. Test plan covers all 4 tasks.

2. **Placeholder scan**: No "TBD" / "TODO" / "fill in" markers. All sed/test/code references are concrete. The T2 fix scope is intentionally conditional ("per root-cause branch") because the branch depends on diagnostic output — this is documented, not a placeholder.

3. **Type consistency**: `EcucInstanceRow` shape unchanged from v1.25.0. T2 branch B's serializer option `emitExplicitDefaults?: boolean` is a new optional field on an existing options type — backward-compatible. T3 BSWMDs use the existing `ECUC-PARAM-CONF-CONTAINER-DEF` and `ECUC-INTEGER-PARAM-DEF` shapes per AUTOSAR r4.0.

4. **Scope check**: 4 tasks, +3 net tests (target ~2834), 4 files modified + 2 new (test files only) + 3 BSWMDs modified. Comparable to a typical small PATCH (v1.22.0 had ~10 tasks, v1.24.1 PATCH had ~4 tasks). Single PATCH scope is appropriate.

5. **Risk check**: 5 risks each have mitigations. The T2 "diagnose first" approach prevents the T4-style misdiagnosis. T3's DBC bridge behavior change is explicitly accepted as a known consequence (documented, not accidental).

6. **Pre-flight fixes to apply before T1 dispatch**:
   - Verify the dead-code at `xlsxEcucBatchParseHandler.ts:219-222` is exactly the `void xlsxToEcucBatch;` pattern (line numbers may have shifted due to linter changes after v1.25.0 ship).
   - Verify demo BSWMDs at `samples/arxml/demo-ecu/bswmd/` haven't been modified since v1.25.0 ship.

---

**Status**: APPROVED — pending plan authoring via superpowers:writing-plans.