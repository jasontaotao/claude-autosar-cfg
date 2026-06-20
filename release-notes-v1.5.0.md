## v1.5.0 — Wire BSWMD picker + context menu + segment-aware coverage

MINOR bump: **把 BSWMD Picker / ContextMenu 接上 UI** — 修了 v1.4.0 之后一直藏着的 3 个 P0/P1 缺口（wiring 缺失）。v1.4.1 + v1.4.2 (见 release-notes-v1.4.1.md) 修了 path / schema 数据层；v1.5.0 修 UI 层。组合起来：用户的"右键 → add parameter → 选 → 写盘"端到端通了。

### Highlights

#### P0-3 — App.tsx 整体缺失 wiring（commit `d0f3ecf`）

**Symptom**: 用户在 tree 节点上右击 → 浏览器原生 context menu 被 suppress，但**没有任何 picker / 自定义 menu 弹出来**。`openBswmdPicker` / `openContextMenu` 任何调用都会把 store state 翻成 `open=true`，但**整个 React tree 里没有对应的 root 组件在 mount**，所以 UI 永远不显示。

**Root cause**: `App.tsx` 的 import 列表里**完全没有** `BswmdPickerRoot` 或 `ContextMenuRoot`，整个项目里这两个组件**只在测试文件 import**。

```ts
// App.tsx imports
import { ModuleFromBswmdPicker } from './components/ModuleFromBswmdPicker';
// ❌ 缺 import { BswmdPickerRoot } from './components/BswmdPickerDialog'
// ❌ 缺 import { ContextMenuRoot } from './components/ContextMenu'
// ❌ 缺 import { openContextMenu } from './components/ContextMenu'
```

`LeftPanel.tsx:171` 的 `<Tree store={useArxmlStore} />` **也没传** `onContextMenu` prop — 即使 mount 了也没人 wire。

**Fix**:
- `App.tsx` mount `<BswmdPickerRoot />` + `<ContextMenuRoot onAction={handleContextMenuAction} locale={locale} />`
- 新写 `handleContextMenu = useCallback((path, kind, e) => { openContextMenu({path, kind, shortName}, e.clientX, e.clientY) }, [])` — Tree 节点右击触发
- 新写 `handleContextMenuAction = useCallback((action) => { switch ... })` — exhaustively 路由 5 种 `ContextMenuAction`:
  - `add-container` / `add-parameter` / `add-reference` → `openBswmdPicker({ parentPath, kind })`
  - `delete-container` → `removeContainer(action.path)` (Sprint 15 cascade 流程)
  - `delete-reference` → `setInfo(...)` toast with new i18n key `mutation.action.deleteReferenceNotImplemented` (store 还没 `removeReference` action，**诚实地告诉用户这是 backlog**)
- `LeftPanel.tsx` 加可选 `onContextMenu` prop 透传给 `<Tree onContextMenu={onContextMenu} />`
- `Tree.tsx` + `TreeNode.tsx` `onContextMenu` 形态扩为 `(path, kind, e: MouseEvent)` 接收 React event
- `shared/i18n.ts` 新增 `mutation.action.deleteReferenceNotImplemented` key (zh-CN + en)

**端到端效果**：
1. 用户右击 tree 节点 → suppress native menu → 弹 ContextMenu
2. 点 `+ Add parameter` → handleContextMenuAction switch 命中 'add-parameter' → `openBswmdPicker({parentPath, kind: 'parameter'})`
3. BswmdPickerRoot (现在 mount 在 App.tsx) 订阅 store，open=true → 弹 picker dialog
4. 用户选 param → confirm → `addParameter` store action → 写盘

#### P1 — `isModuleCoveredByBswmd` segments[0] 错位（commit `d0f3ecf`）

**Symptom**: 在 vendor BSWMD 用 `JWQ_CDD_PACK` package 那种 case，ContextMenu 上 add-container / add-parameter / add-reference **全 disabled**（带 tooltip "no-bswmd-for-module"），即使 BSWMD 实际定义了对应 module。

**Root cause** (`src/renderer/components/ContextMenu.tsx:129-141`):

```ts
function isModuleCoveredByBswmd(path: string, schemas: readonly BswmdDocument[]): boolean {
  // path = "/<module>/..." — the module shortName is the first
  // non-empty segment after the leading slash.
  const firstSegment = path.split('/').filter(Boolean)[0];
  ...
  if (mod.shortName === firstSegment) return true;
}
```

注释假设 `path = '/<module>/...'`（无 AR-PACKAGE 前缀），但**实际** value path 形如 `/<AR-PACKAGE>/<MODULE>/<CONTAINER>/...`。注释跟现实不一致。

- 当前 user 的 test1 fixture AR-PACKAGE 跟 module **碰巧同名**（都是 `JWQ3399`）→ 碰巧 work
- BSWMD 文件用 `JWQ_CDD_PACK` package，user 的 ECUC value-side 用了 `JWQ3399` 同名 package — 这是 vendor 数据不严格匹配，但**幸运**地 work
- **任何** AR-PACKAGE ≠ module 的真实 vendor 数据都会 fail

**Fix**:
- `isModuleCoveredByBswmd` 改用 `lastIndexOf` 算法：从 path 末尾往前 walk segments 找 module.shortName
- 加 `BswmdCoverageOptions` optional 参数（`viewMode` + `sourceFilePath`）— 处理 combined mode 的 basename / `[doc:N]` 前缀
- Inlined `stripCombinedPrefix` + `lastPathSegment` 跟 `useArxmlStore.ts` 那份 byte-for-byte 对齐（保持两处同步）
- `buildItems` caller 从 `useArxmlStore.getState()` 拿 `viewMode` + `activeDocumentPath` 传下去
- `'import-merged'` viewMode 在 caller 端降级为 'single'（Sprint 14 wizard state 没有 tree，type-safe 兜底）
- **Backward-compat**：options optional，不传时走 single-mode + segment walk，原 `ContextMenu.test.tsx` 15 个测试 0 改动通过

#### MEDIUM-1 — z-index 撞车（commit `d0f3ecf`）

**Issue**: `ContextMenu.css` z-index 9995 跟 `BswmdPickerDialog.css` z-index 9995 撞车。`App.tsx` 注释说 ContextMenu 在 9998 跟实际不符。**当前 user flow 不触发**（ContextMenu mousedown handler 在 picker mount 前关掉自己），但 comment drift 误导维护者，future change 容易爆。

**Fix**:
- `ContextMenu.css` z-index 9995 → 9994（sits below picker 9995 + cascade 9996 + confirm 9998，匹配 Sprint 15 CSS file 原始意图）
- 注释对齐现实

### Test count

| Before (v1.4.2) | After (v1.5.0) | Delta |
|---|---|---|
| 1537 pass + 1 skipped | 1557 pass + 1 skipped | +20 tests (X2 11 + X3 5 + 4 round-trip drift) |

### Verification

- 1557 tests pass / 1 skip / 0 fail
- 0 type errors (`tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.web.json`)
- 0 lint errors (5 pre-existing fixed in `cae3d74` chore commit)
- pnpm build success (main 148.93 KB / renderer 793.90 KB / preload 2.04 KB)
- Code reviewer: APPROVE_WITH_MINOR (0 C / 0 H / 1 M / 5 L) → MEDIUM-1 fixed in this commit

### Files touched

```
d0f3ecf feat(v1.5.0): wire BSWMD picker + context menu + segment-aware BSWMD coverage
  src/renderer/App.tsx                                                       | 96 + (mount + handlers)
  src/renderer/components/ContextMenu.tsx                                     | 123 + (rewrite isModuleCoveredByBswmd)
  src/renderer/components/ContextMenu.css                                     | 11 ± (z-index 9995→9994)
  src/renderer/components/LeftPanel.tsx                                       | 28 ± (onContextMenu prop)
  src/renderer/components/tree/Tree.tsx                                       | 11 ± (3-arg onContextMenu)
  src/renderer/components/tree/TreeNode.tsx                                   | 10 ± (3-arg + e: MouseEvent)
  src/shared/i18n.ts                                                          | 7 + (deleteReferenceNotImplemented)
  src/renderer/components/__tests__/App.contextMenu.test.tsx                 | 286 + (new, 5 tests)
  src/renderer/components/__tests__/BswmdPickerDialog.mount.test.tsx          | 76 + (new, 3 tests)
  src/renderer/components/__tests__/ContextMenu.coveredByBswmd.test.tsx       | 308 + (new, 5 tests)
  src/renderer/components/__tests__/LeftPanel.contextMenu.test.tsx            | 121 + (new, 3 tests)
  package.json 1.4.2 → 1.5.0
```

### End-to-end user verification (test1 fixture)

1. Open `C:\Users\13777\Desktop\ClaudeAutosarWorkSpace\test1.autosarcfg.json`
   - `bswmd/JWQ3399_bswmd.arxml` + `ecuc/JWQ3399_EcucValues.arxml` 自动加载 (v1.4.2 P0-2)
   - ProjectPanel BSWMD row 显示 `📋 1/1` 而不是 `0/0` (v1.4.2 P0-1)
   - `+` 按钮 enabled (v1.4.2 P0-1)
2. Click tree node `JWQ3399 / JWQ3399ConfigSet / JWQ3399SpiConfig` → right-click
   - ContextMenu 弹出 (v1.5.0 P0-3)
   - Add parameter 按钮 enabled (v1.5.0 P1 segments fix)
3. Click `+ Add parameter`
   - `openBswmdPicker({parentPath: '/JWQ3399/JWQ3399/JWQ3399ConfigSet/JWQ3399SpiConfig', kind: 'parameter'})`
   - BswmdPickerRoot mount 后 picker 弹出 (v1.5.0 P0-3)
4. Note: `JWQ3399SpiConfig` 在 BSWMD 是普通 container，**没有 PARAMETERS 块**（只有 SUB-CONTAINERS 引用 `JWQ3399SpiSequenceRef` 等）。Picker 0 row — **这是 BSWMD 设计正确表达**，不是 bug。Sprint D UX hint 任务待跑。

### Known limitations (deliberate, deferred to v1.5.1+)

- **LOW 1-5 from code review**: 
  - `'message' in result.error` discriminator 改成 `switch (error.kind)` 更 typesafe
  - `lastPathSegment` 在 ContextMenu.tsx inlined，跟 `useArxmlStore.ts` 的 `lastSegment` 重复 — 后续可 export 共享
  - `ContextMenuAction.add-reference` / `delete-reference` 没专门 X2 test (路由跟 `add-parameter` 等同，store 端已有覆盖)
  - `useMemo` deps 间接性 (`bswmdKeyToSchema` vs `[bswmdSchemas, bswmdPaths]`)
  - `storeState.activeDocumentPath ?? storeState.filePath ?? undefined` 链式 fallback 略 awkward
- **MEDIUM 1 + 2 from v1.4.1** dormant unless vendor data violates AUTOSAR module-pkg convention
- **`removeReference` store action** still missing (handled by setInfo toast with i18n key)

### Out of scope (deferred with reason)

- **Sprint 14 #2 — real mutation replay pipeline** (applyMutation stub left from v1.3.0)
- **Sprint D — UX hint when picker has 0 row** ("this container has no PARAMETERS in BSWMD — try +Add subContainer")
- **`isPathInside(manifestDir)` containment** — same as v1.4.0
- **Symlink bypass** — same as v1.4.0
- **v1.4.0 trust sprint follow-ups H1-H10** — same as v1.4.0
