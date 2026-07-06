# v1.30.0 MINOR — dcmConfig IPC bridge wiring — Design Plan

> **Read-only planning agent output.** Authored 2026-07-06 by the planner agent for `claude-AutosarCfg`.
> **Title note:** Spec filename uses today's date 2026-07-06 and v1.30.0 (per the task title; v1.29.0 in the dispatch body was a typo).

## 0. Scope (TL;DR)

Wires the existing-but-unregistered `dcmConfigHandler` (v1.27.0 T4) to the IPC bridge end-to-end, plus two small affordances on the same shape: a real-OEM BSWMD override path and an `appliedStepCount` counter on the result. Renderer is intentionally a thin button + IPC round-trip — full UI lands in 1.31.0 PATCH.

**Single MINOR cut. No new architectural surface. Additive on the IPC contract.**

---

## 1. IPC channel + types diff

### 1.1 Channel name — `dcm:config` (new `dcm:*` namespace)

`src/shared/ipc-contract.ts`:

```ts
// v1.30.0 MINOR — Dcm config bridge. Wires the v1.27.0 T4
// dcmConfigHandler (existing-but-unregistered) into the IPC bridge
// so the renderer can drive the ODX + xlsx → Dcm_Config.arxml
// pipeline. First channel in a new dcm:* namespace (no further
// channels are in scope for v1.30.0). Channel name follows the
// unsuffixed v1.22.0 ODX / v1.23.0 DBC / v1.24.0 ODX-bridge
// convention (no `:v1` suffix because this is v1.30.0's first cut
// of the bridge surface; a breaking change would land before v1.31
// anyway). Mirrors the v1.25.0 XLSX 3-IPC surface sibling pattern.
DCM_CONFIG: 'dcm:config',
```

```ts
// v1.30.0 MINOR — top-level alias (mirrors DBC_IMPORT_COM_STACK /
// XLSX_COMMIT_BATCH alias convention at the prior siblings).
export const DCM_CONFIG = IPC_CHANNELS.DCM_CONFIG;
```

**Namespace choice: `dcm:*` (NOT `xlsx:ecuc:batch:*`)**. The dcm bridge is conceptually a sibling of `odx:importDiagnosticExtract` (not part of the Com-stack xlsx batch). Namespacing it under `dcm:` keeps the channel self-describing and leaves room for future Dcm-only operations (`dcm:applyStubs`, etc.) in 1.31.0+.

### 1.2 Types in `src/shared/types.ts`

```ts
// --- v1.30.0 MINOR — dcm:config IPC types -----------------------------------
//
// Closes the v1.27.0 carry-over "dcmConfigHandler implemented but
// no IPC" gap. The handler's pure logic has been integration-tested
// (src/main/ipc/__tests__/dcmConfigHandler.test.ts, ship-blocking
// since v1.27.0); this MINOR only adds the channel + types + the two
// small affordances below. The renderer's DcmConfigTrigger is a
// minimal button — full UI lands in v1.31.0 PATCH.

/**
 * v1.30.0 MINOR — `dcm:config` request payload.
 *
 * Re-exports `DcmConfigHandlerArgs` as the IPC request shape. The
 * handler's `args` type becomes the IPC envelope verbatim (no
 * transformation) — same pattern as the v1.23.0 T3 DBC bridge
 * (DbcImportComStackRequest).
 *
 * `bswmdPath` is OPTIONAL. When provided, the handler skips the
 * `locateDcmBswmdPath()` discovery walk and reads the file at this
 * absolute path verbatim. Real-OEM override path — the user's
 * project manifest (future 1.31.x) will declare an alternate
 * BSWMD location; the renderer forwards the path here.
 */
export interface DcmConfigRequest {
  /** Absolute path of the ODX-D file on disk. */
  readonly odxPath: string;
  /** xlsx rows carrying the 5 Dcm service kinds + per-row params. */
  readonly xlsxRows: readonly EcucInstanceRow[];
  /** Optional output path; defaults to `<odxDir>/Dcm_Config.arxml`. */
  readonly outputPath?: string;
  /**
   * v1.30.0 MINOR — optional real-OEM BSWMD override. When set,
   * the handler reads this file directly and skips the
   * `<samples>/arxml/demo-ecu/bswmd/Bsw_Dcm_Bswmd.arxml` discovery
   * walk. The file MUST be a parseable Dcm BSWMD (canonical
   * AUTOSAR container shortNames per
   * `claude-autosarcfg-canonical-autosar-always-verify` lesson).
   * No `:v1` suffix on the field — additive on the wire.
   */
  readonly bswmdPath?: string;
}

/**
 * v1.30.0 MINOR — `dcm:config` response payload.
 *
 * Re-exports `DcmConfigHandlerResult` (see dcmConfigHandler.ts:57)
 * as the IPC success value. Additive on the existing shape:
 * adds `appliedStepCount` field, keeps the existing 5 fields
 * (`dcmConfigXml`, `odxLinkedDcmDspCount`, `odxLinkedRoutineCount`,
 * `serviceCounts`, `outputPath`) unchanged.
 */
export type DcmConfigResponse = IpcResult<DcmConfigHandlerResult>;
```

**`DcmConfigHandlerResult` stays defined in `src/main/ipc/dcmConfigHandler.ts` (its existing home) — re-exported here for the IPC contract layer's convenience**, matching the `DbcImportComStackResponse` precedent (the `IpcResult<T>` envelope re-exported from `shared/types.ts`).

### 1.3 Convention check

| Aspect | `xlsx:ecuc:batch:*` | `dcm:config` (new) |
|---|---|---|
| Channel namespace | `xlsx:ecuc:batch:*` | `dcm:*` |
| Request type suffix | `Xlsx*Request` | `DcmConfigRequest` |
| Response envelope | discriminated `error.kind` | `IpcResult<T>` |
| Type location | `shared/types.ts` | `shared/types.ts` (new) |
| Handler file | `xlsxEcucBatch*Handler.ts` | `dcmConfigHandler.ts` (existing) |

**Dcm bridge keeps the `IpcResult<T>` envelope (same as v1.27.0 T4 introduced). No migration of the existing handler to a discriminated error envelope in v1.30.0 — that's 1.31.0+ scope.**

---

## 2. `DcmConfigHandlerArgs` extension

### 2.1 Old shape (v1.27.0 T4, current)

```ts
export interface DcmConfigHandlerArgs {
  readonly odxPath: string;
  readonly xlsxRows: readonly EcucInstanceRow[];
  readonly outputPath?: string;
}
```

### 2.2 New shape (v1.30.0 MINOR)

```ts
export interface DcmConfigHandlerArgs {
  readonly odxPath: string;
  readonly xlsxRows: readonly EcucInstanceRow[];
  readonly outputPath?: string;
  /** v1.30.0 MINOR — real-OEM BSWMD override path. */
  readonly bswmdPath?: string;
}
```

### 2.3 bswmdPath precedence rule

**`bswmdPath` wins over `locateDcmBswmdPath(odxPath)` — no fall-through.** When the caller provides `bswmdPath`, the discovery walk is bypassed entirely. Rationale: a real-OEM path is an explicit declaration by the caller; falling back to a sample fixture after a real-OEM miss would silently substitute the wrong BSWMD (fail-soft anti-pattern per `silent-failure-hunter` lesson from Sprint 10 #2). The renderer is responsible for surfacing a "not found" error to the user.

---

## 3. `DcmConfigHandlerResult` extension

### 3.1 Old shape (v1.27.0 T4)

```ts
export type DcmConfigHandlerResult = DcmConfigResult & { readonly outputPath: string };
// (DcmConfigResult = { dcmConfigXml, odxLinkedDcmDspCount, odxLinkedRoutineCount, serviceCounts })
```

### 3.2 New shape (v1.30.0 MINOR)

```ts
export type DcmConfigHandlerResult = DcmConfigResult & {
  readonly outputPath: string;
  /** v1.30.0 MINOR — total PatchStep count the mapper emitted (raw). */
  readonly appliedStepCount: number;
};
```

### 3.3 What `appliedStepCount` counts — decision

**Count `serviceSteps.length` (raw PatchStep total).** Rationale:

- `serviceSteps` is the output of `xlsxDcmServicesToEcucBatch(rows, bswmds)`, which calls `addChildSiblingStep` once per row. Each row produces `1 (add-child) + N (set-param)` PatchSteps where `N = number of non-null, non-undefined params` (per `addChildSiblingStep.ts:102-113`).
- The mutation engine's `applied` counter (from `applyPatchSteps`) counts the same thing: a step that lands without a `noChange` flag. Pre-apply raw count == post-apply `applied` count for the success path (all `add-child` + `set-param` mutate the doc). For the failure path, the raw count is more useful to the renderer (it represents "what we tried to apply") than `applied` (which would be 0 if any step failed).
- Counting "add-child only" (option b) loses the per-param set-param visibility, which is the value-add of the mapper (e.g. a 4-param service row is `1 + 4 = 5` steps; counting just the add-child collapses to 1 and makes the counter look broken).
- Counting "semantic container count" (option c) requires iterating the post-apply doc tree — extra work, redundant with `serviceCounts` (which already tallies per-kind).

**Decision: `appliedStepCount = serviceSteps.length` — raw, computed BEFORE the apply (so the counter is meaningful even when apply partially fails).** This makes it a "what the mapper intended to do" counter, complementary to (not a replacement for) the engine's post-apply `applied` field.

**Trade-off documented**: a future minor that wants post-apply truth can introduce `actualAppliedStepCount` next to it (additive). Naming the field `appliedStepCount` (vs. `intendedStepCount`) matches the renderer-side mental model — "steps applied to the project" — even though technically it's pre-apply. The renderer can clarify in a tooltip if user confusion surfaces (1.31.0 PATCH).

---

## 4. Behavior table for bswmdPath

| `bswmdPath` | `locateDcmBswmdPath` | Behavior | Result |
|---|---|---|---|
| provided, file exists, parseable | (not called) | Handler reads `bswmdPath` directly. Skips discovery. | `{ok: true, value: ...}` with `appliedStepCount` |
| provided, file exists, **malformed** | (not called) | `parseDemoBswmds` throws on parse error. Caught by outer `try/catch` in handler. | `{ok: false, error: {message: 'BSWMD map missing module ...' or parse message}}` |
| provided, file **not found** (ENOENT) | (not called) | `readFileSync` throws ENOENT. Caught by outer `try/catch`. | `{ok: false, error: {message: 'Atomic write failed: ...'}}` (the existing step-1 catch is `readFileSync` on `odxXml`; the bswmd read at step 3 has no try/catch wrapper, so it surfaces via the catch-all — see migration step 4) |
| **omitted** | success | Reads sample fixture at `walkUpForFixture` hit. | `{ok: true, value: ...}` (unchanged from v1.27.0) |
| **omitted** | throws (fixture missing) | Caught by outer `try/catch`. | `{ok: false, error: {message: 'Dcm BSWMD fixture not found via discovery...'}}` (unchanged) |

**Implementation note**: The existing handler at `dcmConfigHandler.ts:184` has `const dcmBswmdXml = readFileSync(dcmBswmdPath, 'utf-8');` without a try/catch wrapper (the read fails go through the outer `try/catch`). For bswmdPath support, we need to resolve the path with `args.bswmdPath ?? locateDcmBswmdPath(args.odxPath)` and wrap the read in a try/catch that returns a specific `IpcResult.error` (`"BSWMD file unreadable: <msg>"`) so the renderer can regex-match this class (mirrors the ODX-unreadable pattern at line 159-166).

---

## 5. Migration plan (step-by-step)

### Step 1: Add `IPC_CHANNELS.DCM_CONFIG` constant
- File: `src/shared/ipc-contract.ts`
- Insert `DCM_CONFIG: 'dcm:config'` after `XLSX_COMMIT_BATCH` (line 213). Add top-level alias `export const DCM_CONFIG = ...` after the existing aliases (line 243).
- Verify: `pnpm tsc --noEmit` clean.

### Step 2: Add `DcmConfigRequest` / `DcmConfigResponse` in `src/shared/types.ts`
- File: `src/shared/types.ts`
- Append the v1.30.0 section at end of file (line ~1047). Re-export `IpcResult<T>` and `DcmConfigHandlerResult` from `dcmConfigHandler.ts` (or duplicate the type definition in shared — see decision below).
- **Decision**: keep `DcmConfigHandlerResult` defined in `dcmConfigHandler.ts` (existing home) and `import type` it in `shared/types.ts` for the re-export. Same pattern as `DbcImportComStackResponse` (which lives in `shared/types.ts` because the handler's pure types were promoted at v1.23.0 T3 ship time; the v1.27.0 T4 handler predates that promotion).

### Step 3: Update `DcmConfigHandlerArgs` + `DcmConfigHandlerResult`
- File: `src/main/ipc/dcmConfigHandler.ts`
- Add `bswmdPath?: string` to `DcmConfigHandlerArgs` (line 127-134).
- Add `appliedStepCount: number` to `DcmConfigHandlerResult` (line 57) and to the result literal at line 233-239.
- Add a JSDoc paragraph citing v1.30.0 MINOR + the precedence rule.

### Step 4: Update `dcmConfigHandler` implementation
- File: `src/main/ipc/dcmConfigHandler.ts`
- Replace lines 183-185 (locate + read + parseDemoBswmds) with a precedence-aware block:

  ```ts
  // v1.30.0 MINOR — bswmdPath precedence: explicit override wins
  // over discovery. No fall-through (real-OEM is a declaration,
  // not a hint).
  let dcmBswmdPath: string;
  if (args.bswmdPath !== undefined) {
    dcmBswmdPath = args.bswmdPath;
  } else {
    dcmBswmdPath = locateDcmBswmdPath(args.odxPath);
  }
  let dcmBswmdXml: string;
  try {
    dcmBswmdXml = readFileSync(dcmBswmdPath, 'utf-8');
  } catch (e) {
    return {
      ok: false,
      error: {
        message: `BSWMD file unreadable: ${e instanceof Error ? e.message : String(e)}`,
        cause: e,
      },
    };
  }
  const bswmds = parseDemoBswmds(new Map([[DCM_MODULE_SHORT_NAME, dcmBswmdXml]]));
  ```
- After `serviceSteps = xlsxDcmServicesToEcucBatch(...)` (line 196), compute `const appliedStepCount = serviceSteps.length;` and add to the result literal (line 233-239).
- All 5 `IpcResult.error` paths preserved; only the path-resolution block changes.

### Step 5: Register in `register.ts`
- File: `src/main/ipc/register.ts`
- Add `dcmConfigHandler` import alongside `xlsxEcucBatchImportHandler` (line 90-92).
- Add the `DcmConfigRequest` / `DcmConfigResponse` import to the type block (line 11-57).
- Insert the `ipcMain.handle` block after the XLSX_COMMIT_BATCH registration (line 634), before the function-end at line 635:

  ```ts
  // v1.30.0 MINOR — Dcm config bridge. Wires v1.27.0 T4's
  // dcmConfigHandler to the IPC bridge. Channel name follows the
  // unsuffixed v1.22.0/v1.24.0 ODX-bridge convention (no :v1).
  ipcMain.handle(
    IPC_CHANNELS.DCM_CONFIG,
    async (_evt, req: DcmConfigRequest): Promise<DcmConfigResponse> => {
      return dcmConfigHandler(req);
    },
  );
  ```

### Step 6: Expose in `preload`
- File: `src/preload/index.ts`
- Add `DcmConfigRequest` / `DcmConfigResponse` to the type-only import block (line 14-70).
- Add the API method in the `api` object (line 74-274), positioned after `xlsxCommitBatch` for alphabetical-ish grouping:

  ```ts
  // v1.30.0 MINOR — Dcm config bridge. Wires the v1.27.0 T4
  // dcmConfigHandler (existing-but-unregistered) into the
  // renderer-side bridge. Renderer consumer is the minimal
  // DcmConfigTrigger button (full UI in 1.31.0 PATCH). The handler
  // accepts the same DcmConfigRequest shape as the main-side
  // registration.
  dcmConfig: (req: DcmConfigRequest): Promise<DcmConfigResponse> =>
    ipcRenderer.invoke(IPC_CHANNELS.DCM_CONFIG, req),
  ```

### Step 7: Add minimal renderer trigger component
- File: `src/renderer/components/dcmConfig/DcmConfigTrigger.tsx` (new directory).
- Minimal button: "Generate Dcm Config" that takes a `odxPath` prop, calls `autosarApi.dcmConfig({odxPath, xlsxRows: [...], bswmdPath: ...})`, surfaces the result in a `<pre>` (no dialog, no success animation). Pattern matches the simplest existing renderer test.
- File: `src/renderer/components/dcmConfig/index.ts` re-exports.
- File: `src/renderer/components/__tests__/DcmConfigTrigger.test.tsx` — mocked IPC test (see §6).

**Not wired into `App.tsx` in this MINOR** — the button is exposed as a component the test can import, but the App-level integration is 1.31.0 PATCH.

### Step 8: Update existing tests
- File: `src/main/ipc/__tests__/dcmConfigHandler.test.ts`
- The 3 existing tests (happy path, ODX-unreadable, linkage-broken, silent-filter) keep working unchanged because `bswmdPath` is optional and `appliedStepCount` is additive. Add 2 assertions in the happy-path test:
  - `expect(result.value.appliedStepCount).toBeGreaterThan(0)` (proves the field is set).
  - The exact count = `1 (add-child) + N (set-param)` for the 2 rows = at minimum 2. With `didRef: 'Vbatt'` (1 param) and `routineRef: 'EraseMemory'` (1 param) = `2 + 2 = 4` steps total.

### Step 9: New tests (see §6 below for full plan)
- Handler integration: bswmdPath override success, bswmdPath file unreadable, bswmdPath malformed BSWMD.
- Channel registration smoke: `ipcMain.handle(IPC_CHANNELS.DCM_CONFIG, ...)` is registered.
- Preload exposure: `autosarApi.dcmConfig` exists and is callable (renderer-side test).
- Renderer component: `DcmConfigTrigger` button onClick → mocked IPC round-trip.
- Backwards compat: existing 3 tests pass with `bswmdPath` omitted.

### Step 10: pnpm verify 7-stage
- `pnpm tsc --noEmit` (type check)
- `pnpm lint` (ESLint, including react-hooks rules)
- `pnpm test` (Vitest unit + integration)
- `pnpm test:regression` (real-OEM end-to-end)
- `pnpm build:main` + `pnpm build:preload` + `pnpm build:renderer` (Vite production builds)
- `pnpm test:e2e` (Playwright smoke — should remain GREEN)
- `pnpm release:check` (changelog entry, version bump)

**All 7 stages must be GREEN before commit.**

---

## 6. Test plan

### 6.1 Handler integration tests (extend `dcmConfigHandler.test.ts`)

| Test | What it asserts |
|---|---|
| **(NEW) bswmdPath override success** | With `bswmdPath` pointing to the existing sample fixture, handler succeeds. `appliedStepCount > 0`. The path is the only one touched. |
| **(NEW) bswmdPath file unreadable (ENOENT)** | `bswmdPath: '/nonexistent/foo.arxml'` → returns `{ok: false, error.message: /BSWMD file unreadable/}`. No partial `outputPath` file written. |
| **(NEW) bswmdPath file is not a valid BSWMD** | Pass a malformed XML file as `bswmdPath` → `parseDemoBswmds` throws → caught by outer try/catch. |
| **(NEW) appliedStepCount is correct** | 2 rows × 1 param each = 4 steps total. Assert `result.value.appliedStepCount === 4` (exact match). |
| **(NEW) appliedStepCount is computed BEFORE apply (failure-path meaning)** | Spy on `applyPatchSteps` to throw. Assert response is `ok: false` — proves we never reach result-construction with a partial `appliedStepCount`. |

### 6.2 Channel registration smoke test (NEW FILE: `src/main/ipc/__tests__/dcmConfigRegistration.test.ts`)

```ts
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/ipc-contract.js';
import { registerIpcHandlers } from '../register.js';

it('DCM_CONFIG channel is registered with ipcMain.handle', () => {
  // ...call registerIpcHandlers(), then assert ipcMain has the handler.
});
```

### 6.3 Preload exposure check (NEW FILE: `src/preload/__tests__/dcmConfigExposure.test.ts`)

- Import the `api` object from `index.ts`. Assert `autosarApi.dcmConfig` exists.
- Mock `ipcRenderer.invoke` to assert the channel name + payload structure.

### 6.4 Renderer component test (NEW FILE: `src/renderer/components/__tests__/DcmConfigTrigger.test.tsx`)

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DcmConfigTrigger } from '../dcmConfig/DcmConfigTrigger';

it('calls dcmConfig on click', async () => {
  const mockInvoke = vi.fn().mockResolvedValue({ok: true, value: {...}});
  (window as any).autosarApi = { dcmConfig: mockInvoke, ... };
  render(<DcmConfigTrigger odxPath="/x.odx-d" bswmdPath="/y.arxml" xlsxRows={[]} />);
  await user.click(screen.getByRole('button', {name: /generate/i}));
  expect(mockInvoke).toHaveBeenCalledWith({odxPath: '/x.odx-d', bswmdPath: '/y.arxml', xlsxRows: []});
});
```

### 6.5 Backwards compatibility

- All 3 existing dcmConfigHandler tests pass with `bswmdPath` omitted (unchanged from v1.27.x).
- The 4 existing Com-stack xlsx tests pass unchanged.
- The 3 existing ODX diagnostic-extract tests pass unchanged.

**Total test count delta: +7 net.**

---

## 7. IPC surface impact

**This IS a breaking IPC change** in the strict sense: the request gains an optional field, and the response gains a new field. Old callers continue to work because:

- `bswmdPath` is optional. Callers that omit it get the v1.27.0 behavior verbatim.
- `appliedStepCount` is additive. Old readers ignore it; new readers (the renderer) consume it.

**No migration shim needed.** The additive-shape pattern is the same as the v1.18.0 → v1.18.2 PATCH chain. The `IpcResult<T>` envelope is unchanged (no envelope migration in v1.30.0 — that lands in 1.31.0 PATCH when the full UI is built and we can rationalize the error envelope end-to-end).

**Documentation impact**: `src/shared/ipc-contract.ts` block comment for `DCM_CONFIG` cites the 1.30.0 ship date + the additive contract.

---

## 8. Code-review checklist

Reviewers must check:

| # | Check | Why |
|---|---|---|
| (a) | IPC type contract consistency between `shared/types.ts` and the handler | Field names + nullability must match `DcmConfigHandlerArgs` / `DcmConfigHandlerResult` verbatim. |
| (b) | `bswmdPath` file path validation — don't trust caller paths | Renderer is trusted to pass absolute paths. BSWMD is read-only. No `isPathInsideReal` check required. |
| (c) | `appliedStepCount` matches actual post-apply result count | Field value is `serviceSteps.length` (PRE-apply). JSDoc makes "pre-apply intent" explicit. |
| (d) | Preload exposure names match the renderer-side consumer | `autosarApi.dcmConfig(req)` is the name used in `DcmConfigTrigger.tsx`. |
| (e) | No test passes that skip IPC channel registration assertions | The 6.2 smoke test must call `registerIpcHandlers()`. The 6.3 preload test must mock `ipcRenderer.invoke` and assert the channel name string. |

**Additional reviewer checks**:
- (f) `pnpm verify 7-stage` output captured in the commit message.
- (g) `CHANGELOG.md` v1.30.0 entry added with the affordance summary (BSWMD override + appliedStepCount) and the bridge-wiring close-out.

---

## 9. Renderer-side scope deferral (1.31.0 PATCH)

What we WON'T do in v1.30.0:

- **Full success dialog** modeled on `DiagnosticExtractSuccessDialog.tsx`
- **Full failure toast** with localized copy (zh-CN + en) for the 5 fail-fast error classes
- **Project-context menu trigger** — `ContextMenu.tsx` does not surface a "Generate Dcm Config" item in v1.30.0
- **Project-manifest-driven `bswmdPath` auto-population** — 1.31.0 reads `manifest.bswmdPaths` and resolves the Dcm module
- **ODX file picker integration** — 1.31.0 wires `openOdx()` → file-pick → DcmConfigTrigger button

---

## 10. Files-touched count

| Category | Files | Count |
|---|---|---|
| Core handler (modify) | `src/main/ipc/dcmConfigHandler.ts` | 1 |
| IPC registration (modify) | `src/main/ipc/register.ts` | 1 |
| IPC contract (modify) | `src/shared/ipc-contract.ts` | 1 |
| Shared types (modify) | `src/shared/types.ts` | 1 |
| Preload (modify) | `src/preload/index.ts` | 1 |
| Renderer component (new) | `src/renderer/components/dcmConfig/DcmConfigTrigger.tsx` | 1 |
| Renderer component (new) | `src/renderer/components/dcmConfig/index.ts` | 1 |
| Handler tests (modify + new) | `src/main/ipc/__tests__/dcmConfigHandler.test.ts`, `dcmConfigRegistration.test.ts` | 2 |
| Preload tests (new) | `src/preload/__tests__/dcmConfigExposure.test.ts` | 1 |
| Renderer tests (new) | `src/renderer/components/__tests__/DcmConfigTrigger.test.tsx` | 1 |
| Changelog (modify) | `CHANGELOG.md` | 1 |
| **Total** | | **12 files (9 modified, 3 new)** |

**Test files: 4 (1 modify + 3 new).** Net test delta: **+7**.

---

## 11. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | `bswmdPath` with a non-canonical BSWMD causes silent path-not-found masking | Medium | Medium | Existing 3 fail-fast error classes surface this via `error.message` regex |
| 2 | `serviceSteps.length` doesn't match renderer's expectation of "applied to doc" (post-apply `applied`) | Medium | Low | Documented "pre-apply intent" in JSDoc. Renderer tooltip clarifies. 1.31.0 PATCH can add `actualAppliedStepCount` |
| 3 | `contextBridge.exposeInMainWorld('autosarApi', api)` loses the new `dcmConfig` key in production builds | Low | High | Vite tree-shaking preserves object property keys; tests catch this |
| 4 | Test fixture `Bsw_Dcm_Bswmd.arxml` not found in production build | Low | High | Discovery walk handles this; falls through to "fixture not found" error |
| 5 | Channel name conflict with future `dcm:*` channels | Low | Low | Documented namespace reservation in `ipc-contract.ts` JSDoc |
| 6 | `bswmdPath` no-fall-through rule surprises renderer | Medium | Low | JSDoc explicit. 6.1 test demonstrates contract |
| 7 | `appliedStepCount` doesn't include post-apply set-param deduping | Low | Low | Documented. 1.31.0 can add post-apply field |

---

## 12. Out of scope (deferred)

**To 1.31.0 PATCH**:
- Full `DcmConfigSuccessDialog.tsx` with success/failure toasts
- Renderer integration with `ContextMenu.tsx` + `AppHeader.tsx`
- Project-manifest-driven `bswmdPath` auto-population from `manifest.bswmdPaths`
- ODX file picker integration
- `IpcResult<T>` → discriminated error envelope migration for `DcmConfigResponse`

**To 1.32.0+**:
- DcmDsl / Security access / NRC customization
- Dem services generator
- Real-OEM BSWMD shape validation (`isPathInsideReal`)
- Multi-module Dcm config

---

## Appendix A — Critical files for implementation

- `D:/claude_proj2/claude-AutosarCfg/src/main/ipc/dcmConfigHandler.ts` (modify)
- `D:/claude_proj2/claude-AutosarCfg/src/main/ipc/register.ts` (modify)
- `D:/claude_proj2/claude-AutosarCfg/src/shared/ipc-contract.ts` (modify)
- `D:/claude_proj2/claude-AutosarCfg/src/shared/types.ts` (modify)
- `D:/claude_proj2/claude-AutosarCfg/src/preload/index.ts` (modify)

(plus 3 new files: `DcmConfigTrigger.tsx`, `dcmConfigRegistration.test.ts`, `DcmConfigTrigger.test.tsx`; 1 modified test file: `dcmConfigHandler.test.ts`.)
