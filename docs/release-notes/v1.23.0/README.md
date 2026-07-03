# v1.23.0 (2026-07-03) — MINOR · Release Notes

DBC→Com-Stack bridge. Closes the long-standing "I need 80 ComIPdus and I don't want to hand-type them" gap that every Classic AUTOSAR toolchain solves (DaVinci Network Designer, tresos AutoSAR Configurator, ETAS BSW editor). New `DBC_IMPORT_COM_STACK` IPC + 3-step wizard ingests a DBC file and writes 3 ARXML files (Com / CanIf / PduR) atomically. Validated end-to-end against the bundled demo-ECU + real `powertrain-typical.dbc` from `dbc-forge`.

The ODX viewer (v1.22.0) and the DBC viewer (v1.21.0) were both read-only; v1.23.0 turns the DBC viewer into a write-side importer. Read-only ODX viewer unchanged (ODX→ARXML bridge is a different scope, deferred to v1.24.x).

---

## Highlights

### T1 — Extended DBC parser with signal-level detail

`dbcParseForBridgeHandler` is a new IPC handler that re-parses a DBC file with **per-signal metadata** retained (startBit, length, byteOrder, valueType, factor, offset, min, max, unit, receivers). The existing `parseDbcHandler` (v1.21.0) returns a signal-summary-free `DbcSummary` — it stays unchanged for the viewer. The new handler is the bridge-side input.

- `DBC_MAX_BYTES = 32 MiB` (matches the DBC / ARXML / BSWMD convention).
- `DbcSummaryWithSignals = DbcSummary & { signals: readonly DbcSignalSummary[] }`.
- 5 tests: cap value, at-cap boundary, non-string, empty, malformed, happy path + per-field.

**Plan bug caught pre-implementation**: the plan's `projectSignal()` had `sig.byteOrder === 1 ? 'little-endian' : 'big-endian'` — but dbc-forge exposes `byteOrder` as a **literal string** (`'little-endian' | 'big-endian'`), not numeric `0`/`1`. The literal-string check would have coerced every signal to `'big-endian'`. The implementer caught this by verifying the actual dbc-forge types before coding. Plan was updated post-implementation; future bridge work must NOT regress the literal-string pass-through.

### T2 — Pure mapper `dbcToComStack`

Pure function: `DbcSummaryWithSignals` + 3 ECUC value-side ARXML strings → `DbcBridgePlan = { comPatches; canIfPatches; pduRPatches }`. No IO, no React state. The renderer applies the patches via the existing `applyPatchSteps` mutation engine.

**Idempotency** (key requirement): re-running the wizard on an already-bridged project must NOT duplicate instances. Dedup key = container shortName in each ECUC file.

**Real-OEM fixture**: `samples/dbc/powertrain-typical.dbc` (real `dbc-forge` vendor export: 2 nodes `ECM`/`TCM`, 2 messages `EngState`/`TransState`, 4 signals). Plus the existing `samples/arxml/demo-ecu/` Com/CanIf/PduR BSWMD + value-side ARXML files.

**5 ship-blockers caught pre-ship by code review + fix wave**:

1. **CRITICAL — hardcoded path constants** — Plan shipped `CANIF_TX_PDU_PATH = '/CanIf/CanIf/CanIfInitConfig/CanIfTxPduCfgs'` and `PDUR_ROUTING_PATH = '/PduR/PduR/PduRRoutingTables'`. Real demo-ecu uses `CanIfInitCfg` and `PduRRoutingPaths`. **Fix**: `discoverPrimaryContainer(arxml, moduleName)` walks the parsed ECUC module's first child at runtime, no hardcoded names.
2. **HIGH — parser bug** — `buildContainer` in `src/core/arxml/parser.ts:418` only read `<SUB-CONTAINERS>`, not `<CONTAINERS>`. Real demo-ecu files use the wrapped `<CONTAINERS>` shape. **Fix**: `buildContainer` now reads both (mirrors `buildModule`).
3. **HIGH — kind discriminator** — Plan's test filtered patches by `parentPath.split('/').length === 4` to distinguish ComIPdus from ComSignals. Fragile. **Fix**: added `kind?: 'com-ipdu' | 'com-signal' | 'canif-tx-pdu' | 'canif-rx-pdu' | 'pdur-route'` discriminator on `add-child` step. Mutation engine ignores it; tests filter by `kind`.
4. **HIGH — real-OEM test didn't actually exercise idempotency** — DBC message names (`EngState`, `TransState`) didn't collide with the demo-ecu's pre-existing ComIPdu names (`ComIPdu_1`, `ComIPdu_2`), so the dedup branch was never reached. **Fix**: added `EngState` to the demo-ecu Com_Config.arxml so the skip path actually runs.
5. **HIGH — Rx direction always treated as Tx** — Every message became a `CanIfTxPduCfg` regardless of who transmits. In production this would silently drop received frames on ECUs that only receive some messages. **Fix**: `DbcToComStackInput.targetNode?: string` parameter; mapper dispatches `msg.transmitter === targetNode` → Tx, otherwise Rx. Legacy fallback (`targetNode=undefined` → all-Tx) preserved for back-compat, JSDoc'd.

14 unit tests (5 hand-crafted + 5 fix-validation + 4 dispatched by implementer) + 2 real-OEM tests.

### T3 — IPC handler `dbcImportComStack` with 3-file atomic write

`dbCImportComStackHandler` orchestrates: parse DBC (T1) → call `dbcToComStack` pure mapper (T2) → parse each of 3 ECUC ARXML files → apply patch steps via `applyPatchSteps` → serialize → write all 3 files via the existing `writeAtomic` helper (tmp + rename per file).

- `DBC_IMPORT_COM_STACK = 'dbc:importComStack'` IPC channel + types in `src/shared/ipc-contract.ts` + `src/shared/types.ts`.
- Handler accepts optional `targetNode?: string` for Rx/Tx dispatch.
- **Per-file atomicity**: `writeAtomic` is tmp + rename. **Cross-file atomicity**: not transactional (deferred to v1.23.1 PATCH); partial-write failure leaves the project in a documented "apply-succeeded + reload-failed" state (rare race against AV or network drive teardown).
- 4 tests: input validation, cap exceeded, real-OEM round-trip (com=1, canIf=0, pduR=2 on demo-ecu), idempotency re-run (0 counts).

**2 ship-blockers caught pre-ship by code review + fix wave**:

1. **CRITICAL/HIGH — `targetNode` semantic mismatch** — T3 IPC requires `targetNode` to be a DBC `BU_` node name (`ECM`, `TCM`). T4 wizard plan originally described it as "EcuC `<ECU-INSTANCE>` shortName" — these are NOT the same (`ECM_DEMO` ≠ `ECM`). **Fix**: JSDoc on `DbcImportComStackRequest.targetNode` explicitly says "must be a DBC `BU_` node name (one of the entries in `DbcSummary.nodes`)". Plus a runtime validator: `targetNode='NONEXISTENT'` returns `kind: 'read-failed'` with message "Available nodes: ECM, TCM".
2. **HIGH — `await import(...)` was inconsistent with peer handlers** — 5 sibling handlers use static `import { writeAtomic }`. T3's dynamic import added a per-call microtask and set a bad precedent. **Fix**: hoisted to top-of-file static import.

### T4 — 3-step wizard UI + menu wiring

`DbcImportWizard` modal: **SelectDbc** (file picker) → **PreviewMapping** (shows DBC messages + targetNode dropdown) → **ConfirmApply** (3-file write + project reload). Wired into AppHeader File Operations menu as "Import DBC → Com Stack…" (📥).

- **targetNode dropdown** is populated from `dbc.nodes` (DBC `BU_` names), NOT from the active project's EcuC instance name. Next button disabled until a node is selected (defensive client-side gate; IPC also validates).
- **18 i18n keys** for wizard labels (en + zh-CN).
- 6 wizard tests + 4 AppHeader test files updated for new props.
- 2743 baseline → 2751 (+8 net) after the 8 new tests.

**2 fix waves on T4**:

1. **CRITICAL — i18n parity drift (13 of 18 keys dead-weight)** — Implementer shipped wizard with hardcoded English text despite the 18-key i18n contract. zh-CN-locale users would have seen English UI. **Fix**: wired 11 keys through `t(locale, …)` calls; dropped `dbc.import.step.select` (wizard is host-driven mount, never reaches Step 1); dropped `dbc.import.error.parse` (parity-only).
2. **HIGH — no project reload after apply** — Apply succeeded but the in-memory store still held pre-import ECUC values, so users saw stale data. `project:open` is dialog-only (pops a file picker); a non-dialog `project:reload` channel didn't exist. **Fix**: new `PROJECT_RELOAD` IPC channel + handler + preload bridge + 6 tests; App.tsx apply handler now calls `api.projectReload` and feeds the result into `useArxmlStore.openProject`. Sandbox-flip test extended to assert `'projectReload'` is on the allowlist.
3. **HIGH — Apply-success toast count only `com`** — Preview step says "N messages will be imported" but success toast used `addedCounts.com` alone. If bridge dropped a message at CanIf or PduR, M < N silently. **Fix**: success count is now `com + canIf + pduR` total, matches Preview count invariant.

---

## Stats

| Metric | Value |
|---|---|
| Commits on main | 9 (T1 + T2 + T2-fix + T3 + T3-fix + T4 + T4-fix + T4-cleanup + 1 release commit) |
| Test count | **2751 + 6 SKIP / 0 fail** (+38 net from v1.22.0 2713) |
| Test files | 304 + 1 skipped (305) |
| pnpm verify | 7-stage GREEN (format / lint / type-check / test / coverage / build / import-regression) |
| Coverage | TBC (re-derive from `pnpm verify` output) |
| Files touched | ~30 (10 new + 18 mod + 1 new fixture) |
| Behavioral changes | 4 (DBC parse-with-signals IPC; Com/CanIf/PduR import IPC; 3-step wizard; `project:reload` IPC) |
| Real-OEM fixture | `samples/dbc/powertrain-typical.dbc` (real `dbc-forge` vendor export: 2 nodes / 2 messages / 4 signals) |
| Code-review cycles | T1: 0C/0H/1M/1L approve. T2: 1C/4H BLOCK-NEXT → FIX 0C/0H/1M/1L approve. T3: 0C/2H FIX-BEFORE-NEXT → FIX 0C/0H/0M/0L approve. T4: 1C/3H BLOCK-NEXT → FIX 0C/1H/1M/2L WARNING → cleanup approve. |

---

## Migration notes

No data migration required. All changes are renderer / IPC / branding.

- Renderer-side users will see a new "Import DBC → Com Stack…" menu item in the File Operations dropdown (icon: 📥).
- **Existing DBC viewer unchanged** (v1.21.0 DbcViewer modal still works for read-only inspection).
- **`useArxmlStore.openProject` semantics**: callers that previously triggered a full project reload must now use `project:reload` IPC (non-dialog) — `project:open` remains dialog-only.
- **`DbcSummary.signals` field** is now optional (added by `dbcParseForBridgeHandler`, omitted by `parseDbcHandler`). Existing consumers of `DbcSummary` that destructured strictly may need to relax their types — but no consumer in the project does, so this is forward-compatible only.
- **3-file write is per-file atomic, not transactional**. If `writeAtomic` fails on the 2nd of 3 files (AV scan, network drive teardown), the first file is already committed; the user sees "imported N + open project failed" toasts. To rollback, re-import the previous DBC (which is now an unintended dedup), or manually revert the file from version control. **Documented limitation**; v1.23.1 PATCH will add transactional wrap.

---

## Cycle-end lessons (NEW permanent notes captured in PKM)

1. **`plan-bug-should-be-corrected-before-next-task`** (**NEW**, 1-of-1 cross-project with v1.21.0 T4 DBC viewer) — Plan code blocks can be wrong even when brainstorming + plan-write + pre-flight review approve. v1.23.0 caught 2: T1's `byteOrder === 1` (literal string, not numeric) and T2's hardcoded `CanIfInitConfig` / `PduRRoutingTables` (real demo-ecu uses `CanIfInitCfg` / `PduRRoutingPaths`). Both were caught when implementer compared plan against actual API/library. **Lesson**: implementer should run `grep` / type-verify on the actual library before transcribing plan code, especially for hardcoded strings that look like constants.
2. **`real-fixture-tests-must-actually-exercise-the-claimed-path`** (**NEW**, 1-of-1) — Code review caught T2's "idempotency" test that didn't actually test idempotency because the DBC message names (`EngState`/`TransState`) didn't collide with the demo-ecu's pre-existing ComIPdu names (`ComIPdu_1`/`ComIPdu_2`). Real-fixture tests must mutate the fixture to create a name collision that exercises the code path under test. **Lesson**: any real-OEM test that claims "X behavior on real data" must include a positive case where X actually fires.
3. **`real-oem-fixture-must-be-shipping-gate`** (3-of-1, candidate for permanent — see existing `vendor-format-parser-needs-real-fixture-pre-ship`) — T3's real-OEM round-trip surfaced 3 latent bugs in T1/T2: T2's `parentPath` semantics (parentPath must NOT include the new instance name), `bswmd.ts:1144` `buildContainer` only reading `<SUB-CONTAINERS>` (mirrors the v1.23.0 T2 fix in `parser.ts:418-433`), and phantom ComSignal adds that the BSWMD didn't declare. All 3 hand-crafted fixtures in T1/T2 hid these. **Lesson promotion**: real-OEM round-trip from T3→T2→T1 is the single most valuable test in the chain. Promote to permanent note.
4. **`dem-to-odx-bridge-not-industry-workflow`** (**NEW**, 1-of-1) — v1.23.0 pivoted mid-brainstorm from "ODX → Dem ECUC" (originally proposed) to "DBC → Com-stack" because research showed no commercial AUTOSAR tool ships a direct ODX→Dem bridge. Every vendor (Vector / EB / ETAS) goes through Diagnostic Extract ARXML as the intermediate. Saved 1-2 weeks of building the wrong thing. **Lesson**: before scoping a vendor-format bridge, research the industry workflow to confirm the target shape is real, not speculative.

---

## v1.22.0 backlog closure

- v1.22.0 ship had 2 deferred items: M1 XMLValidator preflight (defensive, not load-bearing) and the ODX→ARXML bridge (deferred scope). Both still open.
- v1.23.0 does NOT close either of these — they're v1.22.x PATCH candidates, not v1.23.0 scope.

---

## Closest cousins

- [[claude-autosarcfg-v1-22-0-shipped]] (v1.22.0 MINOR — prior release; ODX viewer)
- [[claude-autosarcfg-v1-21-0-shipped]] (v1.21.0 MINOR — DBC viewer + BSW generator; v1.23.0 T1/T2 extend the DBC parsing + add the write-side importer that v1.21.0 deferred)
- [[peakcan-host-v2-0-4-patch-shipped]] (sister project — v2.0.4's real-OEM `.odx-d` import was the inspiration for v1.22.0 T4's real-fixture validation pattern; v1.23.0 T2's real-DBC fixture borrows the same "use vendor export as test file" approach)
- [[vendor-format-parser-needs-real-fixture-pre-ship]] (NEW permanent note promoted from peakcan-host v2.0.4 + v1.22.0 T4; v1.23.0 T3 added a 3rd occurrence candidate for permanent promotion)
- [[phase-2-5-brief-drift-correction]] (Shape 10 promoted from v1.20.0 brief-drift — target-source-canonical-state verification)

---

## Devlog

### 2026-07-03 — v1.23.0 MINOR ship + DBC→Com-Stack bridge end-to-end

**Session summary**
- Shipped v1.23.0 MINOR on main: 8 feature commits across T1/T2/T3/T4 (4 fix waves combined into T2-fix/T3-fix/T4-fix/T4-cleanup) + 1 release commit. Tag v1.23.0.
- Closes the long-standing "I need 80 ComIPdus and I don't want to hand-type them" gap.
- Test count: 2751 + 6 SKIP / 0 fail (+38 net from v1.22.0 2713).
- pnpm verify 7-stage GREEN. Real-DBC round-trip against `samples/dbc/powertrain-typical.dbc` (vendor export) + bundled `samples/arxml/demo-ecu/` (3 ECUC value-side files + 3 BSWMD).
- User-manual baseline updated from v1.22.0 to v1.23.0; new "What's New in v1.23.0" section.

**Key decisions**
- T1 ships the signal-level `DbcSummaryWithSignals` extension; the existing `DbcSummary` (no signals) stays for the v1.21.0 viewer. Two parallel handlers, one IPC channel per consumer.
- T2 pivoted from hardcoded path constants to **ARXML path discovery** at runtime — `discoverPrimaryContainer(arxml, moduleName)` walks the parsed ECUC module's first child. Self-contained, no BSWMD paths required.
- T2 added `kind` discriminator to `add-child` patches (com-ipdu / com-signal / canif-tx-pdu / canif-rx-pdu / pdur-route). Mutation engine ignores the field; tests filter by kind instead of path-segment count.
- T2 mapper is **idempotent** by container shortName; re-running the wizard produces 0 added counts on an already-bridged project.
- T2 added `targetNode?: string` parameter for Rx/Tx dispatch (per DBC `BU_` node name, NOT EcuC instance name).
- T3 added `PROJECT_RELOAD` IPC channel (non-dialog variant of `PROJECT_OPEN`) so the renderer can refresh the in-memory store after the bridge writes 3 files. Without this, users would see stale data.
- T4 wired 11 of 18 i18n keys through `t(locale, …)` (dropped 3 dead-weight keys: `step.select`, `error.parse`, plus 1 fix-wave drop). Final contract: 16 keys, all read at runtime.
- Mid-brainstorm pivot: original scope was "ODX → Dem ECUC direct bridge". Research showed no commercial AUTOSAR tool ships this — every vendor goes through Diagnostic Extract ARXML. Pivoted to "DBC → Com-stack" which IS a first-class workflow in DaVinci / tresos / ETAS.

**Blockers / issues**
- Pre-flight plan review caught 5 issues before T1 (placeholder walker, T3 no-op handler, incomplete register/preload imports, App.tsx manifest fetch placeholder, wrong `<MenuItem>` API).
- T2 BLOCK-NEXT (1C/4H): hardcoded path constants + parser `buildContainer` bug + kind discriminator + real-OEM test fidelity + Rx direction. All 5 fixed in `f1b38ea`.
- T3 FIX-BEFORE-NEXT (0C/2H): `await import(...)` style + `targetNode` validation. Both fixed in `0f1a782`.
- T4 BLOCK-NEXT (1C/3H): i18n dead-weight keys + no project reload + success count drift. All 3 fixed in `5644b78` + `888fcda` (cleanup).
- (None at ship time; all blockers resolved pre-commit.)

**Next steps**
- v1.23.x PATCH: cross-file transactional write (currently per-file atomic only); `error.parse` reintroduction if a real parse path emerges; i18n interface split (currently 16 keys, approaching the 900-line ceiling).
- v1.24.x MINOR: ODX → Diagnostic Extract ARXML (deferred from v1.22.0; now natural complement to v1.23.0's DBC→Com-stack).
- v1.25.x MINOR: Excel/CSV → batch create ECUC instances (per the research finding that the "I need 80 instances" pain point is most naturally solved by import wizards, not UI tables).
