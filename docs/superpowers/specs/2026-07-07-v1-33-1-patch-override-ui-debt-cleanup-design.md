# v1.33.1 PATCH — Override UI Debt Cleanup + Generate New Action

> **Status**: DESIGN — pre-flight (awaiting user review)
> **Ship target**: v1.33.1 PATCH
> **Baseline**: v1.33.0 MINOR (`2c1a294`, 3003 + 7 SKIP / 0 fail)
> **Spec author**: brainstorming flow (2026-07-07)
> **Related**:
>
> - [v1.33.0 MINOR design spec](2026-07-07-v1-33-0-minor-dcm-config-cleanup-design.md) (parent MINOR)
> - [v1.33.0 MINOR release notes](../../release-notes/v1.33.0/README.md) (parent MINOR ship report)

## Summary

v1.33.0 MINOR ship 了 `bswmd:pick` IPC + `DcmConfigOverridePicker` Browse/Clear UI + 状态字段 `bswmdPathOverride`。whole-branch review (Sonnet inline) 留 1 个 MEDIUM observation:**SuccessDialog 上的 override 改动不会自动重新触发 dcm:config IPC**。non-override 流程一次就出 config;override 流程需要 close dialog → reopen trigger → 重走流程。这是 UX 跳板,但 mid-MINOR 修正需要新增 sequence-id / cancellable in-flight 复杂度,与 MINOR 体量不符。

v1.33.1 PATCH 是收口 PATCH,**移除 override UI**(Browse/Clear 状态都无 consumer,只作为 input field),把它**合并进 SuccessDialog 的 "Generate New" 按钮**——按钮直接调 `bswmd:pick`,re-fire `dcm:config` with 之前的 odxPath + 新 picked BSWMD。`bswmdPathOverride` 状态字段一并删除。

`bswmd:pick` IPC + handler + 类型全部 KEEP,**作为 Generate New 的后端**。`XlsxImportSlice` + `xlsx:import-complete` IPC push + `xlsxImportListener` 全部 KEEP — 是真 active 的 launch-time `xlsxRows` 来源。Lesson `disable-input-without-browse-button-is-debt` 的反向收口:既然 input field 不需要(没地方 override 在手),Browse 按钮也不需要在 input 旁边。

## 1. Goals & Non-Goals

### Goals

- 解决 v1.33.0 whole-branch review 留的 1 MEDIUM observation:SuccessDialog 一致性。
- 移除 `bswmdPathOverride` 状态字段(无 UI consumer 后=dead code)。
- 移除 `DcmConfigOverridePicker` 组件及其 test。
- 移除 `dcmConfig.bswmdPath.override` i18n key(无 consumer)。
- 添加 `handleGenerateNew` action 与 "Generate New" 按钮,re-fire `dcm:config` 与现有 odxPath + 新 picked BSWMD。
- 加 `lastOdxPath` 状态字段,捕获上一次成功 `dcm:config` 的入参 odxPath。
- 保留 `bswmd:pick` IPC(Generate New 后端)与 `XlsxImportSlice` 链路(`xlsxRows` 真 active consumer)。
- 测试净变化:-5 (3003+7 → 2998+7 SKIP / 0 fail)。

### Non-Goals (v1.33.1 PATCH)

- ❌ Override persistence 到 localStorage/electron-store(继续 deferred 到 v1.34.0+)。
- ❌ Override keyboard shortcut。
- ❌ Multi-BSWMD project override。
- ❌ `xlsxImportHistory` UI surfacing。
- ❌ Generate New 操作加 confirm modal(YAGNI:re-fire 是 destructive 但 GUI flow 是 explicit;warn dialog 增加 frictions 不必要)。
- ❌ Sequence-id / cancellable in-flight in launcher hook(re-fire uses existing `inFlightRef` re-entrancy guard)。
- ❌ Override UI 在 ODX picker `defaultPath` 上的延续(独立 axis)。

## 2. Architecture

### Layered design (extends v1.33.0)

```
┌────────────────────────────────────────────────────────────────────────┐
│ DcmConfigSuccessDialog (v1.33.0; refactored for v1.33.1)               │
│                                                                        │
│  Header + autofill path + appliedStepCount (KEEP)                      │
│                                                                        │
│  Bottom:                                                                │
│    [<Cancel/Close>]   [<Generate New>]   (was: Override <details> UI)  │
│                                                                        │
│  Override <details> REMOVED entirely.                                   │
│  DcmConfigOverridePicker file: DELETE.                                  │
└────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Launcher (useDcmConfigLauncher.ts):                                    │
│                                                                        │
│   - handleOverridePick + handleOverrideClear: DELETE                   │
│   - bswmdPathOverride state field: DELETE (no consumer after UI gone)   │
│   - lastOdxPath state field: NEW (capture dcm:config input odxPath)    │
│   - inFlightRef re-entrancy guard: KEEP                                 │
│                                                                        │
│   NEW: handleGenerateNew()                                              │
│     → opens bswmd:pick (existing IPC, IPC contract unchanged)            │
│     → on opened: re-fires dcm:config with {                            │
│         odxPath: lastOdxPath ?? activeDocumentPath,                     │
│         xlsxRows: useArxmlStore.xlsxLastImport?.rows ?? [],            │
│         bswmdPath: <new picked>                                         │
│       }                                                                  │
│     → on result.value, state flips back to 'success' →                 │
│        SuccessDialog re-renders with new autofill + appliedStepCount   │
└────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────────────────┐
│ IPC (additive → unchanged):                                            │
│                                                                        │
│   bswmd:pick (v1.33.0) — KEEP, now used by handleGenerateNew           │
│   dcm:config (v1.32.0) — KEEP, main flow unchanged                     │
│   xlsx:import-complete (v1.33.0) — KEEP, used by xlsxImportListener     │
│                                                                        │
│   BswmdPickResult type: KEEP                                            │
│   XlsxImportRecord + XlsxImportSlice types: KEEP                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Component placement

| Component                                    | Path                                                                           | Type                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `DcmConfigSuccessDialog` (MODIFIED)          | `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.tsx`                 | MODIFY: remove override UI + add Generate New                                 |
| `DcmConfigSuccessDialog.css` (MODIFY)        | `src/renderer/components/dcmConfig/DcmConfigSuccessDialog.css`                 | MODIFY: remove .dcm-config-override-picker rule, add .dcm-config-generate-new |
| `DcmConfigOverridePicker` (DELETE)           | `src/renderer/components/dcmConfig/DcmConfigOverridePicker.tsx`                | DELETE                                                                        |
| `DcmConfigOverridePicker.test.tsx`           | `src/renderer/components/dcmConfig/__tests__/DcmConfigOverridePicker.test.tsx` | DELETE                                                                        |
| `useDcmConfigLauncher` (MODIFIED)            | `src/renderer/hooks/useDcmConfigLauncher.ts`                                   | MODIFY: remove override state/actions, add lastOdxPath + handleGenerateNew    |
| `useDcmConfigLauncher.test.ts` (UP)          | `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts`                    | MODIFY: -3 (override wiring) +4 (Generate New)                                |
| `DcmConfigSuccessDialog.test.tsx`            | `src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx`  | MODIFY: -2 (override absent) +2 (Generate New renders: en + zh-CN)            |
| `bswmdPickHandler` (KEEP)                    | `src/main/ipc/bswmdPickHandler.ts`                                             | KEEP, still used by Generate New                                              |
| `bswmdPickHandler.test.ts`                   | `src/main/ipc/__tests__/bswmdPickHandler.test.ts`                              | KEEP                                                                          |
| `IPC_CHANNELS` (KEEP)                        | `src/shared/ipc-contract.ts`                                                   | KEEP, no contract change                                                      |
| `BswmdPickResult` type (KEEP)                | `src/shared/types.ts`                                                          | KEEP                                                                          |
| `preload` (KEEP)                             | `src/preload/index.ts`                                                         | KEEP, bswmdPick still exposed                                                 |
| `register` (KEEP)                            | `src/main/ipc/register.ts`                                                     | KEEP, still calls registerBswmdPickHandler                                    |
| `XlsxImportSlice` (KEEP)                     | `src/renderer/store/slices/xlsxImportSlice.ts`                                 | KEEP, real xlsxRows consumer in launcher                                      |
| `xlsxImportListener` (KEEP)                  | `src/renderer/store/xlsxImportListener.ts`                                     | KEEP, real xlsx:import-complete listener                                      |
| `dcmConfig.bswmdPath.override` i18n (DELETE) | `src/shared/i18n/{en,zh-CN,}/odx.ts`                                           | DELETE (no consumer after override UI removed)                                |
| `dcmConfig.generateNew.button` i18n (NEW)    | `src/shared/i18n/{en,zh-CN,}/odx.ts`                                           | NEW ('Generate New' / '重新生成')                                             |

## 3. Detailed Design

### T1 — Pre-flight greps + remove `bswmdPathOverride` from launcher

**Pre-flight verification (must pass before code change)**:

```bash
grep -rn "bswmdPathOverride" src/    # 期望: 3 个文件 (launcher + dialog + test)
grep -rn "handleOverridePick\|handleOverrideClear" src/  # 期望: 3 个文件
grep -rn "DcmConfigOverridePicker" src/   # 期望: 2 个文件 (component + test)
grep -rn "dcmConfig.bswmdPath.override" src/  # 期望: 4 个文件 (3 i18n + dialog summary + comment in test)
grep -rn "bswmd:pick\|BSWMD_PICK\|BswmdPickResult\|bswmdPick(" src/  # 期望: 8 个文件 (Generate New consumer 也在)
```

如果任何一个 grep 给出非预期结果 — STOP,先 reconnaissance,然后再继续。

**Code change**:

`src/renderer/hooks/useDcmConfigLauncher.ts`:

```diff
 interface LauncherState {
   mode: 'idle' | 'picking-odx' | 'pending' | 'success' | 'error';
   result?: Result<DcmConfigHandlerResult, DcmConfigError>;
   statusMessage?: string;
   inFlightRef: boolean;
-  bswmdPathOverride?: string;
+  lastOdxPath?: string;  // v1.33.1 — captured at open() success
 }

 interface UseDcmConfigLauncherReturn {
-  handleOverridePick: (path: string) => void;
-  handleOverrideClear: () => void;
+  handleGenerateNew: () => Promise<void>;
 }
```

Inside `open()` callback (called both in `promptAndOpen` + `handlePickerResolve`),after successful dcm:config response:

```ts
// v1.33.1 — capture odxPath so handleGenerateNew can re-fire
setState((s) => ({ ...s, lastOdxPath: odxPath }));
```

In `promptAndOpen` and `handlePickerResolve`,revert:

```diff
-      bswmdPath: state.bswmdPathOverride ?? bswmdHasDcm.dcmBswmdPath,
+      bswmdPath: bswmdHasDcm.dcmBswmdPath,
```

Tests deleted from `useDcmConfigLauncher.test.ts` (3 cases from v1.33.0 MINOR T5):

- `it('handleOverridePick sets bswmdPathOverride state')`
- `it('handleOverrideClear clears bswmdPathOverride state')`
- 第三 test case 是 `xlsxRows from xlsxLastImport.rows` 的 binding variant — 该 assertion 在 T2 会被 `lastOdxPath` capture 测试改写(同一 test function 重命名为 `lastOdxPath captured when open() resolves (replaces xlsxRows placeholder)`)。Effective deletions:3 cases (T1 commit deletes only `handleOverridePick` + `handleOverrideClear` + 上述 rename 后的旧描述);T2 commit 写入 4 新 cases。

### T2 — Add `handleGenerateNew` + lastOdxPath wiring

```ts
// In useDcmConfigLauncher.ts:
import { arxmlModuleShortNames } from '../../arxml/arxmlModuleShortNames.js';
import { DCM_MODULE_SHORT_NAME } from '../../../core/bridge/dcmConstants.js';

const handleGenerateNew = useCallback(async (): Promise<void> => {
  if (inFlightRef.current) return; // re-entrancy guard
  const r = await window.autosarApi.bswmdPick();
  if (r.kind !== 'opened') return; // canceled or read-failed (latter already showed dialog)
  // Sanity check picked file is a Dcm BSWMD.
  const modules = arxmlModuleShortNames(r.content);
  if (!modules.includes(DCM_MODULE_SHORT_NAME)) {
    console.warn(`useDcmConfigLauncher: Generate New picked non-Dcm BSWMD`);
    return;
  }
  // Resolve odxPath: previous captured value OR active document.
  const odxPath = state.lastOdxPath ?? activeDocumentPath;
  if (odxPath === undefined) {
    console.warn(`useDcmConfigLauncher: Generate New unavailable, no lastOdxPath`);
    return;
  }
  inFlightRef.current = true;
  try {
    const xlsxRows = useArxmlStore.getState().xlsxLastImport?.rows ?? [];
    await open({ odxPath, xlsxRows, bswmdPath: r.path });
    // open() callback fires setState(result + lastOdxPath=odxPath).
  } finally {
    inFlightRef.current = false;
  }
}, [state.lastOdxPath, activeDocumentPath, open]);
```

**Tests added** (4):

```ts
it('handleGenerateNew opens bswmd:pick and re-fires dcm:config with new bswmdPath (happy path)', async () => { ... });
it('handleGenerateNew does nothing when bswmd:pick returns canceled', async () => { ... });
it('handleGenerateNew does nothing when picked file is not Dcm BSWMD', async () => { ... });
it('handleGenerateNew is no-op when lastOdxPath and activeDocumentPath are both undefined', async () => { ... });
```

### T3 — Remove `DcmConfigOverridePicker` + add Generate New button to SuccessDialog

**Delete**:

- `src/renderer/components/dcmConfig/DcmConfigOverridePicker.tsx`
- `src/renderer/components/dcmConfig/__tests__/DcmConfigOverridePicker.test.tsx`

**Modify `DcmConfigSuccessDialog.tsx`**:

```diff
-      {result.bswmdPath && (
-        <p className="dcm-config-success-bswmd-autofill">...</p>
-      )}
+      <p className="dcm-config-success-bswmd-autofill">
+        {t(locale, 'dcmConfig.bswmdPath.autofill')}: <code>{result.bswmdPath}</code>
+      </p>

-      <details>
-        <summary>{t(locale, 'dcmConfig.bswmdPath.override')}</summary>
-        <input type="text" readOnly value={...} />
-        <DcmConfigOverridePicker value={...} onChange={...} onCancel={...} />
-      </details>

+      <button
+        type="button"
+        onClick={onGenerateNew}
+        data-testid="dcm-config-generate-new"
+      >
+        {t(locale, 'dcmConfig.generateNew.button')}
+      </button>
```

`onGenerateNew` 是 `<DcmConfigSuccessDialog>` 新 prop,`<DcmConfigSuccessDialog>` 在 `App.tsx` 中 mount,`<DcmConfigSuccessDialog onGenerateNew={launcher.handleGenerateNew} />`。

**Modify `App.tsx`**: 传 `onGenerateNew={launcher.handleGenerateNew}` 到 `<DcmConfigSuccessDialog>`。

**Modify `DcmConfigSuccessDialog.css`**:

```diff
-.dcm-config-override-picker { ... }
-.dcm-config-override-picker button { ... }
+.dcm-config-generate-new {
+  /* ...matches primary button style... */
+}
```

**Tests added**:2

```tsx
it('renders Generate New button when result.value present (en)', () => { ... });
it('renders Generate New button when result.value present (zh-CN)', () => { ... });
```

**Tests deleted**:2

```tsx
it('Override <details> renders Browse + Clear buttons', ...);  // (brief-faithful from v1.33.0 T2)
it('SuccessDialog override <details> input value matches autofilled bswmdPath (en)', ...);
it('SuccessDialog override <details> input value matches autofilled bswmdPath (zh-CN)', ...);
```

### T4 — Remove `dcmConfig.bswmdPath.override` i18n key (no consumer)

从 3 个 i18n bundles 删除:

- `src/shared/i18n/en/odx.ts`:删 `'dcmConfig.bswmdPath.override': 'Override BSWMD path'`
- `src/shared/i18n/zh-CN/odx.ts`:删 `'dcmConfig.bswmdPath.override': '覆盖 BSWMD 路径'`
- `src/shared/i18n/odx.ts`:删 `readonly 'dcmConfig.bswmdPath.override': string;`

**新增**:

- `src/shared/i18n/en/odx.ts`:加 `'dcmConfig.generateNew.button': 'Generate New'`
- `src/shared/i18n/zh-CN/odx.ts`:加 `'dcmConfig.generateNew.button': '重新生成'`
- `src/shared/i18n/odx.ts`:加 `readonly 'dcmConfig.generateNew.button': string;`

### T5 — Ship

Standard PATCH ship mechanics per the project's `gh-api-ship-pattern-recap` + `follow-tags-unreliable-separate-push-tag` + `gh-release-create-40-char-target-first-try-no-422` lessons:

1. `pnpm verify` (7 stages GREEN).
2. `git push origin main` + `git push origin v1.33.1` (TWO separate pushes).
3. `gh release create v1.33.1 --target <40-char-sha> --notes-file docs/release-notes/v1.33.1/README.md`.

## 4. Test Plan

### Test budget (-5 net)

| Test file                                                                                             | Δ                                             | Cumulative      |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------- |
| `src/renderer/hooks/__tests__/useDcmConfigLauncher.test.ts` (UPDATED + RED/GREEN)                     | -3 (override wiring) +4 (Generate New)        | 3003 → 3004     |
| `src/renderer/components/dcmConfig/__tests__/DcmConfigSuccessDialog.test.tsx` (UPDATED)               | -2 (override absent) +2 (Generate New button) | 3004 → 3004     |
| `src/renderer/components/dcmConfig/__tests__/DcmConfigOverridePicker.test.tsx` (DELETE)               | -5                                            | 3004 → 2999     |
| `src/renderer/components/dcmConfig/__tests__/DcmConfigOverridePicker.test.tsx` (DELETE — count check) |                                               |                 |
| **Net**                                                                                               | -5                                            | **3003 → 2998** |

(v1.33.1 PATCH 与 v1.33.0 MINOR +16 是单方向不同 — PATCH 期间允许测试数下降 due to feature revert.)

Baseline 3003 + 7 SKIP / 0 fail → target **2998 + 7 SKIP / 0 fail**.

### Subagent-driven task split (5 tasks)

| #   | Task                                                                  | Model  | Test delta |
| --- | --------------------------------------------------------------------- | ------ | ---------- |
| T1  | Preflight grep + remove `bswmdPathOverride` state/interface           | Haiku  | -3         |
| T2  | `lastOdxPath` state + `handleGenerateNew` action + 4 tests            | Sonnet | +4         |
| T3  | Delete `DcmConfigOverridePicker` + add `<GenerateNewButton>`          | Sonnet | -2 +2      |
| T4  | Remove `dcmConfig.bswmdPath.override` i18n + add `generateNew.button` | Haiku  | +0         |
| T5  | Ship: `pnpm verify` + 2 separate pushes + `gh release create`         | Sonnet | (wiring)   |

## 5. Risk Assessment

| Risk                                                                            | Likelihood | Impact | Mitigation                                                                                                                                                                  |
| ------------------------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Removing override UI 撤销 `bswmdPathOverride` 引用面之外,launcher hook 还有使用 | Low        | Medium | Pre-flight grep 验证 3 个文件 (launcher + dialog + test)。T1 commit body lists removed fields.                                                                              |
| `handleGenerateNew` race 与 closure during bswmd:pick — 用户关 dialog 时 pick   | Low        | Low    | 关 dialog 不动 `lastOdxPath`;re-fire on open() resolve 仅 setState(result + lastOdxPath);mode 仍是 'success' 时 dialog 重渲染。                                             |
| 用户不点 Browse 而坚持 current BSWMD 路径 — Generate New 是不是单独 deletion?   | Low        | Low    | "Cancel/Close" 按钮独立。"Generate New" 是 primary — 不存在 accidental deletion。                                                                                           |
| `lastOdxPath` 在 user 还没跑过 dcm:config 时为 undefined                        | Low        | Low    | `handleGenerateNew` 在 `state.mode !== 'success'` 时 unreachable。Defensive check anyway if both `lastOdxPath` 和 `activeDocumentPath` 都 undefined。                       |
| `dcmConfig.bswmdPath.override` i18n key 删除但其他地方仍然 reference            | Low        | Medium | T4 之前 grep 验证:3 i18n bundle + SuccessDialog `<summary>` + test file comment。T4 commit 后再 grep `dcmConfig\.bswmdPath\.override` = 0 hits。                            |
| Generate New 重复 click 触发 race (inFlight 没 release 前)                      | Low        | Medium | 复用现有 `inFlightRef` re-entrancy guard。                                                                                                                                  |
| 删除 DcmConfigOverridePicker 但 css rule reference 残留在 main bundle           | Low        | Low    | Pre-flight grep `dcm-config-override-picker` class = 0 hits after T3。                                                                                                      |
| `bswmd:pick` IPC contract 改动会被外部 consumer 依赖                            | Very Low   | High   | IPC contract 完全不变 (v1.33.0 shipped 之后没改)。Generate New 复用同 channel + handler。                                                                                   |
| Spec §T5 PATCH proposal: 整个 v1.33.0 Override 设计 推倒重来                    | Medium     | High   | 这是 spec intentional,v1.33.0 本就留了 "MEDIUM observation (SuccessDialog override is local-only)" 这个口子,在 v1.33.0 release notes §Known follow-up 中作为新 entry 描述。 |
| Override UI auto-reopen race 路径需要 sequence ID — 缺失                        | Very Low   | Medium | 这是 non-goal,见 Non-Goals §1.7。现有 re-entrancy guard 涵盖 click-twice 情形。                                                                                             |

## 6. Lessons (NEW from v1.33.1 PATCH)

1. **`remove-dead-ui-tied-state-immediately`** — 当一个 MINOR PATCH 撤销另一个 MINOR 的 UI surface,与该 UI 绑定的 state / handler / 类型最好在同 PATCH 删掉,不允许 "state without consumer" 待机。
2. **`partial-feature-rollback-keeps-kept-assets`** — 收口 PATCH 撤销部分 feature,但保留新 IPC 资产(此 PATCH 保留 `bswmd:pick` channel,只删除 UI shell),让 rollback 的破坏半径有限。
3. **`whole-branch-medium-observation-collects-at-minor-ship`** — MEDIUM observation 留到下一个 PATCH 是合理节奏:PATCH 体量小+破坏半径可控。本 PATCH 解 v1.33.0 MINOR 唯一 1 MEDIUM observation。

(注意:**不是** new lesson:`disable-input-without-browse-button-is-debt` — 这是 v1.33.0 已固化的 lesson,本 PATCH 是它的正面闭环 —— 删除 half-finished UI 等于达成 "要么完成,要么不 ship" 的原则。)

## 7. Cross-references

- [v1.33.0 MINOR design spec](2026-07-07-v1-33-0-minor-dcm-config-cleanup-design.md) (parent MINOR)
- [v1.33.0 MINOR release notes](../../release-notes/v1.33.0/README.md) (parent MINOR — contains the MEDIUM observation)
- [v1.32.1 PATCH design spec](2026-07-06-v1-32-1-patch-override-ui-disabled-design.md) (grandparent PATCH)
- Lessons re-applied:
  - `disable-input-without-browse-button-is-debt` (v1.33.0; this PATCH removes the half-finished UI to close the loop)
  - `store-as-source-of-truth-for-async-args` (v1.33.0; `lastOdxPath` is a state field, not a hook local)
  - `centralize-domain-identifiers-when-mapper-and-handler-and-pipeline-share-them` (v1.32.0; reused with `DCM_MODULE_SHORT_NAME`)
  - `presentational-dialog-parity-port-pattern` (v1.32.0; Generate New button stays inside `DcmConfigSuccessDialog`, not at App.tsx level)

## 8. Known follow-ups (deferred to v1.34.0+)

- ❌ `parseArxmlLite` canonicalization (YAGNI until a second consumer emerges)。
- ❌ Override UI persistence across sessions (current design is session-scoped; eliminated with override UI itself in v1.33.1)。
- ❌ Multi-BSWMD project override。
- ❌ `xlsxImportHistory` UI surfacing。
- ❌ Override keyboard shortcut (now N/A — no override UI)。
- ❌ Generate New operation 二次确认 modal (destructive re-write explicit,不需要 confirm)。

## 9. Pre-Ship Verification Checklist

- [ ] Pre-flight grep verifications completed (5 greps in §T1)。
- [ ] All 5 tasks have reviewer-approved status。
- [ ] `pnpm verify` 7-stage GREEN。
- [ ] `git push origin main` succeeds。
- [ ] `git push origin v1.33.1` succeeds (separate push — no `--follow-tags`)。
- [ ] `gh release create v1.33.1` with 40-char SHA succeeds。
- [ ] Tag visible on origin via `git ls-remote --tags origin | grep v1.33.1`。
- [ ] Release URL: `https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.33.1`。
- [ ] `dcmConfig.bswmdPath.override` grep = 0 hits after T4 commit。
- [ ] `bswmdPathOverride`/`handleOverridePick`/`handleOverrideClear` grep = 0 hits after T1 commit。
- [ ] `DcmConfigOverridePicker` grep = 0 hits after T3 commit。
- [ ] `dcm-config-override-picker` CSS class grep = 0 hits after T3 commit。
