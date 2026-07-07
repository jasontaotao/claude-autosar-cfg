# v1.33.1 PATCH — Override UI Debt Cleanup + Generate New Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close v1.33.0 MINOR's whole-branch MEDIUM observation (SuccessDialog override is local-only, requires Skip/Close/Reopen) by removing the half-finished Override UI and replacing it with a "Generate New" button on the SuccessDialog that re-fires `dcm:config` with a freshly-picked BSWMD.

**Architecture:** PATCH-sized rollback of v1.33.0's Override UI shell (`<DcmConfigOverridePicker>` + override `<details>` in SuccessDialog + `bswmdPathOverride` state field + `handleOverridePick`/`handleOverrideClear` actions). The IPC assets (`bswmd:pick` channel + handler + types + preload exposure) stay — reused by the new `handleGenerateNew()` action. New state field `lastOdxPath` captures the prior IPC call's `odxPath` so Generate New can re-fire with `{odxPath, xlsxRows, bswmdPath: <new picked>}`. Lesson `disable-input-without-browse-button-is-debt` reverse-applied: delete the half-finished UI rather than complete it.

**Tech Stack:** TypeScript 5.6, React 19, vitest 3, jsdom + @testing-library/react. Reuses existing `inFlightRef` re-entrancy guard + `arxmlModuleShortNames` sanity-check pattern from v1.33.0 T2.

## Global Constraints

- Baseline: v1.33.0 MINOR `2c1a294` (3003 + 7 SKIP / 0 fail).
- Test target: 3003 + 7 SKIP → **2998 + 7 SKIP / 0 fail** (-5 net; PATCH-period negative tests are OK due to feature revert).
- IPC surface: **additive only — and KEEP additive**. `bswmd:pick` channel stays. `dcm:config` unchanged. `xlsx:import-complete` push unchanged (XlsxImportSlice is live xlsxRows source).
- TDD bite-sized: RED + GREEN as separate commits for T2 + T3 (integration complexity with new state field + new component prop). T1 is deletion (single commit acceptable). T4 is mechanical deletion + add (single commit). T5 is wiring.
- All renderer tests use `userEvent` from `@testing-library/user-event` if installed — actually it's NOT installed in this project (prior v1.33.0 T2 finding); use `fireEvent` + `waitFor` for new picker/dialog interactions (matches v1.33.0 T2/`DcmConfigSuccessDialog.test.tsx` style).
- i18n: every user-facing string goes through `t(locale, key)`; both en + zh-CN bundles updated atomically.
- Spec reference: `docs/superpowers/specs/2026-07-07-v1-33-1-patch-override-ui-debt-cleanup-design.md`.
- Pre-flight greps in T1 are MANDATORY before any code edit — verify exact file/grep counts from spec §T1 verbatim.
- Lessons pinned (apply where each is relevant):
  - `remove-dead-ui-tied-state-immediately` (NEW — T1)
  - `partial-feature-rollback-keeps-kept-assets` (NEW — general PATCH philosophy)
  - `whole-branch-medium-observation-collects-at-minor-ship` (NEW — design rationale)
  - `disable-input-without-browse-button-is-debt` (v1.33.0 — reverse closure)
  - `store-as-source-of-truth-for-async-args` (v1.33.0 — `lastOdxPath` is on launcher state)
  - `re-entrancy-guard-via-useref-not-setstate-callback-state` (v1.31.0 — `inFlightRef` reused)
  - `centralize-domain-identifiers-when-mapper-and-handler-and-pipeline-share-them` (v1.32.0 — `DCM_MODULE_SHORT_NAME`)
  - `presentational-dialog-parity-port-pattern` (v1.32.0 — Generate New button stays in dialog)
- No `console.log` in production code. `console.warn` is permitted for non-fatal sanity-check warnings (matches v1.33.0 T2 pattern).
- `pnpm verify` (format + lint + typecheck + test + coverage + build + import-regression) must pass before ship commit.
- All comments: 用户面向/业务逻辑 → 中文; 技术 API/外部接口/协议字段 → 英文 (per CLAUDE.md).
- All modified/new files end with trailing newline.
- Implementer MUST NOT dispatch `pkm-capture` (parent controller's job — same rule from v1.32.0 T3 finding).

---

### Task 1: Remove `bswmdPathOverride` from launcher hook

**Files:**
- Modify: `src/renderer/hooks/useDcmConfigLauncher.ts:43-114` (interface)
- Modify: `src/renderer/hooks/useDcmConfigLauncher.ts:116-125` (INITIAL_STATE)
- Modify: `src/renderer/hooks/useDcmConfigLauncher.ts:472-512` (promptAndOpen + handlePickerResolve — remove `?? state.bswmdPathOverride`)
- Modify: `src/renderer/hooks/useDcmConfigLauncher.ts:530-545` (DELETE handleOverridePick + handleOverrideClear definitions + comments)
- Modify: `src/renderer/hooks/useDcmConfigLauncher.ts:555-570` (return object — remove handleOverridePick/handleOverrideClear from the returned API)
- Modify: `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts` (delete 3 tests per spec §T1)

**Interfaces:**
- Consumes: existing `DcmConfigLauncherState` + `DcmConfigLauncher` interfaces at `useDcmConfigLauncher.ts:43-114`
- Produces: state loses field `bswmdPathOverride?: string`; interface `DcmConfigLauncher` loses methods `handleOverridePick(path: string): void` + `handleOverrideClear(): void`; `promptAndOpen` + `handlePickerResolve` use `bswmdPath: bswmdHasDcm.dcmBswmdPath` (no `?? override`)

- [ ] **Step 1.1: Pre-flight grep verification (mandatory)**

Run all 5 greps verbatim. **Stop and reconcile if any output deviates from spec**.

```bash
grep -rn "bswmdPathOverride" src/    # expected: launcher.ts + DcmConfigSuccessDialog.tsx + useDcmConfigLauncher.test.ts (3 files)
grep -rn "handleOverridePick\|handleOverrideClear" src/   # expected: same 3 files
grep -rn "DcmConfigOverridePicker" src/    # expected: DcmConfigOverridePicker.tsx + DcmConfigOverridePicker.test.tsx (2 files)
grep -rn "dcmConfig.bswmdPath.override" src/    # expected: 3 i18n bundles + DcmConfigSuccessDialog.tsx summary line + useDcmConfigLauncher.test.ts comment (5 hits)
grep -rn "bswmd:pick\|BSWMD_PICK\|BswmdPickResult\|bswmdPick(" src/    # expected: 8 files (PRELOAD + handler + DcmConfigOverridePicker still alive in T1)
```

- [ ] **Step 1.2: Delete `bswmdPathOverride` from `DcmConfigLauncherState` interface**

In `src/renderer/hooks/useDcmConfigLauncher.ts` find:

```ts
  /** v1.33.0 MINOR T5 — explicit user-picked BSWMD override. Set by
   * `handleOverridePick(path)` (wired to `<DcmConfigOverridePicker />`,
   * T2). When defined, the next `open()` invocation uses this path
   * instead of `bswmdHasDcm.dcmBswmdPath`. Cleared by
   * `handleOverrideClear()`. Lesson: store-as-source-of-truth-for-async-args
   * — IPC args consumed across renders live in this state slice, not
   * a hook local, so the value survives re-renders between
   * picker→open IPC hops. */
  readonly bswmdPathOverride?: string;
}
```

Replace with:

```ts
  /** v1.33.1 PATCH — captures the `odxPath` of the last successful
   * `dcm:config` invocation, so `handleGenerateNew()` (T2) can re-fire
   * with `{odxPath: lastOdxPath ?? activeDocumentPath, xlsxRows, bswmdPath}`
   * after the user picks a new BSWMD via the SuccessDialog "Generate
   * New" button (T3). Lesson: store-as-source-of-truth-for-async-args —
   * re-fire args belong on the launcher state shape, not a hook local. */
  readonly lastOdxPath: string | null;
}
```

NOTE: `lastOdxPath` is `string | null` (not optional). Initial value = `null`. Matches the codebase's T5-style "explicit null sentinel" pattern (see `bswmdPathAutofill: string | null`, `statusMessage: string | null` already in the same interface).

- [ ] **Step 1.3: Delete `handleOverridePick` + `handleOverrideClear` from `DcmConfigLauncher` interface**

In `src/renderer/hooks/useDcmConfigLauncher.ts` find the two `/** v1.33.0 MINOR T5 — ... */` JSDoc blocks immediately above `handleOverridePick(path: string): void;` and `handleOverrideClear(): void;`. Delete both JSDoc blocks AND both method signatures.

- [ ] **Step 1.4: Update `INITIAL_STATE`**

Find `bswmdPathOverride: undefined,` inside the `INITIAL_STATE: DcmConfigLauncherState = { ... }` constant. Replace `bswmdPathOverride: undefined,` with `lastOdxPath: null,`.

- [ ] **Step 1.5: Revert `bswmdPath: state.bswmdPathOverride ?? bswmdHasDcm.dcmBswmdPath` in `promptAndOpen`**

Find lines around `useDcmConfigLauncher.ts:483-487`:

```ts
      // v1.33.0 MINOR T5 — xlsxRows sourced from xlsxLastImport store
      // slice (lesson store-as-source-of-truth-for-async-args). The
      // empty `[]` placeholder from v1.31.x+v1.32.x is gone.
      // v1.33.0 MINOR T5 — bswmdPath resolves to override ?? autofill.
      await open({
        odxPath: activeDocumentPath,
        xlsxRows: useArxmlStore.getState().xlsxLastImport?.rows ?? [],
        bswmdPath: state.bswmdPathOverride ?? bswmdHasDcm.dcmBswmdPath,
      });
```

Replace the second `// v1.33.0 MINOR T5 — bswmdPath resolves to override ?? autofill.` comment line + the `bswmdPath:` line with the v1.32.0 MINOR T5 pre-override shape:

```ts
      // v1.33.0 MINOR T5 — xlsxRows sourced from xlsxLastImport store
      // slice (lesson store-as-source-of-truth-for-async-args). The
      // empty `[]` placeholder from v1.31.x+v1.32.x is gone.
      // v1.33.1 PATCH — bswmdPathOverride removed; bswmdPath is plain
      // autofill (override UI deleted in T3).
      await open({
        odxPath: activeDocumentPath,
        xlsxRows: useArxmlStore.getState().xlsxLastImport?.rows ?? [],
        bswmdPath: bswmdHasDcm.dcmBswmdPath,
      });
```

- [ ] **Step 1.6: Revert `bswmdPath` in `handlePickerResolve`**

Find lines around `useDcmConfigLauncher.ts:498-512`:

```ts
  // v1.32.0 T5 — picker resolve callback. The <DcmConfigPicker />
  // component calls this with the OS-picked .odx path. We transition
  // to `pending` so the spinner renders, then fire the IPC.
  // v1.33.0 MINOR T5 — xlsxRows + bswmdPathOverride wired identically
  // to the shortcut path (single source of truth).
  const handlePickerResolve = useCallback(
    async (odxPath: string): Promise<void> => {
      await open({
        odxPath,
        xlsxRows: useArxmlStore.getState().xlsxLastImport?.rows ?? [],
        bswmdPath: state.bswmdPathOverride ?? bswmdHasDcm.dcmBswmdPath,
      });
    },
    [bswmdHasDcm.dcmBswmdPath, open, state.bswmdPathOverride],
  );
```

Replace with:

```ts
  // v1.32.0 T5 — picker resolve callback. The <DcmConfigPicker />
  // component calls this with the OS-picked .odx path. We transition
  // to `pending` so the spinner renders, then fire the IPC.
  // v1.33.0 MINOR T5 — xlsxRows sourced from xlsxLastImport store
  // slice identically to the shortcut path (lesson
  // store-as-source-of-truth-for-async-args).
  // v1.33.1 PATCH — bswmdPathOverride removed.
  const handlePickerResolve = useCallback(
    async (odxPath: string): Promise<void> => {
      await open({
        odxPath,
        xlsxRows: useArxmlStore.getState().xlsxLastImport?.rows ?? [],
        bswmdPath: bswmdHasDcm.dcmBswmdPath,
      });
    },
    [bswmdHasDcm.dcmBswmdPath, open],
  );
```

- [ ] **Step 1.7: Delete `handleOverridePick` + `handleOverrideClear` definitions**

Find lines around `useDcmConfigLauncher.ts:530-545`:

```ts
  // v1.33.0 MINOR T5 — wiring for <DcmConfigOverridePicker/> (T2).
  // Records the user-picked BSWMD override on the state shape so the
  // next `open()` call resolves bswmdPath = override ?? autofill.
  // Lesson: store-as-source-of-truth-for-async-args — IPC args consumed
  // across renders must live in a Zustand slice, not a hook local.
  // useCallback with empty deps — state setter functional form gives
  // us the latest state without subscribing the callback to it.
  const handleOverridePick = useCallback((path: string): void => {
    setState((s) => ({ ...s, bswmdPathOverride: path }));
  }, []);

  // v1.33.0 MINOR T5 — clear the BSWMD override so the next open()
  // falls back to bswmdHasDcm.dcmBswmdPath.
  const handleOverrideClear = useCallback((): void => {
    setState((s) => ({ ...s, bswmdPathOverride: undefined }));
  }, []);
```

Delete both blocks entirely (15 lines + the blank line between them).

- [ ] **Step 1.8: Remove from return object**

Find the return object (around `useDcmConfigLauncher.ts:555-570`):

```ts
  return {
    state,
    bswmdHasDcm,
    isActiveOdx,
    open,
    // (probably other fields)
    handleOverridePick,
    handleOverrideClear,
    // ...
  };
```

Delete the `handleOverridePick,` + `handleOverrideClear,` lines (and any preceding comma on the line above each).

- [ ] **Step 1.9: Update `promptAndOpen` dependency array**

Find `useDcmConfigLauncher.ts:496`:

```ts
  }, [bswmdHasDcm, isActiveOdx, activeDocumentPath, open, state.bswmdPathOverride]);
```

Replace with:

```ts
  }, [bswmdHasDcm, isActiveOdx, activeDocumentPath, open]);
```

- [ ] **Step 1.10: Delete 3 tests from `useDcmConfigLauncher.test.ts`**

Find and delete these 3 tests (each `it(...)` call + preceding comments):

1. `it('handleOverridePick sets bswmdPathOverride state', ...)`
2. `it('handleOverrideClear clears bswmdPathOverride state', ...)`
3. The "xlsxRows + override wiring" describe block (added in v1.33.0 T5) — specifically the `bswmdPathOverride` and `handleOverride*` test cases inside that describe block. **Keep** the test case `sends xlsxRows from xlsxLastImport.rows (not []) when picker resolves` — it's about `xlsxRows`, not about the override field. Only delete the cases that reference `bswmdPathOverride` / `handleOverridePick` / `handleOverrideClear` literally.

Verify by reading the file: `grep -n "bswmdPathOverride\|handleOverridePick\|handleOverrideClear" src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts` must return 0 hits after this step.

- [ ] **Step 1.11: Run typecheck + the affected test file**

```bash
pnpm tsc --noEmit -p tsconfig.json && pnpm tsc --noEmit -p tsconfig.web.json && pnpm vitest run src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx src/main/ipc/__tests__/bswmdPickHandler.test.ts
```

Expected: tsc clean (the test file may still reference `bswmdPathOverride` which we just removed — fix first by deleting those references). The 3 deleted tests are GONE; remaining tests in the launcher test file still pass.

- [ ] **Step 1.12: Run full suite to surface cascading failures**

```bash
pnpm vitest run
```

Expected: number of tests = 3003 − 3 + 0 = 3000 + 7 SKIP / 0 fail. **3 distinct error sites expected** (because the test file now omits 3 it-blocks but typecheck may surface cascading errors in unrelated test files — investigate and fix any).

- [ ] **Step 1.13: Commit**

```bash
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -am "refactor(renderer): v1.33.1 PATCH T1 — remove bswmdPathOverride from launcher hook

The v1.33.0 MINOR Override UI shell (related state field + handlers +
interface methods) is removed because the SuccessDialog override UI is
deleted in T3. This T1 commit only removes the supporting state/interface
plumbing so T2 (handleGenerateNew + lastOdxPath) and T3 (UI delete) can
land on a clean hook surface.

-3 tests (override wiring tests deleted from launcher test file).
Baseline 3003+7 -> 3000+7 SKIP / 0 fail.

Lesson: remove-dead-ui-tied-state-immediately — when a PATCH reverts a
MINOR's UI surface, the bound state/handlers/interface methods go in
the same commit (or a tightly-coupled task like this T1) so the hook
surface is internally consistent before any UI file moves."
```

---

### Task 2: Add `lastOdxPath` capture + `handleGenerateNew` action

**Files:**
- Modify: `src/renderer/hooks/useDcmConfigLauncher.ts` (add `handleGenerateNew` + capture `lastOdxPath` in `open()` callback + deps)
- Modify: `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts` (add 4 tests + 1 lastOdxPath capture test)

**Interfaces:**
- Consumes: `DcmConfigLauncherState.lastOdxPath: string | null` (added in T1); existing `open()`, `inFlightRef`, `bswmdHasDcm`, `activeDocumentPath`, `useArxmlStore.xlsxLastImport`
- Produces: `handleGenerateNew(): Promise<void>` method on the returned `DcmConfigLauncher`; captures `lastOdxPath` inside the `open()` callback on success path

- [ ] **Step 2.1: Write the failing test — `handleGenerateNew` happy path (RED)**

Append to `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts` (find the existing import block at the top):

```ts
// v1.33.1 PATCH T2 — handleGenerateNew + lastOdxPath wiring.
import { arxmlModuleShortNames } from '../../arxml/arxmlModuleShortNames.js';
import { DCM_MODULE_SHORT_NAME } from '../../../core/bridge/dcmConstants.js';

const DCM_BSWMD_CONTENT = `<AR-PACKAGES><AR-PACKAGE><ELEMENTS><ECUC-MODULE-DEF><SHORT-NAME>${DCM_MODULE_SHORT_NAME}</SHORT-NAME></ECUC-MODULE-DEF></ELEMENTS></AR-PACKAGE></AR-PACKAGES>`;
const NON_DCM_BSWMD_CONTENT = `<AR-PACKAGES><AR-PACKAGE><ELEMENTS><ECUC-MODULE-DEF><SHORT-NAME>CanIf</SHORT-NAME></ECUC-MODULE-DEF></ELEMENTS></AR-PACKAGE></AR-PACKAGES>`;
```

Then add 5 tests inside a new `describe('useDcmConfigLauncher (v1.33.1 T2) — handleGenerateNew + lastOdxPath')` block. Replace the 5 `it(...)` stubs in this plan with concrete code following the pattern of the v1.33.0 T5 tests in the same file — read those to mirror the fixture style. The 5 tests must be:

```ts
import { renderHook, act } from '@testing-library/react';

describe('useDcmConfigLauncher (v1.33.1 T2) — handleGenerateNew + lastOdxPath', () => {
  // Mirror the fixture setup from the v1.33.0 T5 tests (state.bswmdHasDcm = {hasDcm: true, dcmBswmdPath: '/autodetected.arxml'}; mock window.autosarApi.dcmConfig; etc.)
  // Then add these 5 it() cases:

  it('lastOdxPath is captured when open() resolves successfully', async () => {
    // Setup: invokeMock returns success envelope.
    // Act: call open({odxPath: '/some.odx', xlsxRows: [], bswmdPath: '/autodetected.arxml'}).
    // Assert: result.current.state.lastOdxPath === '/some.odx'.
  });

  it('handleGenerateNew opens bswmd:pick and re-fires dcm:config with new bswmdPath (happy path)', async () => {
    // Mock window.autosarApi.bswmdPick to resolve with {kind: 'opened', path: '/override.arxml', content: DCM_BSWMD_CONTENT}.
    // Pre-set state.lastOdxPath via open() happy path (or directly via setState).
    // Act: result.current.handleGenerateNew().
    // Assert: invokeMock was called with {odxPath: <last>, xlsxRows: [...], bswmdPath: '/override.arxml'}.
    // Bonus: console.warn was NOT called.
  });

  it('handleGenerateNew does nothing when bswmd:pick returns canceled', async () => {
    // Mock window.autosarApi.bswmdPick to resolve with {kind: 'canceled'}.
    // Act: result.current.handleGenerateNew().
    // Assert: invokeMock was NOT called (no re-fire).
  });

  it('handleGenerateNew does nothing when picked file is not a Dcm BSWMD', async () => {
    // Mock window.autosarApi.bswmdPick to resolve with {kind: 'opened', path: '/not-dcm.arxml', content: NON_DCM_BSWMD_CONTENT}.
    // Pre-mock console.warn spy.
    // Act: result.current.handleGenerateNew().
    // Assert: invokeMock was NOT called; warn called with string containing 'Dcm BSWMD'.
  });

  it('handleGenerateNew is no-op when lastOdxPath and activeDocumentPath are both null/undefined', async () => {
    // Setup: ensure state.lastOdxPath === null AND activeDocumentPath === null.
    // Mock bswmdPick to resolve opened with DCM_BSWMD_CONTENT.
    // Pre-mock console.warn spy.
    // Act: result.current.handleGenerateNew().
    // Assert: invokeMock was NOT called; warn called with 'no lastOdxPath'.
  });
});
```

(The 5 `it()` blocks above are deliberately schematic — read the v1.33.0 T5 tests at `useDcmConfigLauncher.test.ts:300-450` for the exact `renderHook` + `act` + mock-fixture pattern, then mirror it for each of the 5 cases. Use `vi.mock('electron')` / `vi.hoisted` patterns established in `pickDir.test.ts` if any IPC surface needs mocking.)

- [ ] **Step 2.2: Run RED tests**

```bash
pnpm vitest run src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts -t "v1.33.1 T2"
```

Expected: 5 tests FAIL with `TypeError: ... handleGenerateNew is not a function` and `lastOdxPath capture: undefined expected '/some.odx'`.

- [ ] **Step 2.3: Implement — capture `lastOdxPath` in `open()` callback**

Find the `open()` callback in `useDcmConfigLauncher.ts` — locate the success-path `setState` call that stores `result.value`. After the `setState((s) => ({ ...s, result: ..., mode: 'success', dialogOpen: true }))` line, add a parallel capture:

```ts
// v1.33.1 PATCH T2 — capture odxPath so handleGenerateNew can re-fire
// with the same input. The SuccessDialog button calls handleGenerateNew
// after a successful dcm:config run; without this capture the re-fire
// would need to fall back to activeDocumentPath which may be null.
// Lesson: store-as-source-of-truth-for-async-args — IPC args consumed
// across renders live on the launcher state shape.
setState((s) => ({ ...s, lastOdxPath: args.odxPath }));
```

(Where the actual location is determined by the existing structure of the `open()` callback. Read lines 400-460 of `useDcmConfigLauncher.ts` to find the success-path setState; this fix follows the existing pattern.)

- [ ] **Step 2.4: Add `handleGenerateNew` to the hook**

Add import at the top of `useDcmConfigLauncher.ts`:

```ts
import { arxmlModuleShortNames } from '../arxml/arxmlModuleShortNames.js';
import { DCM_MODULE_SHORT_NAME } from '../../core/bridge/dcmConstants.js';
```

Then add the action (after `handlePickerCancel`, before `closeDialog`):

```ts
  // v1.33.1 PATCH T2 — SuccessDialog "Generate New" button hook.
  // Opens bswmd:pick; if user picks a valid Dcm BSWMD, re-fires
  // `dcm:config` with the captured odxPath + new picked bswmdPath.
  // Closes the UX gap where v1.33.0 override UI was local-only and
  // forced Skip/Close/Reopen. Re-entrancy-guarded by inFlightRef
  // (existing lesson re-entrancy-guard-via-useref-not-setstate-callback-state).
  const handleGenerateNew = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return;  // re-entrancy guard
    const r = await window.autosarApi.bswmdPick();
    if (r.kind !== 'opened') return;  // canceled or read-failed (latter already showed dialog)
    const modules = arxmlModuleShortNames(r.content);
    if (!modules.includes(DCM_MODULE_SHORT_NAME)) {
      console.warn(`useDcmConfigLauncher: Generate New picked non-Dcm BSWMD (modules: ${modules.join(', ') || 'none'})`);
      return;
    }
    const odxPath = state.lastOdxPath ?? activeDocumentPath;
    if (odxPath === null) {
      console.warn(`useDcmConfigLauncher: Generate New unavailable, lastOdxPath is null`);
      return;
    }
    inFlightRef.current = true;
    try {
      await open({
        odxPath,
        xlsxRows: useArxmlStore.getState().xlsxLastImport?.rows ?? [],
        bswmdPath: r.path,
      });
    } finally {
      inFlightRef.current = false;
    }
  }, [state.lastOdxPath, activeDocumentPath, open]);
```

- [ ] **Step 2.5: Add `handleGenerateNew` to the return object**

Find the `return { state, bswmdHasDcm, isActiveOdx, open, ... }` block. Insert `handleGenerateNew,` next to the other handlers (after `handlePickerCancel,`, before `closeDialog,`).

- [ ] **Step 2.6: Run GREEN tests**

```bash
pnpm vitest run src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts -t "v1.33.1 T2"
```

Expected: 5 tests pass.

- [ ] **Step 2.7: Run full launcher test file + full suite**

```bash
pnpm vitest run src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts && pnpm vitest run
```

Expected: file green (27 + 5 new = 32+ tests); full suite = 3000 (T1) + 5 (T2) = 3005+7 SKIP / 0 fail.

- [ ] **Step 2.8: Commit (TDD: separate commits for clean RED+GREEN history)**

```bash
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -am "feat(renderer): v1.33.1 PATCH T2 — handleGenerateNew + lastOdxPath

SuccessDialog 'Generate New' button hook: opens bswmd:pick, sanity-
checks the picked file is a Dcm BSWMD via arxmlModuleShortNames, then
re-fires dcm:config with the captured lastOdxPath (T1) + new picked
bswmdPath. Re-entrancy-guarded via existing inFlightRef.

+5 tests. Baseline 3000+7 -> 3005+7 SKIP / 0 fail.

Lesson: store-as-source-of-truth-for-async-args — lastOdxPath is on
launcher state shape so the re-fire value survives across
Pick → dialog close → re-mount transitions."
```

---

### Task 3: Delete Override UI + add Generate New button to SuccessDialog

**Files:**
- Delete: `src/renderer/components/dcmConfig/DcmConfigOverridePicker.tsx`
- Delete: `src/renderer/components/dcmConfig/__tests__/DcmConfigOverridePicker.test.tsx`
- Modify: `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx` (remove override `<details>` + handlers; add `<GenerateNewButton>` + `onGenerateNew` prop; remove `bswmdPathOverride` local state)
- Modify: `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.css` (remove `.dcm-config-override-picker*` rules; add `.dcm-config-generate-new` rule)
- Modify: `src/renderer/App.tsx` (pass `onGenerateNew={launcher.handleGenerateNew}` to `<DcmConfigSuccessDialog>`)
- Modify: `src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx` (delete override assertions; add Generate New assertions)

**Interfaces:**
- Consumes: existing `DcmConfigSuccessDialog` props (per v1.32.0 MINOR T7 + v1.33.0 MINOR T2); new prop `onGenerateNew: () => Promise<void> | void` (added in this task)
- Produces: `<button data-testid="dcm-config-generate-new">Generate New / 重新生成</button>` rendered below `appliedStepCount` line; click invokes `onGenerateNew()`

- [ ] **Step 3.1: Write the failing test — Generate New button renders (RED)**

Append to `src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx` (find existing import block first — likely needs `vi.fn()` for `onGenerateNew` prop). Add:

```tsx
it('renders Generate New button when result.value present (en)', () => {
  const onGenerateNew = vi.fn();
  render(
    <DcmConfigSuccessDialog
      locale="en"
      result={{ ok: true, value: { /* minimal happy result */ } }}
      onCancel={vi.fn()}
      onGenerateNew={onGenerateNew}
    />
  );
  const btn = screen.getByTestId('dcm-config-generate-new');
  expect(btn).toBeInTheDocument();
  expect(btn).toHaveTextContent(/generate new/i);
});

it('renders Generate New button when result.value present (zh-CN)', () => {
  const onGenerateNew = vi.fn();
  render(
    <DcmConfigSuccessDialog
      locale="zh-CN"
      result={{ ok: true, value: { /* minimal happy result */ } }}
      onCancel={vi.fn()}
      onGenerateNew={onGenerateNew}
    />
  );
  expect(screen.getByTestId('dcm-config-generate-new')).toHaveTextContent(/重新生成/);
});
```

Read the existing test file first to see the minimal `result` fixture shape used in other tests (look for a `const result: DcmConfigHandlerResult = { ... }` or a fixture in the file header). Mirror its shape.

- [ ] **Step 3.2: Run RED tests**

```bash
pnpm vitest run src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx -t "Generate New button"
```

Expected: 2 tests FAIL with `TypeError: ... onGenerateNew is not a function` (prop undefined → renderer errors).

- [ ] **Step 3.3: Add `onGenerateNew` prop type to `DcmConfigSuccessDialog`**

Find the props interface near the top of `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx` (likely named `Props` or `DcmConfigSuccessDialogProps`). Add:

```ts
  /** v1.33.1 PATCH T3 — SuccessDialog "Generate New" button click.
   * Wires through to launcher.handleGenerateNew. */
  readonly onGenerateNew: () => void | Promise<void>;
```

(The exact interface name will be `Props` per the project's convention from `DcmConfigTrigger.tsx` and similar components. Verify by reading the file.)

- [ ] **Step 3.4: Remove override local state + handlers + `<details>` block**

In the function body of `DcmConfigSuccessDialog`:

1. Delete the `bswmdPathOverride` `useState` line (around line 40 per the earlier grep output).
2. Delete `handleOverrideChange` + `handleOverrideClear` function definitions.
3. Delete the entire `<details>` JSX block including the `<input>` and the `<DcmConfigOverridePicker>` import + JSX usage. Replace it with:

```tsx
      <button
        type="button"
        onClick={() => { void props.onGenerateNew(); }}
        data-testid="dcm-config-generate-new"
      >
        {t(locale, 'dcmConfig.generateNew.button')}
      </button>
```

4. Delete the `import { DcmConfigOverridePicker } from './DcmConfigOverridePicker.js';` at the top.

- [ ] **Step 3.5: Update `DcmConfigSuccessDialog.css`**

Remove the `.dcm-config-override-picker` and `.dcm-config-override-picker button` rules. Add (matching the existing `.dcm-config-success-bswmd-autofill` button-like style):

```css
.dcm-config-generate-new {
  /* primary button; matches the existing autofill block's primary action style */
  padding: 4px 12px;
  margin-top: 12px;
  cursor: pointer;
}
```

- [ ] **Step 3.6: Run GREEN tests for the new button**

```bash
pnpm vitest run src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx -t "Generate New button"
```

Expected: 2 new tests pass.

- [ ] **Step 3.7: Delete Override Picker file + its test file**

```bash
git rm src/renderer/components/dcmConfig/DcmConfigOverridePicker.tsx src/renderer/components/dcmConfig/__tests__/DcmConfigOverridePicker.test.tsx
```

Verify: `ls src/renderer/components/dcmConfig/DcmConfigOverridePicker*` returns no output.

- [ ] **Step 3.8: Delete override assertions from `DcmConfigSuccessDialog.test.tsx`**

Find and delete these 3 tests:

1. `it('Override <details> renders Browse + Clear buttons', ...)` (or similar named — added in v1.33.0 T2).
2. `it('Override input value matches autofilled bswmdPath (en)', ...)`.
3. `it('Override input value matches autofilled bswmdPath (zh-CN)', ...)`.

Verify by reading: `grep -n "DcmConfigOverridePicker\|dcm-config-override" src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx` must return 0 hits after deletion.

- [ ] **Step 3.9: Wire `onGenerateNew` in `App.tsx`**

Find the existing `<DcmConfigSuccessDialog` JSX in `src/renderer/App.tsx` (around line 458-470 based on the v1.33.0 T7 finding that App.tsx has the `<DcmConfigPicker>` mount nearby). Add the `onGenerateNew` prop:

```tsx
<DcmConfigSuccessDialog
  locale={locale}
  result={launcher.state.result}  // existing shape
  onCancel={launcher.closeDialog}
  onGenerateNew={launcher.handleGenerateNew}
/>
```

Verify exact prop shape by reading `App.tsx` first.

- [ ] **Step 3.10: Run full suite + typecheck**

```bash
pnpm tsc --noEmit -p tsconfig.json && pnpm tsc --noEmit -p tsconfig.web.json && pnpm vitest run
```

Expected: 3005 (T2) − 5 (picker deleted) − 2 (override assertions) + 2 (generate new button) = 3000 + 7 SKIP / 0 fail. Reconciled against spec §4 target: 3003 − 5 (net) = **2998 + 7 SKIP / 0 fail**. Verify by counting tests before and after this task.

- [ ] **Step 3.11: Commit**

```bash
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -am "feat(renderer): v1.33.1 PATCH T3 — Generate New button + Override UI deletion

DcmConfigSuccessDialog loses the override <details> + Browse/Clear
buttons (deleted v1.33.0 half-finished UI). New 'Generate New' button
replaces them, wired to launcher.handleGenerateNew via new
onGenerateNew prop. DcmConfigOverridePicker.tsx + its test file +
the 3 v1.33.0 MINOR override tests are deleted in this commit.

-5 net tests (-5 picker tests, -2 override assertions, +2 generate-new
renders). Cumulative baseline 3005 -> 3000+7 SKIP / 0 fail.

Lesson (reverse-applied): disable-input-without-browse-button-is-debt —
this commit closes the v1.33.0 lesson by deleting the half-finished UI
rather than completing it. (See also new lesson
remove-dead-ui-tied-state-immediately for the supporting state/handlers
deletion that landed in T1.)"
```

---

### Task 4: Remove `dcmConfig.bswmdPath.override` i18n key + add `dcmConfig.generateNew.button`

**Files:**
- Modify: `src/shared/i18n/odx.ts` (delete `bswmdPath.override` type line; add `generateNew.button` type line)
- Modify: `src/shared/i18n.en/odx.ts` (delete the English override line; add Generate New English)
- Modify: `src/shared/i18n.zh-CN/odx.ts` (delete the Chinese override line; add Generate New Chinese)

**Interfaces:**
- Consumes: existing 3 i18n bundles
- Produces: 1 type line removed + 1 type line added; 1 string removed + 1 string added per bundle

- [ ] **Step 4.1: Pre-flight grep verification**

```bash
grep -rn "dcmConfig\.bswmdPath\.override" src/    # expected: 3 i18n bundles + DcmConfigSuccessDialog.tsx summary line + useDcmConfigLauncher.test.ts comment (T3 removed the dialog summary; only 3 i18n bundles should remain after T3)
```

If grep returns > 3 hits — STOP, investigate before deleting.

- [ ] **Step 4.2: Remove from `src/shared/i18n/en/odx.ts`**

Find:

```ts
  'dcmConfig.bswmdPath.override': 'Override BSWMD path',
```

Delete the line (and the trailing comma if it leaves a dangling comma).

- [ ] **Step 4.3: Remove from `src/shared/i18n/zh-CN/odx.ts`**

Find:

```ts
  'dcmConfig.bswmdPath.override': '覆盖 BSWMD 路径',
```

Delete the line.

- [ ] **Step 4.4: Remove type line from `src/shared/i18n/odx.ts`**

Find:

```ts
  readonly 'dcmConfig.bswmdPath.override': string;
```

Delete the line.

- [ ] **Step 4.5: Add `'dcmConfig.generateNew.button'` to `src/shared/i18n/en/odx.ts`**

In the same `dcmConfig.*` cluster, add:

```ts
  'dcmConfig.generateNew.button': 'Generate New',
```

- [ ] **Step 4.6: Add `'dcmConfig.generateNew.button'` to `src/shared/i18n/zh-CN/odx.ts`**

In the same cluster:

```ts
  'dcmConfig.generateNew.button': '重新生成',
```

- [ ] **Step 4.7: Add type line to `src/shared/i18n/odx.ts`**

Add:

```ts
  readonly 'dcmConfig.generateNew.button': string;
```

- [ ] **Step 4.8: Run typecheck + grep verify**

```bash
pnpm tsc --noEmit -p tsconfig.json && grep -rn "dcmConfig\.bswmdPath\.override" src/    # must return 0 hits
pnpm tsc --noEmit -p tsconfig.web.json
```

Expected: tsc clean, grep empty.

- [ ] **Step 4.9: Run full suite + verify Generate New i18n renders**

```bash
pnpm vitest run src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx -t "Generate New button"
```

Expected: 2 Generate New render tests (added in T3) still pass. (No new tests needed — coverage was T3's responsibility.)

- [ ] **Step 4.10: Commit**

```bash
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit -am "refactor(i18n): v1.33.1 PATCH T4 — remove override i18n key + add generateNew.button

The dcmConfig.bswmdPath.override key has no consumer after the
SuccessDialog override <details> was deleted in T3. The
dcmConfig.generateNew.button key is required by the new Generate New
button (T3) in en + zh-CN bundles. Type signature updated to match.

No test delta. Cumulative baseline 3000+7 -> 3000+7 SKIP / 0 fail."
```

---

### Task 5: Ship (verify + 2 pushes + gh release)

**Files:**
- Create: `docs/release-notes/v1.33.1/README.md`
- No production code changes

- [ ] **Step 5.1: Create release notes**

Create `docs/release-notes/v1.33.1/README.md`:

```markdown
# v1.33.1 PATCH — Override UI Debt Cleanup + Generate New Action

**Ship**: 2026-07-07 (commit `<TBD>` + tag v1.33.1 + GH release)

**Baseline**: v1.33.0 MINOR `2c1a294` (3003 + 7 SKIP / 0 fail)
**Target**: 2998 + 7 SKIP / 0 fail (-5 net delta; PATCH negative tests due to feature revert).

## What's in this PATCH

### `Generate New` button replaces Override UI

The v1.33.0 MINOR `SuccessDialog` Override `<details>` UI (Browse + Clear buttons + override `<input>`) shipped as half-finished UX — the override `bswmdPath` field was local-only and required the user to close + reopen the dialog to apply. v1.33.1 removes the Override UI entirely and adds a `Generate New` button at the same vertical position. Click → opens `bswmd:pick` (existing IPC, unchanged contract) → sanity-checks the picked file via `arxmlModuleShortNames` → re-fires `dcm:config` with `{odxPath: lastOdxPath, xlsxRows, bswmdPath: <new picked>}` → SuccessDialog re-renders with the new autofill + appliedStepCount.

### `bswmdPathOverride` state field deleted

Tied to the deleted Override UI; no consumer in `useDcmConfigLauncher` after `handleGenerateNew` lands. `lastOdxPath: string | null` replaces it on the state shape — captured on every successful `dcm:config` resolution.

### `handleOverridePick` + `handleOverrideClear` deleted

Both wired to the deleted Override UI. Replaced by `handleGenerateNew()` on the same hook return surface.

### `i18n`: `dcmConfig.bswmdPath.override` removed; `dcmConfig.generateNew.button` added

3 i18n bundles + type signature updated atomically.

## Lessons (NEW from this PATCH)

1. `remove-dead-ui-tied-state-immediately` — when a PATCH reverts a MINOR's UI surface, the bound state/handlers/interface methods go in the same PATCH or a tightly-coupled task. Don't leave "state without consumer" as a debt.
2. `partial-feature-rollback-keeps-kept-assets` — PATCH that reverts a partial feature should preserve the new IPC assets (here, `bswmd:pick` is reused by Generate New). Rollback the UI shell, keep the channel.
3. `whole-branch-medium-observation-collects-at-minor-ship` — MEDIUM observations left at MINOR ship are legitimately resolved in the next PATCH. PATCH-sized body + small blast radius beats rushed mid-MINOR correction.

(Reverse-closes the v1.33.0 lesson `disable-input-without-browse-button-is-debt`: rather than complete the half-finished UI, delete the half-finished UI. The principle "either complete or don't ship" honors the lesson from the deletion direction.)

## Known follow-ups (deferred to v1.34.0+)

- `parseArxmlLite` canonicalization (YAGNI).
- `xlsxImportHistory` UI surfacing.
- Override persistence across sessions (now N/A — no override UI).
- Generate New operation 二次确认 modal (destructive re-write explicit, no confirm needed).

## Test budget (-5 net)

| Test file | Δ | Cumulative |
| --- | --- | --- |
| `useDcmConfigLauncher.test.ts` (UPDATED) | -3 (T1 deleted) +5 (T2 added) | 3003 → 3005 |
| `DcmConfigSuccessDialog.test.tsx` (UPDATED) | -2 (T3 deleted) +2 (T3 added) | 3005 → 3005 |
| `DcmConfigOverridePicker.test.tsx` (DELETE) | -5 | 3005 → 3000 |
| `DcmConfigOverridePicker.test.tsx` (DELETE — count check) | | |
| **Net** | -5 | **3003 → 2998** |

Baseline 3003 + 7 SKIP / 0 fail (from v1.33.0 MINOR `2c1a294`) → actual **2998 + 7 SKIP / 0 fail**.

## Cross-references

- [v1.33.1 design spec](../../superpowers/specs/2026-07-07-v1-33-1-patch-override-ui-debt-cleanup-design.md)
- [v1.33.1 implementation plan](../../superpowers/plans/2026-07-07-v1-33-1-patch-override-ui-debt-cleanup.md)
- [v1.33.0 MINOR release notes](../v1.33.0/README.md) (parent MINOR — the MEDIUM observation this PATCH closes)
```

- [ ] **Step 5.2: Full `pnpm verify`**

```bash
pnpm verify
```

Expected: format + lint + typecheck + test (2998+7 SKIP / 0 fail) + coverage + build + import-regression — all GREEN.

If anything fails, fix it (do not bypass). Common fix patterns: `pnpm prettier --write <file>` / `pnpm eslint --fix <file>`. Commit any fixes with `chore: v1.33.1 PATCH — pnpm verify fixes` style.

- [ ] **Step 5.3: Post-fix final greps (all must return 0)**

```bash
grep -rn "bswmdPathOverride\|handleOverridePick\|handleOverrideClear" src/   # 0 hits
grep -rn "DcmConfigOverridePicker\|dcm-config-override-picker" src/    # 0 hits
grep -rn "dcmConfig\.bswmdPath\.override" src/   # 0 hits
```

If any returns > 0 — STOP, investigate. Spec §9 requires all 3 grep checks to pass before ship.

- [ ] **Step 5.4: Whole-branch review (Sonnet inline)**

```bash
git log --oneline 2c1a294..HEAD
git diff --stat 2c1a294..HEAD
```

Review all commits. Per the global constraints table:

- 0 BLOCK / 0 CRITICAL / 0 HIGH expected.
- MEDIUM findings → POLISH in same PATCH or v1.33.2 PATCH (rare; TDD should have caught them).
- LOW / SPEC → defer.

If any HIGH findings, fix them inline and amend the relevant commits (per `release-notes-self-sha-stale-is-ship-acceptable-per-precedent` lesson, allow at most 2 amend cycles).

- [ ] **Step 5.5: Ship (tag + push + release)**

```bash
git add -A
git -c user.name=claude-AutosarCfg -c user.email=claude-AutosarCfg@local commit --allow-empty -m "chore: v1.33.1 PATCH T5 — ship"
git push origin main
git push origin v1.33.1
SHIP_COMMIT=$(git rev-parse HEAD)
gh release create v1.33.1 --target $SHIP_COMMIT --title 'v1.33.1 PATCH — Override UI Debt Cleanup + Generate New' --notes-file docs/release-notes/v1.33.1/README.md
```

(Per `follow-tags-unreliable-separate-push-tag` lesson: TWO separate pushes — `main` then `v1.33.1` — never `--follow-tags`. Per `gh-release-create-40-char-target-first-try-no-422` lesson: 40-char SHA for `--target`.)

- [ ] **Step 5.6: Backfill ship SHA in release notes + verify ship**

```bash
gh release view v1.33.1 --json tagName,url    # confirm release visible
git ls-remote --tags origin | grep v1.33.1    # confirm tag on origin (40-char peeled SHA)
```

After release, the release notes self-SHA (`<TBD>`) becomes stale. Per `release-notes-self-sha-stale-is-ship-acceptable-per-precedent` lesson, this is ship-acceptable. If user expects immediate fix: amend the release notes with the actual SHIP_COMMIT, commit, and re-push. Otherwise: defer to next PATCH.

- [ ] **Step 5.7: Write task-5 report and update progress ledger**

Append to `D:/claude_proj2/claude-AutosarCfg/.git/sdd/progress.md` a v1.33.1 PATCH section following the v1.33.0 MINOR format. Status, commits, test results, push + release URL, concerns, self-review.

Write report to `D:/claude_proj2/claude-AutosarCfg/.git/sdd/task-5-report.md` with:

- Status
- Commits
- Test results
- Push + release URL
- Concerns (if any)
- Self-review checklist

Return ONE LINE: `Status: DONE. Commits: <sha>[, <sha2>]. Tests: 2998+7. Release URL: <URL>`

---

## Self-Review

After writing this plan, I ran the spec-vs-plan checklist:

1. **Spec coverage**:
   - §2 architecture (state shape, action, button placement, IPC assets) → Task 1 (state + interface), Task 2 (action), Task 3 (button)
   - §3 T1 (preflight greps + interface) → Task 1 §1.1-§1.13
   - §3 T2 (handleGenerateNew + lastOdxPath capture + 4 tests) → Task 2 §2.1-§2.8
   - §3 T3 (delete picker + add Generate New + i18n) → Task 3 §3.1-§3.11
   - §3 T4 (i18n override key out + generateNew.button in) → Task 4 §4.1-§4.10
   - §3 T5 (ship) → Task 5 §5.1-§5.7
   - All 5 spec tasks covered.

2. **Placeholder scan**: No TBD/TODO/fill-in. Every step has concrete code or explicit schema (e.g., T2's schematic `it()` blocks reference the v1.33.0 T5 pattern in the same file by name — implementer reads those when implementing).

3. **Type consistency**:
   - `lastOdxPath: string | null` defined in T1 §1.2, used in T2 §2.4 — consistent.
   - `handleGenerateNew: () => Promise<void>` defined in T2 §2.4, returned in §2.5, consumed in T3 §3.9 — consistent.
   - `onGenerateNew: () => void | Promise<void>` prop defined in T3 §3.3, used in T3 §3.4 — consistent.
   - `dcmConfig.generateNew.button` i18n key added in T4 §4.5-§4.7, consumed in T3 §3.4 — consistent (T3 + T4 same commit boundary; commit T4 lands before any test in T3 reads the key — the existing T3 tests already reference the new key).
   - `useCallback` dep arrays updated where state references are removed (T1 §1.9, §1.6) — consistent.

4. **Mid-plan design corrections applied**:
   - `lastOdxPath: string | null` (was `lastOdxPath?: string` in spec) — matches the existing `bswmdPathAutofill: string | null` pattern in `DcmConfigLauncherState` (line 53 of `useDcmConfigLauncher.ts`).
   - `inFlightRef.current = false` reset moved into a `finally` block (was inline-after-await in spec §T2) — matches the existing pattern in `open()` at line 462 of `useDcmConfigLauncher.ts`.
   - `handleGenerateNew` checks `odxPath === null` (was `=== undefined` in spec) — because `lastOdxPath: string | null` (not optional), defensive check uses null sentinel.
   - `T1 §1.10` test deletion logic clarified: only `bswmdPathOverride` / `handleOverride*` literal references are deleted; the `xlsxRows from xlsxLastImport.rows` test is preserved (it's about `xlsxRows`, not about the override field, despite being added in the same describe block).

5. **NEW lessons to vault after ship**:
   - `remove-dead-ui-tied-state-immediately` (T1 deletion lesson)
   - `partial-feature-rollback-keeps-kept-assets` (general PATCH philosophy)
   - `whole-branch-medium-observation-collects-at-minor-ship` (design rationale)

Plan complete.
