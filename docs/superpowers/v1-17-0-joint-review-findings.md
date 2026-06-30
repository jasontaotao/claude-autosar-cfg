# v1.17.0 Joint Re-Review Findings — 2026-06-29

> Gate A of v1.17.0 MINOR implementation plan. 4-agent joint review on the 5 carry-overs (C8/C9/C10/C11/C13) + 3 surface observations (script-handler.ts:133 sync write, headless push channels, exit-2 mutate-with-warnings) from the 2026-06-29 v1.15.5 red-list.

**Baseline**: v1.15.5 PATCH (`e69753c`) + v1.16.0 MINOR (`6137cb1`). C12 closed in v1.16.0. v1.15.5 C2 safety nets (`unhandledRejection` + `uncaughtException` log-only) verified intact at `src/main/index.ts:10-19`.

**Lenses**:

1. Security (SE) — injection / XSS / secrets / path containment / authn / crypto / input validation / race / layer violations
2. IPC Surface (IPC) — channel registration completeness / push source-sink balance / contract drift / preload surface / error propagation
3. File-IO (FIO) — atomic write coverage / partial-write exposure / sync IO in async contexts / errno mapping / path containment / race windows
4. Process Bootstrap (PB) — init ordering / shutdown sequencing / unhandled rejection / crash recovery / memory leaks / cross-process invariants

**Per v1.15.5 lesson #1**: single-agent self-review is structurally blind. v1.15.5's joint review caught all 6 PATCH-eligible findings + flagged C12 as structural CRITICAL. This Gate A re-runs the same 4-way audit on the v1.17.0 carry-overs.

---

## 1. Carry-Over Verdict (all 4 lenses)

| ID      | Topic                                              | Security                   | IPC      | File-IO  | Process                 | Net verdict                                              |
| ------- | -------------------------------------------------- | -------------------------- | -------- | -------- | ----------------------- | -------------------------------------------------------- |
| **C8**  | MULTIPLICITY-CONFIG-CLASSES validation consumption | MEDIUM (validator gap)     | None new | None new | None new                | **Proceed** as planned; validator/emit work is in scope. |
| **C9**  | `<DERIVED-FROM>` classifier attachment             | MEDIUM (schema integrity)  | None new | None new | None new                | **Proceed**.                                             |
| **C10** | FOREIGN-REFERENCE-DEF dest preservation            | LOW (validation integrity) | None new | None new | None new                | **Proceed**.                                             |
| **C11** | `<MODULE-REF>` silent drop                         | MEDIUM (schema integrity)  | None new | None new | None new                | **Proceed**.                                             |
| **C13** | AppHeader / useProjectActions file split           | LOW (hygiene)              | None new | None new | PB-6 LOW (TDZ ordering) | **Proceed**; PB-6 enforces code-review checklist.        |

**No CRITICAL or HIGH security risks** in the 5 carry-overs. All are correctness/validation/hygiene gaps. **No new IPC channels, no new IO paths, no lifecycle interaction** in the 5 carry-overs. v1.17.0 MINOR scope is safe to execute as planned.

---

## 2. Surface Observation Verdict

### Obs-1 — `script-handler.ts:133` sync `writeFileSync` ✅ IN SCOPE (v1.15.6 PATCH)

- **All 4 lenses flag**: FIO-1 HIGH (durability + TOCTOU), IPC-3 MEDIUM (threading), SE/Obs-1 MEDIUM (trust-sprint invariant violation), PB-3 HIGH (shutdown drain dependency).
- **v1.15.6 PATCH** is the agreed carrier. Migration to `await writeAtomic(...)` resolves FIO-1, IPC-3, SE/Obs-1. PB-3 (shutdown drain) requires Batch 2 add-on after the sync write is gone.

### Obs-2 — Headless push channels (no emitters) 🟡 DEFER

- **All 4 lenses confirm**: IPC-2 HIGH, SE-3 MEDIUM, FIO-2 LOW. Channels `HEADLESS_MUTATE_APPLIED` / `HEADLESS_VALIDATE_RESULT` declared in `IPC_CHANNELS` but neither registered nor emitted. Documented intentional design — no fix until real emitter lands (v1.18.0 GUI bridge scope).

### Obs-3 — Exit-2 mutate-with-warnings (gated on `applyPatchSteps.warnings`) ✅ IN SCOPE (Batch 2)

- **All 4 lenses confirm**: SE-7 LOW (silent `String(raw)` fallback in `replace` op at `applyPatchSteps.ts:481-492`). Implementation must NOT round-trip attacker-controlled `value` payloads as warning text. Bundle fix with Obs-3 (same code path).

---

## 3. NEW Findings — Recommended for v1.17.0 Scope

These findings were surfaced by the 4-agent audit and are NOT in the original plan. Strong candidates (HIGH severity + low cost + cross-cutting) are listed first.

### Tier 1 — Strongly Recommended (HIGH severity + low cost, fits Batch 1/2)

| ID               | Lens     | Title                                                                                             | File / line                                                                                                                            | Cost                                                                 |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **FIO-2 / SE-4** | FIO + SE | `stencilSaveHandler.ts:97` plain `fs.writeFile` — bypasses `writeAtomic` invariant                | `src/main/stencil/stencilSaveHandler.ts:97`                                                                                            | 1-line fix (`await writeAtomic(targetPath, req.xml)`)                |
| **PB-1**         | PB       | No `webContents.on('render-process-gone' / 'unresponsive' / 'gpu-process-crashed')` handlers      | `src/main/index.ts:25-60` (`createMainWindow`)                                                                                         | +5-15 lines + 1 test                                                 |
| **PB-4**         | PB       | No renderer-side root `<ErrorBoundary />`                                                         | `src/renderer/main.tsx:12-16` (only `<StrictMode>`)                                                                                    | +30-50 lines (ErrorBoundary component + render fallback)             |
| **PB-3**         | PB       | No `before-quit` / `will-quit` drain phase; in-flight `writeAtomic` orphans `.tmp-` files on quit | `src/main/index.ts:78-82` + `src/main/io/writeAtomic.ts:27-53`                                                                         | +20-40 lines + 1 test                                                |
| **PB-5**         | PB       | No save-before-close prompt on OS X-button (renderer `beforeunload` absent)                       | `src/renderer/main.tsx` + `src/main/index.ts:78-82`                                                                                    | +50-80 lines + 1 test                                                |
| **SE-1**         | SE       | `sandbox: false` on BrowserWindow webPreferences — defense-in-depth regression                    | `src/main/index.ts:34-39`                                                                                                              | 1-line config + comment (audit preload bridge for Node handle leaks) |
| **IPC-1**        | IPC      | `SCRIPT_PROGRESS` push channel has renderer listener but no emitter — orphan subscription         | `src/main/ipc/script-handler.ts` (missing `webContents.send`); renderer listener at `useScriptActions.ts:95` → `ScriptPanel.tsx:77-82` | +10 lines (emit from `scriptRunHandler`) OR rip renderer subscriber  |
| **IPC-4**        | IPC      | `useProjectActions.saveProject` lacks `invoke` `try/catch` envelope                               | `src/renderer/hooks/useProjectActions.ts:292-312`                                                                                      | +5 lines (try/catch wrap)                                            |
| **IPC-5**        | IPC      | `useProjectActions.openProjectFromDialog` lacks `invoke` `try/catch` envelope                     | `src/renderer/hooks/useProjectActions.ts:434-475`                                                                                      | +5 lines (try/catch wrap)                                            |
| **SE-7**         | SE       | `applyPatchSteps` `replace` op silently coerces unknown via `String(raw)` for `reference` type    | `src/core/mutation/applyPatchSteps.ts:481-492`                                                                                         | +5 lines (reject non-`{value: string}` with `patch-invalid`)         |

**Total Tier 1 cost**: ~10-15 commits, +4-6 tests, 1-2 review rounds. Each item is small enough to fold into existing batches:

- **Batch 1 (Type Rip)**: FIO-2 (writeAtomic migration fits the writeAtomic theme from v1.15.5 C1); IPC-1 (emit `SCRIPT_PROGRESS` from `scriptRunHandler`); SE-7 (reject unknown shape in `replace` op)
- **Batch 2 (Refactor + Warnings)**: IPC-4 + IPC-5 (try/catch envelopes fit the useProjectActions refactor); PB-1 + PB-4 (renderer crash + ErrorBoundary pair); PB-3 (shutdown drain — pairs naturally with the v1.15.6 async conversion); SE-1 (one-line config + comment)
- **Batch 3 (Variant)**: nothing from Tier 1 here
- **Indep (could ship in v1.15.6 PATCH)**: PB-5 (save-before-close) — but requires renderer-side `beforeunload` which is renderer scope, not main scope. Likely better in Batch 2.

### Tier 2 — Recommended (paired scope creep, opt-in)

| ID       | Lens | Title                                                                                                      | Severity | Notes                                                                                                                             |
| -------- | ---- | ---------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **LR-1** | PB   | No `PROJECT_CLOSE` IPC; `_openProjectManifestPath` is process-wide singleton that resets only on test path | HIGH     | Recommend: ship `PROJECT_CLOSE` IPC + renderer's "Close Project" affordance. Defer to v1.18.0 if Batch 2 already grows too large. |
| **LR-2** | PB   | No `webContents.on('did-finish-load')` handshake; renderer may invoke IPC before preload bridge is ready   | MEDIUM   | Defer to v1.18.0; not blocking.                                                                                                   |

### Tier 3 — Defer to v1.18.0 / Backlog (low impact / speculative)

| ID        | Lens | Title                                                                                                       | Severity                                                      |
| --------- | ---- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **PB-2**  | PB   | `PROJECT_OPEN` populates manifest path AFTER reading BSWMDs — partial-failure state leak                    | HIGH (deferral OK — surfaces only on cascading failure paths) |
| **FIO-3** | FIO  | `projectWriteArxmlBatchHandler` partial-write semantics; no rollback of successful writes on batch failure  | MEDIUM                                                        |
| **FIO-4** | FIO  | `templates/copy.ts` sync `mkdirSync` + `copyFileSync` in IPC handler (event-loop block on slow disks)       | MEDIUM                                                        |
| **FIO-5** | FIO  | `isPathInside` symlink-parent false positive (OneDrive edge case)                                           | LOW                                                           |
| **FIO-6** | FIO  | `post-process.ts:73-75` writeAtomic missing `fsync` (generator + CLI versions)                              | MEDIUM                                                        |
| **FIO-7** | FIO  | `register.ts` OPEN_ARXML handlers lack size cap (32 MiB cap exists for BSWMD but not for user-picked ARXML) | LOW                                                           |
| **SE-2**  | SE   | `transaction.ts:58-69` `as never` cast for non-string object payloads in set-param                          | MEDIUM                                                        |
| **SE-3**  | SE   | Headless push channels declared without listeners (IPC-2 from another angle)                                | MEDIUM (defer; pairs with IPC-2 in v1.18.0)                   |
| **SE-5**  | SE   | ARXML size cap on `req.xml.length` (UTF-16 code units) not bytes                                            | LOW                                                           |
| **SE-6**  | SE   | Settings-file feature-flag readers use sync IO in main boot path                                            | LOW                                                           |
| **SE-8**  | SE   | `PROJECT_SAVE` loose-mode path containment gap                                                              | LOW (close alongside PROJECT_SAVE refactor)                   |
| **IPC-2** | IPC  | Headless push channels declared with no path-to-emit                                                        | HIGH (defer; real emitter ships v1.18.0)                      |
| **IPC-6** | IPC  | `'feature-flags:get'` is string literal, not `IPC_CHANNELS` constant                                        | LOW                                                           |
| **IPC-7** | IPC  | Headless stubs accept `unknown` request payload (typed shape drift risk)                                    | LOW                                                           |
| **LR-1**  | PB   | No `PROJECT_CLOSE` IPC; process-wide singleton (also in Tier 2)                                             | HIGH                                                          |
| **LR-2**  | PB   | No `webContents.on('did-finish-load')` handshake (also in Tier 2)                                           | MEDIUM                                                        |
| **LR-3**  | PB   | StrictMode double-mount in renderer dev mode amplifies close-timer / effect leak risk                       | LOW                                                           |
| **PB-6**  | PB   | TDZ-declaration-ordering in C13 split (code-review enforce)                                                 | LOW                                                           |

---

## 4. Cross-Finding Overlap (deduplicated)

Same root cause from multiple lenses:

| Root cause                            | Lenses flagging                            | Combined target                                       |
| ------------------------------------- | ------------------------------------------ | ----------------------------------------------------- |
| `script-handler.ts:133` sync write    | FIO-1 + IPC-3 + SE/Obs-1 + PB-3 dependency | **v1.15.6 PATCH** (already in plan) + PB-3 in Batch 2 |
| `stencilSaveHandler.ts:97` non-atomic | FIO-2 + SE-4                               | **Batch 1** — fits writeAtomic theme                  |
| Headless push channels no emitter     | IPC-2 + SE-3 + Obs-2                       | **v1.18.0** (no real emitter yet)                     |
| `useProjectActions` IPC envelopes     | IPC-4 + IPC-5                              | **Batch 2** — fits C13 refactor                       |
| Renderer crash + ErrorBoundary        | PB-1 + PB-4                                | **Batch 2** — paired                                  |
| Shutdown drain                        | PB-3 + FIO-1 dependency                    | **Batch 2** — paired with v1.15.6 PATCH               |

---

## 5. Recommended v1.17.0 Scope Adjustments

### Add to v1.17.0 (Tier 1, ~10-15 commits, +4-6 tests)

**Batch 1 additions** (Type Rip):

- FIO-2 / SE-4 — `stencilSaveHandler` migrate to `writeAtomic`
- IPC-1 — emit `SCRIPT_PROGRESS` from `scriptRunHandler` (or rip the orphan subscription; recommend emit)
- SE-7 — reject non-`{value: string}` in `applyPatchSteps.replace` op with `patch-invalid`

**Batch 2 additions** (Refactor + Warnings):

- IPC-4 + IPC-5 — `useProjectActions` invoke `try/catch` envelopes
- PB-1 + PB-4 — renderer crash recovery + ErrorBoundary
- PB-3 — `before-quit` / `will-quit` drain phase
- SE-1 — `sandbox: true` on BrowserWindow (audit preload bridge for Node handle leaks first)

**v1.15.6 PATCH additions** (still optional):

- PB-5 — save-before-close on OS X-button. Could ship in Batch 2 instead.

### Defer to v1.18.0 (Tier 2 + Tier 3)

- LR-1 (PROJECT_CLOSE IPC), LR-2 (did-finish-load handshake)
- FIO-3, FIO-4, FIO-5, FIO-6, FIO-7
- SE-2, SE-3, SE-5, SE-6, SE-8
- IPC-2, IPC-6, IPC-7
- PB-2 (manifest path ordering), PB-6 (TDZ enforce), LR-3 (StrictMode)

### Tier 1 effort / risk

| Batch         | New commits                   | New tests | Risk                               |
| ------------- | ----------------------------- | --------- | ---------------------------------- |
| Batch 1       | +3-4                          | +1-2      | Low (each is small + isolated)     |
| Batch 2       | +5-7                          | +3-4      | Medium (PB-1/PB-4 are user-facing) |
| v1.15.6 PATCH | unchanged (optional PB-5 add) | +1        | Low                                |

**Plan delta**: Total v1.17.0 +29 tests becomes +35 tests, +19-25 commits becomes +27-36 commits.

---

## 6. Verification Plan for the Additions

Each Tier 1 item gets:

- A unit test in the appropriate `__tests__/` subdir (RTL/CLI/integration per pattern)
- A manual check documented in release notes
- A code-reviewer verdict `0C/0H/0I/M` per commit

---

## 7. Lessons Reinforced

| #   | Lesson                                          | Reinforced by                                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Joint-review trigger requires multi-agent audit | **Confirmed**: 4 lenses caught 22 distinct findings; 10 are Tier 1 candidates. Single-agent self-review would have missed FIO-2, IPC-1, SE-1, PB-1/PB-4, PB-5.                                                                                                                                                                          |
| 2   | Renderer store reverse-imported a main helper   | **Confirmed**: `useProjectActions` C13 split must grep `@main/*` per Gate C.                                                                                                                                                                                                                                                            |
| 3   | Type-union extension triggers downstream rip    | **Confirmed**: C9 + C10 will rip 5+ files; pre-emptive grep is mandatory.                                                                                                                                                                                                                                                               |
| 4   | writeAtomic errno source drift                  | **Confirmed**: v1.15.6 PATCH inherits this. FIO-2 (Batch 1) adds another invariant site.                                                                                                                                                                                                                                                |
| 5   | Multi-batch PATCH PKM pattern                   | **Confirmed**: Tier 1 additions span 3 batches; PKM per-batch applies.                                                                                                                                                                                                                                                                  |
| 6   | Path-alias ESLint blind spot                    | **Confirmed**: v1.16.0 layered guard worked; future layered audits must include the alias form.                                                                                                                                                                                                                                         |
| 7   | Type-only re-export = zero-cost seam            | **N/A in this review**                                                                                                                                                                                                                                                                                                                  |
| 8   | Prettier reformat bundled into final batch      | **Confirmed**: Batch 3 carries prettier.                                                                                                                                                                                                                                                                                                |
| 9   | EXIT_WARNING=2 invariant test pattern           | **Confirmed**: Obs-3 extends existing C7 test.                                                                                                                                                                                                                                                                                          |
| 10  | Network flake recovery (3 attempts → fallback)  | **N/A in this review**                                                                                                                                                                                                                                                                                                                  |
| 11  | writeAtomic coverage audit (NEW)                | **Surfaced by FIO-1**: 2 remaining sync write sites (`script-handler.ts:133` + `stencilSaveHandler.ts:97`). v1.15.5 C1 missed `stencilSaveHandler`. **Lesson**: when extracting writeAtomic, grep all writeFile/writeFileSync callers across `src/main/`, not just `src/main/io/`.                                                      |
| 12  | SCRIPT_PROGRESS push channel audit (NEW)        | **Surfaced by IPC-1**: declared in `IPC_CHANNELS`, registered in preload bridge, consumed by renderer `useScriptActions.subscribeProgress`, but NO emitter in `src/main/`. **Lesson**: every push channel needs a bidirectional audit (declared → registered → emitter → listener). The current code only audits declared → registered. |

---

## 8. Sign-Off

| Lens              | Agent   | Status      |
| ----------------- | ------- | ----------- |
| Security          | Explore | ✅ Complete |
| IPC Surface       | Explore | ✅ Complete |
| File-IO           | Explore | ✅ Complete |
| Process Bootstrap | Explore | ✅ Complete |

**Joint verdict**: v1.17.0 MINOR scope is sound. 5 carry-overs are correctness/validation/hygiene gaps with no HIGH or CRITICAL security/IO/IPC/lifecycle impact. **Tier 1 additions are strongly recommended** to ship alongside the planned work (Batch 1 + 2 absorb them naturally). Tier 2 + Tier 3 defer to v1.18.0 / backlog.

---

## 9. Scope Decision — LOCKED

**Tier 1**: All 10 items accepted. v1.17.0 scope expanded from 6 → 16 items.

**Obs-3 + SE-7**: Bundle together (same code path `applyPatchSteps.ts:481-492`).

### Locked v1.17.0 scope (16 items)

**Batch 1 — Type Rip (8 items)**:

- C11 `<MODULE-REF>` attachment
- C9 `<DERIVED-FROM>` classifier
- C10 FOREIGN-REFERENCE-DEF dest preservation
- FIO-2 / SE-4 — `stencilSaveHandler` migrate to `writeAtomic`
- IPC-1 — `SCRIPT_PROGRESS` push channel emit from `scriptRunHandler` (or rip the orphan subscription; recommend emit)
- SE-7 — `applyPatchSteps.replace` op reject non-`{value: string}` shape with `patch-invalid`

**Batch 2 — Refactor + Warnings (7 items)**:

- C13 — AppHeader (820 → 6 files) + useProjectActions (791 → 7 files) split
- Obs-3 — `ApplyResult.warnings: StepWarning[]` field (bundled with SE-7)
- IPC-4 + IPC-5 — `useProjectActions.saveProject` + `openProjectFromDialog` `try/catch` envelopes
- PB-1 + PB-4 — Renderer crash recovery (`webContents.on('render-process-gone' / 'unresponsive' / 'gpu-process-crashed')`) + root `<ErrorBoundary />`
- PB-3 — `before-quit` / `will-quit` drain phase (in-flight writeAtomic)
- SE-1 — `sandbox: true` on BrowserWindow (audit preload bridge for Node handle leaks first)

**Batch 3 — Variant (1 item)**:

- C8 — MULTIPLICITY-CONFIG-CLASSES validation consumption (POST-BUILD variant engineering)

**v1.15.6 PATCH (1 item, ships first)**:

- Obs-1 — `script-handler.ts:133` async writeFile conversion

### Test count delta

| Source                                   | Tests   |
| ---------------------------------------- | ------- |
| Original v1.17.0 (5 carry-overs + Obs-3) | +29     |
| Tier 1 additions                         | +6      |
| v1.15.6 PATCH                            | +1      |
| **Total v1.17.0 MINOR + v1.15.6 PATCH**  | **+36** |

### Commit count delta

| Source                                  | Commits   |
| --------------------------------------- | --------- |
| Original v1.17.0                        | 19-25     |
| Tier 1 additions                        | +10-15    |
| v1.15.6 PATCH                           | 3         |
| **Total v1.17.0 MINOR + v1.15.6 PATCH** | **32-43** |

### Review rounds delta

| Source                                  | Rounds |
| --------------------------------------- | ------ |
| Original v1.17.0                        | 10     |
| Tier 1 additions (mostly in Batch 2)    | +2     |
| v1.15.6 PATCH                           | 2      |
| **Total v1.17.0 MINOR + v1.15.6 PATCH** | **14** |

---

## 10. Recommended Next Step

→ Gate B (spec document) → Gate C (Phase 2.5 brief-drift) → v1.15.6 PATCH → Batch 1 → Batch 2 → Batch 3 → ship v1.17.0.
