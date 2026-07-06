# v1.29.0 MINOR — Com-Stack Mapper Shape Alignment to `addChildSiblingStep`

> **Status:** DRAFT (awaiting user review)
> **Goal:** Align `xlsxToEcucBatch.ts`'s in-line PatchStep emission with the Dcm mapper's by extending `addChildSiblingStep` to support both shapes (module-level + always-`definitionRef`, and leaf-parent + conditional-`definitionRef`). The Com-stack mapper swaps from in-line emit to a helper call. The Dcm mapper's emission MUST NOT shift.
> **Spec date:** 2026-07-06
> **Author:** planner agent (task #50)

## Background

v1.28.0 MINOR extracted the Dcm mapper's `[add-child + per-param set-param]` emission into the shared helper `addChildSiblingStep` (`src/core/bridge/addChildSiblingStep.ts`), closing the first half of the v1.27.2 release notes' §"Out of Scope (deferred)" TODO that suggested consolidating the two mapper shapes into one helper. v1.28.0 release notes explicitly deferred the Com-stack mapper-shape alignment to a future MINOR with pre-flight design (this spec).

The two mappers today emit different `add-child` shapes:

| Aspect                      | Dcm mapper (`xlsxDcmServicesToEcucBatch.ts`)                                                                                   | Com-stack mapper (`xlsxToEcucBatch.ts`)                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Helper used                 | `addChildSiblingStep` (v1.28.0+)                                                                                               | in-line (no helper)                                                                                              |
| `parentPath`                | `moduleShortName` (1-segment, e.g. `'Dcm'`)                                                                                    | `stripBswmdPackageRoot(containerDef.path)` (multi-segment leaf-parent, e.g. `'ComConfig/ComIPdu'`)                |
| `definitionRef`             | always emitted (canonical BSWMD container-def path like `/Dcm/Dcm/DcmDspDid`)                                                  | conditional — emitted only when `row.definitionRef !== undefined`                                                 |
| `containerPath` (set-param) | `${moduleShortName}/${row.shortName}`                                                                                          | `${parentPath}/${row.shortName}`                                                                                 |

Per the user's locked approach for this MINOR, `addChildSiblingStep` is extended so that:
1. `parentPath` is either **caller-provided** (overriding `moduleShortName` derivation) **or** derived from `moduleShortName` (legacy Dcm path).
2. `containerDefPath` becomes **optional**. When `undefined`, the `add-child` step emits **without** `definitionRef`.
3. The helper's input type allows both shapes at the type level (so Dcm callers keep their existing call sites unmodified).

## 1. API Surface Decision

### 1.1 Old input type (v1.28.0/v1.28.1)

```ts
export interface AddChildSiblingStepInput {
  readonly moduleShortName: string;
  readonly instanceShortName: string;
  readonly containerDefPath: string;
  readonly instanceParams: Readonly<Record<string, string | number | boolean | null>>;
}
```

### 1.2 New input type (v1.29.0)

```ts
export interface AddChildSiblingStepInput {
  readonly instanceShortName: string;
  readonly instanceParams: Readonly<Record<string, string | number | boolean | null>>;
  /** Exactly one of `parentPath` or `moduleShortName` MUST be provided. */
  readonly parentPath?: string;
  readonly moduleShortName?: string;
  /** When `undefined`, the `add-child` step emits without `definitionRef`. */
  readonly containerDefPath?: string;
}
```

### 1.3 Justification of each optional field

- **`instanceShortName`, `instanceParams`** — remain required. Every PatchStep sequence needs a new instance's name + (possibly empty) param map. No backwards-compat impact (every existing caller provides both).

- **`parentPath` (NEW optional)** — the Com-stack mapper's leaf-parent path (the multi-segment `stripBswmdPackageRoot(containerDef.path)` output) is meaningful only to that mapper. Exposing it as a top-level optional field — separate from `moduleShortName` — keeps the two calling conventions orthogonal: the Dcm mapper does NOT pass `parentPath`; the Com-stack mapper does NOT pass `moduleShortName`. A type-level XOR is enforced inside the helper by throwing if neither (or both) are supplied (fail-fast matches the project rule for invalid call patterns).

- **`moduleShortName` (now optional)** — was required in v1.28.0/v1.28.1 because the Dcm mapper's shape always derives `parentPath` from it. Now optional so the Com-stack mapper can pass `parentPath` instead without specifying a meaningless `moduleShortName`.

- **`containerDefPath` (now optional)** — was required in v1.28.0/v1.28.1 (`{ add-child, parentPath: 'Dcm', definitionRef: '/Dcm/Dcm/DcmDspDid' }` shape). Now optional so the Com-stack mapper can skip `definitionRef` when `row.definitionRef === undefined`, exactly mirroring its current in-line emission (`...(row.definitionRef !== undefined && { definitionRef: row.definitionRef })`).

### 1.4 Validation rules inside the helper

```ts
if (input.parentPath === undefined && input.moduleShortName === undefined) {
  throw new Error('addChildSiblingStep: either `parentPath` or `moduleShortName` must be provided');
}
// (Passing BOTH is permitted — `parentPath` wins per the precedence rule §6 below.)
```

The "both provided" case is permitted (not an error) because: (a) a caller might do so defensively; (b) `parentPath` precedence resolves the ambiguity; (c) it keeps the helper permissive against future refactors that compute `parentPath` from `moduleShortName` upstream.

## 2. Behavior Table

| Input shape                                                                                                                                                                                       | `add-child` step emitted                                                                                                                                                                                                                          | `set-param` `containerPath`           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **Dcm legacy** — `{ moduleShortName: 'Dcm', containerDefPath: '/Dcm/Dcm/DcmDspDid', instanceShortName: 'ReadVbatt' }`                                                                              | `{ op: 'add-child', parentPath: 'Dcm', shortName: 'ReadVbatt', definitionRef: '/Dcm/Dcm/DcmDspDid' }`                                                                                                                                              | `'Dcm/ReadVbatt'`                     |
| **Com-stack w/ definitionRef** — `{ parentPath: 'ComConfig/ComIPdu', containerDefPath: '/AUTOSAR/EcuCDefs/Com/ComConfig/ComIPdu', instanceShortName: 'TxPdu_Foo' }`                                  | `{ op: 'add-child', parentPath: 'ComConfig/ComIPdu', shortName: 'TxPdu_Foo', definitionRef: '/AUTOSAR/EcuCDefs/Com/ComConfig/ComIPdu' }`                                                                                                             | `'ComConfig/ComIPdu/TxPdu_Foo'`       |
| **Com-stack w/o definitionRef** — `{ parentPath: 'Com/ComConfig/ComIPdu', instanceShortName: 'Pdu_Engine' }`                                                                                       | `{ op: 'add-child', parentPath: 'Com/ComConfig/ComIPdu', shortName: 'Pdu_Engine' }` *(no `definitionRef` key)*                                                                                                                                       | `'Com/ComConfig/ComIPdu/Pdu_Engine'`  |
| **Both `parentPath` + `moduleShortName` provided** — `{ parentPath: 'X', moduleShortName: 'Dcm', containerDefPath: '/Dcm/Dcm/DcmDspDid' }`                                                         | `{ op: 'add-child', parentPath: 'X', shortName: '<instance>', definitionRef: '/Dcm/Dcm/DcmDspDid' }`                                                                                                                                              | `'X/<instance>'`                      |
| **Neither provided**                                                                                                                                                                              | `throw new Error('addChildSiblingStep: either `parentPath` or `moduleShortName` must be provided')`                                                                                                                                                | N/A                                   |

The `set-param` `containerPath` is always `${resolvedParentPath}/${instanceShortName}` where `resolvedParentPath` follows the precedence rule (caller-provided `parentPath` wins over `moduleShortName`).

## 3. Migration Plan (`xlsxToEcucBatch.ts` swap)

### 3.1 Conceptual diff

**Before** (`src/core/bridge/xlsxToEcucBatch.ts:82-99`):

```ts
const addChildBase = {
  op: 'add-child' as const,
  parentPath,
  shortName: row.shortName,
  ...(row.definitionRef !== undefined && { definitionRef: row.definitionRef }),
};
steps.push(addChildBase);

const containerPath = `${parentPath}/${row.shortName}`;
for (const [paramName, value] of Object.entries(row.params)) {
  if (value === null || value === undefined) continue;
  steps.push({
    op: 'set-param',
    containerPath,
    paramName,
    value: value as string | number | boolean,
  });
}
```

**After**:

```ts
const containerDefPath =
  row.definitionRef !== undefined ? row.definitionRef : undefined;

const newSteps = addChildSiblingStep({
  parentPath, // multi-segment leaf-parent (already strip-prefixed)
  instanceShortName: row.shortName,
  containerDefPath, // optional — omits `definitionRef` key when undefined
  instanceParams: row.params,
});
steps.push(...newSteps);
```

### 3.2 Behavioral parity invariants that must hold after the swap

1. **`add-child.parentPath`** unchanged — still `stripBswmdPackageRoot(containerDef.path)`.
2. **`add-child.shortName`** unchanged — still `row.shortName`.
3. **`add-child.definitionRef`** emitted only when `row.definitionRef !== undefined`. Conditional-spread is preserved exactly.
4. **`set-param.containerPath`** unchanged — still `${parentPath}/${row.shortName}`.
5. **`null` AND `undefined` params skipped** — helper already handles `null` (its type permits `null`); the migration adds the `undefined` skip the helper already naturally makes via `for...of Object.entries(...)` (undefined-valued entries *are* enumerated by `Object.entries`, so we need to confirm the helper skips them — see Risk §8 below).

### 3.3 Step-by-step

1. Edit `src/core/bridge/addChildSiblingStep.ts`:
   - Make `moduleShortName`, `containerDefPath` optional; add `parentPath` optional.
   - Resolve `resolvedParentPath` with precedence: `input.parentPath ?? input.moduleShortName` (throws if both undefined).
   - When `input.containerDefPath === undefined`, emit `add-child` step without a `definitionRef` key (no `definitionRef: undefined`).
2. Edit `src/core/bridge/xlsxToEcucBatch.ts`: replace the in-line `add-child` + per-param loop block with a single `steps.push(...addChildSiblingStep({ parentPath, instanceShortName: row.shortName, containerDefPath: row.definitionRef, instanceParams: row.params }))` call.
3. `xlsxDcmServicesToEcucBatch.ts` call site is **unchanged** — it still passes `moduleShortName` + `containerDefPath` (both required under the new shape), and the helper resolves `parentPath = moduleShortName`. Verified by existing `__tests__/xlsxDcmServicesToEcucBatch.test.ts` tests.
4. Remove the now-unused `import` of `PatchStep` type alias from `xlsxToEcucBatch.ts` ONLY if it becomes unused outside the helper call — likely still used for the per-row inner helper's type-narrowing, so keep import.
5. Remove the inline `...(row.definitionRef !== undefined && { definitionRef: row.definitionRef })` comment that documents the v1.28.0 strip idiom — replaced by helper's contract doc.

## 4. Test Plan

### 4.1 Direct unit test (`__tests__/addChildSiblingStep.test.ts`) additions

| New `it()`                                                                                                                                                                                                                       | Asserts                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `emits add-child with caller-provided parentPath instead of moduleShortName`                                                                                                                                                    | `steps[0].parentPath === callerParentPath`, `.moduleShortName` not dereferenced                                                |
| `containerDefPath omitted → add-child has no definitionRef key`                                                                                                                                                                  | `Object.keys(steps[0])` excludes `'definitionRef'` (use `expect(steps[0]).not.toHaveProperty('definitionRef')`)               |
| `containerDefPath explicitly undefined is treated identically to omitted`                                                                                                                                                       | same emission as omitted case                                                                                                 |
| `empty-definitionRef-string is still emitted (not skipped)`                                                                                                                                                                      | `steps[0].definitionRef === ''` (preserves existing "empty-string is not null" pattern from v1.28.1 test)                    |
| `throws when neither parentPath nor moduleShortName provided`                                                                                                                                                                   | `toThrow(/either .parentPath. or .moduleShortName. must be provided/)`                                                        |
| `parentPath takes precedence over moduleShortName when both provided`                                                                                                                                                            | caller-provided wins; helper does not error                                                                                    |

### 4.2 Cross-vendor invariant re-verification

The existing `describe('xlsxDcmServicesToEcucBatch — real-OEM cross-vendor invariant')` test (5 sheets × 2 BSWMDs = 10 invariant assertions) must continue to pass without modification. This is the load-bearing regression for §5 "Backwards compat" — the Dcm mapper's emission MUST NOT shift.

Also assert the cross-vendor invariant on the Com-stack mapper: existing `__tests__/xlsxToEcucBatch-bswmds.test.ts` synthetic-BSWMD tests remain unchanged (they exercise only the `addChildSiblingStep` emission path through the Com-stack mapper after the swap), plus existing `__tests__/xlsxToEcucBatch.test.ts` Com-stack happy-path test continues passing.

### 4.3 Downstream integration tests — re-verification only, no new tests

- `__tests__/dbcToComStack.test.ts` and `dbcToComStack.real.test.ts` — unaffected by this MINOR (DBC→Com-Stack mapper has its own in-line emission at `dbcToComStack.ts:301-365`, does NOT use `addChildSiblingStep`). Run to confirm no accidental cross-test breakage but do not add new assertions.
- `applyPatchSteps.ts` integration via `dcmConfigPipeline.test.ts` — exercises the full Dcm mapper→`addChildSiblingStep`→`applyPatchSteps` pipeline end-to-end. Run to confirm no emission drift. The existing `dcmConfigHandler.test.ts` end-to-end test (and any activated RED-1 tests from v1.27.x) is also a load-bearing regression — must remain green.
- NO new tests in downstream consumers (DBC bridge keeps its own emission; pipeline tests are re-runs only).

### 4.4 New tests NOT needed

- No new `dcmConfigPipeline` tests.
- No new `dcmConfigHandler` tests.
- No new `dbcToComStack` tests.
- The helper's internal param-skip null/undefined behavior IS worth testing (see Risk §8) but the existing test `'skips param entries whose value is null'` can be extended to also assert `undefined` skip — single test gets 1 extra assertion line.

## 5. IPC Surface Impact

**Zero.** Both mappers continue to emit `PatchStep[]` into the internal pipeline (`dcmConfigPipeline` for Dcm, `xlsxEcucBatchImportHandler.ts` for Com-stack via `translateStepPath`). The IPC handler `dcmConfigHandler` (introduced in v1.27.0) and `xlsxEcucBatchImportHandler` (introduced in v1.25.0) are unaffected. The helper's input is internal `PatchStep`-shaped data flowing into the existing `applyPatchSteps` engine. No `PatchStep` disciminant union member changes — only the helper's internal call-site composition shifts.

The `dcmConfigHandler` IPC response envelope (`DcmConfigResult` in `xlsxDcmServicesToEcucBatch.test.ts:23-29` neighborhood, via `dcmConfigPipeline.ts`) is unchanged.

## 6. Code-Review Checklist

Reviewers MUST check, in order:

1. **Dcm emission parity.** Run `pnpm vitest run src/core/bridge/__tests__/xlsxDcmServicesToEcucBatch.test.ts` and confirm all 15+ existing tests pass with zero modifications to assertions or inputs. The 5 invariant tests at lines 194-215 and the 5 real-OEM cross-vendor tests at lines 218-312 are the load-bearing regression.

2. **Com-stack emission parity.** Run `pnpm vitest run src/core/bridge/__tests__/xlsxToEcucBatch.test.ts src/core/bridge/__tests__/xlsxToEcucBatch-bswmds.test.ts`. Confirm the existing 4 happy-path + 3 BSWMD-driven edge case tests pass with zero modifications. Confirm `'emits definitionRef override in the add-child when row has one'` still passes (the v1.26.0 T4 conditional-`definitionRef` test).

3. **`parentPath` precedence rule.** When both `parentPath` and `moduleShortName` are provided, `parentPath` wins. Verified by new direct-test `parentPath takes precedence over moduleShortName when both provided`.

4. **`definitionRef` absence shape.** When `containerDefPath === undefined`, the emitted `add-child` step has NO `definitionRef` key (verified by `expect(step).not.toHaveProperty('definitionRef')`, NOT by `step.definitionRef === undefined` — the latter passes even when the key is explicitly set to `undefined`).

5. **Com-stack mapper parametric parity** — the existing 5 sheet kinds (ComIPdu / ComSignal / CanIfTxPdu / CanIfRxPdu / PduRRoutingPath) MUST emit PatchSteps byte-identical to pre-refactor. Verify by `git diff` on the fixture-loaded snapshot from `__tests__/xlsxToEcucBatch.test.ts`'s `'emits one add-child + N set-param from a ComIPdu row with 3 params'` test — must remain green (no assertion change = emission parity).

6. **The "both provided" case.** Caller-provided `parentPath` wins; the helper does not throw, does not warn, does not log. Defensive against future refactors that pre-compute `parentPath` from `moduleShortName` upstream.

7. **Param skip behavior** — confirm `null` AND `undefined` param values are both skipped after refactor. The Com-stack mapper's in-line loop explicitly checks `value === null || value === undefined` (the v1.25.x convention). The helper's current loop checks `value === null` ONLY. The migration MUST extend the helper's param loop to also check `value === undefined` to preserve existing Com-stack behavior — see Risk §8.

8. **No `console.log` statements** in helper file (project coding-style rule).

9. **`tsc --noEmit`** must be GREEN (TypeScript narrowing of the optional `parentPath` / `containerDefPath` in step construction; the helper's return type stays `readonly PatchStep[]`).

10. **`pnpm verify 7-stage`** GREEN (the full project gate — format / lint / type-check / test / coverage / build / import-regression).

## 7. Files-Touched Count

Production code (2 files):
- `src/core/bridge/addChildSiblingStep.ts` — input type + helper body updated; +~12 LOC; -~8 LOC (net +~4).
- `src/core/bridge/xlsxToEcucBatch.ts` — in-line emit replaced with helper call; -~15 LOC; +~6 LOC (net -~9).

Tests (2 files):
- `src/core/bridge/__tests__/addChildSiblingStep.test.ts` — 6 new `it()` blocks (+~80 LOC).
- All other test files: zero changes (re-run only for regression).

**Production + tests this MINOR touches: 4 files. Approximately -5 net LOC in production (refactor tightens), +80 LOC in tests.**

## 8. Risks

| # | Risk                                                                                                                                    | Likelihood | Mitigation                                                                                                                                                                                                                                                                |
| - | --------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | Dcm mapper emission shifts (silent regression)                                                                                           | Medium     | All 15+ existing `xlsxDcmServicesToEcucBatch.test.ts` tests are the load-bearing regression; the helper's Dcm-shape branch is direct-tested by the new `'add-child with caller-provided parentPath'` AND the existing `'emits add-child with moduleShortName as parentPath + instanceShortName + definitionRef'` tests must both pass simultaneously. |
| 2 | Com-stack mapper conditional `definitionRef` semantics change                                                                           | Low        | The direct test `'containerDefPath omitted → add-child has no definitionRef key'` (using `not.toHaveProperty`) pins the absence-of-key shape. Existing v1.26.0 T4 test `'emits definitionRef override in the add-child when row has one'` covers the emitted case.       |
| 3 | `parentPath` precedence subtly different from docs                                                                                       | Low        | Direct test pinned (`parentPath takes precedence over moduleShortName`); helper implementation reads `input.parentPath ?? input.moduleShortName`.                                                                                                                          |
| 4 | `undefined` param values now behaviorally different from `null`                                                                         | **High**   | The Com-stack mapper's in-line loop explicitly checks `value === null || value === undefined`. The helper's current loop checks `value === null` ONLY. The migration MUST extend the helper's param loop to also `continue` on `value === undefined`. Direct test added: `'skips param entries whose value is undefined'` in addition to existing `'skips param entries whose value is null'`. |
| 5 | Object-keys emission order in `add-child` step shifts                                                                                   | Low        | The current helper uses an object literal for the step, so key order is stable pre-refactor. The migration keeps the object-literal pattern; new test asserts `expect(Object.keys(steps[0])).toEqual(['op', 'parentPath', 'shortName', 'definitionRef'])` (or `['op', 'parentPath', 'shortName']` when definitionRef absent). |
| 6 | TypeScript narrowing of optional fields fails in `tsc --noEmit`                                                                          | Low        | `parentPath` and `containerDefPath` are both `string \| undefined`; helper internally reads each via `if (input.parentPath !== undefined)` (or `??`). Helper return type stays `readonly PatchStep[]` — no exhaustiveness change.                                         |
| 7 | `addChildSiblingStep` becomes a "kitchen sink" helper that future mappers mutate further                                                 | Low        | Out of scope to prevent here. Future MINOR candidate: split into `addChildModuleSiblingStep` + `addChildLeafSiblingStep`. Noted in §9.                                                                                                                                       |
| 8 | The `Object.entries` enumeration behavior + `null`/`undefined` skip introduces silent regression for downstream mappers like `dbcToComStack` | Low        | `dbcToComStack` does NOT use `addChildSiblingStep` (its own in-line emit at lines 301-365). Verified by `grep -n addChildSiblingStep src/core/bridge/dbcToComStack.ts` (returns no matches).                                                                                  |

## 9. Out of Scope (deferred to future MINORs)

- **Splitting `addChildSiblingStep` into two helpers** (`addChildModuleLevelStep` + `addChildLeafStep`) — this MINOR deliberately extends the existing helper rather than fragmenting. A future MINOR can re-evaluate when the shape stabilizes.
- **Dcm mapper v1.29.0+ refactors** (e.g., dropping `SHEET_TO_CONTAINER_SHORT_NAME` const, auto-infer 5 service kinds from BSWMD) — explicitly deferred from v1.27.0 release notes; preserved.
- **Dem service generator** (DTC mapping + debouncing) — deferred per v1.27.0 release notes.
- **Generic BSWMD-driven bridge** for any module (Dcm + Dem + Com + CanIf + ...) — long-term follow-up.
- **Renderer-side `applied` counter on `DcmConfigHandlerResult`** — deferred from v1.27.2 PATCH.
- **Real-OEM BSWMD override path** for arbitrary vendor exports — deferred per v1.27.0 spec.
- **Any new IPC contracts** — explicitly out of scope (the IPC surface is already stable from v1.27.x).
- **Adding a runtime validation that BOTH `parentPath` and `moduleShortName` were accidentally provided** — currently silently permits; we deliberately avoid strict XOR to keep the helper permissive and avoid over-engineering for an edge case that has no real caller.

## 10. Sequencing (post-approval)

Per CLAUDE.md multi-file refactor rule:

1. TDD via `tdd-guide` agent — write the 6 new direct tests in `addChildSiblingStep.test.ts` FIRST; watch them fail against the unchanged helper.
2. Refactor `addChildSiblingStep.ts` to make tests pass.
3. Swap `xlsxToEcucBatch.ts` in-line emit to helper call (existing Com-stack mapper tests confirm parity).
4. `pnpm verify 7-stage` GREEN.
5. Code review via `code-reviewer` agent.
6. Ship via `commit + tag v1.29.0 + gh release`.

## 11. Self-Review

1. **Spec coverage:** All 9 required outputs (API surface, behavior table, migration plan, test plan, IPC impact, code-review checklist, files-touched, risks, out-of-scope) addressed above. The user's "locked" approach (extend `addChildSiblingStep`, not split; `parentPath` caller-wins; `containerDefPath` becomes optional) is honored verbatim.

2. **Placeholder scan:** No "TBD" / "TODO" / "fill in" patterns. All file paths verified via Read (no guesswork).

3. **Type consistency:** New `AddChildSiblingStepInput` shape tested at the call site of both mappers. Dcm mapper's existing call site is type-compatible (it provides `moduleShortName` + `containerDefPath` as before — both still allowed under the new optional shape). Com-stack mapper's new call site is type-compatible (it provides `parentPath` + optional `containerDefPath` + `instanceParams`).

4. **Scope check:** Single focused MINOR (helper extension + one caller swap). Not multi-subsystem. No IPC contract changes. No BSWMD fixture additions. 4 files touched in production+tests (excluding release artifacts).

5. **Ambiguity check:**
   - "parentPath" defined as the multi-segment leaf-parent path that the Com-stack mapper already computes via `stripBswmdPackageRoot(containerDef.path)`.
   - "moduleShortName" defined as before — the BSWMD module key (e.g. `'Dcm'`, `'Com'`).
   - "containerDefPath" defined as the BSWMD-absolute canonical container-def path (e.g. `/Dcm/Dcm/DcmDspDid`) — `undefined` skips emission.
   - Precedence rule explicit (caller-provided wins).

6. **Step-by-step completeness:** §3.3 has 5 concrete steps, each reversible via `git revert`.

---

### Critical Files for Implementation

- D:/claude_proj2/claude-AutosarCfg/src/core/bridge/addChildSiblingStep.ts
- D:/claude_proj2/claude-AutosarCfg/src/core/bridge/xlsxToEcucBatch.ts
- D:/claude_proj2/claude-AutosarCfg/src/core/bridge/__tests__/addChildSiblingStep.test.ts
- D:/claude_proj2/claude-AutosarCfg/src/core/bridge/__tests__/xlsxDcmServicesToEcucBatch.test.ts (regression-only; not modified)
- D:/claude_proj2/claude-AutosarCfg/src/core/mutation/applyPatchSteps.ts (read-only regression check at lines 669-769 for `findChildDefForAdd` / `findParentContainerDef` semantics)
