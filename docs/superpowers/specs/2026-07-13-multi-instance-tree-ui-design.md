# Multi-Instance Tree UI Enhancement — Design Spec

**Date**: 2026-07-13
**Status**: DRAFT — pending user review
**Author**: brainstorming orchestrator (Claude, claude-AutosarCfg maintainer)

## Context

**User pain point (verbatim)**: 在 `JWQ3399AFECellValidSet` 这种 `lower=0, upper=infinite` 的 BSWMD 子容器下,用户可能添加 5/12/30 个同类型实例(以 `_1` / `_2` / `_3` 后缀区分)。**当前 UI 把每个实例渲染成完全独立的 `<TreeNode>` 行**(无集合头、无 N 计数、无批量操作、无排序),用户面对 N 个扁平行时:

1. 找不到 "我在 JWQ3399AFECellValidSet_5 还是 \_15" 的视觉锚点
2. 不能批量选择 / 删除 / 排序同类型兄弟
3. 0..1 上限触顶时 `+` 按钮不消失(点了才报 `multiplicity-exceeded` 后端错误)
4. 上限 (`upperMultiplicity`) 信息完全隐藏,用户无从感知何时触顶

**截图证据**: 用户提供的截图(`C:\Users\13777\.claude\image-cache\.../1.png`)显示 `JWQ3399ConfigSet` 树下,`AFECellValidSet` 与 `AFETempValidSet` 在 dialog 里都是灰色 `[+]` 按钮(`existingShortNames` dedup 命中),`SpiConfig` / `InitConfig` / `LoopConfig` 也是灰(`lower=1` 不进入候选)。

**目标**: 在 Tree 组件里为 BSWMD `lower=0, upper=N`(N>1)的同类型实例集合**新增集合头 + N 计数 + 默认折叠 + 行内操作 + 按 N 自动切换视图密度**,保持后端 immutable mutation 语义不变,纯 UI/UX 升级。

## Scope

### In scope

| File                                                                          | Change                                                                                                                                           |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/renderer/components/tree/Tree.tsx:301-385`                               | `renderChildren()` 加集合模式分支: 当 ≥2 个 siblings 共享同一 `shortName` 时,渲染集合头 + 默认折叠                                               |
| `src/renderer/components/tree/TreeNode.tsx`                                   | 加 `isCollectionHeader` / `groupSize` / `onDuplicate` / `onSortChildren` / `onBulkDelete` props; 行内复制/删除/排序按钮(仅集合头可见)            |
| `src/renderer/components/tree/optionalContainers.ts:44-79`                    | filter 扩展: 同时读 `upperMultiplicity`;返回 `(ContainerDef & { currentCount, upperMultiplicity })[ ]` 给 UI 用;0..1 已饱和时 `+` 禁用 + tooltip |
| `src/renderer/components/tree/collections.ts` (NEW)                           | 新 helper: `groupSiblingsByShortName(elements)`, `maxCollectionSize(siblings)`, `selectViewDensity(n)`                                           |
| `src/renderer/components/tree/CollectionHeader.tsx` (NEW)                     | 集合头组件: `<shortName> ×N [↕] [+ 1] [▼ 全部展开]`                                                                                              |
| `src/renderer/components/ContextMenu.tsx:68-79`                               | action union 加 `'duplicate-children' \| 'sort-children' \| 'bulk-delete'`,对应的 item builder                                                   |
| `src/renderer/store/slices/mutationSlice.ts`                                  | 加 `duplicateContainer(path, count)` / `sortSiblings(parentPath, comparator)` / `bulkDelete(paths)` 三个 action                                  |
| `src/renderer/store/__tests__/useArxmlStore.mutation.test.ts`                 | 加 3 个 multi-instance test:duplicate / sort / bulk-delete                                                                                       |
| `src/renderer/components/tree/__tests__/Tree.collectionHeader.test.tsx` (NEW) | 5 个新 scenario:N=1/3/12/30/100 时 UI 形态 + 行为                                                                                                |
| `src/shared/i18n/editor.ts` (existing cluster)                                | 加 4 个 i18n key: `tree.collectionHeader` / `tree.collectionAtMax` / `tree.duplicateChildren` / `tree.bulkDelete`                                |

### Out of scope (YAGNI / deferred)

- **虚拟滚动 (react-window / @tanstack/virtual)**: N>30 时才需要,本 spec **不引入新依赖**。先做"全部直铺 + 摘要行"方案,N 触顶再迭代。
- **拖拽排序 (drag-and-drop)**: P2 仅做按钮排序,拖拽留作 future work。
- **跨模块引用同类型实例**: 目前同 shortName 兄弟只在一个 parent 下;跨 parent 引用不是本任务。
- **后端 multiplicity 校验改动**: 已有的 `multiplicity-exceeded` / `multiplicity-floor` 错误信封 (`src/core/arxml/mutation/types.ts:27-38`) 已经够用,不改动 core。

## Hard constraints (from current code)

| Constraint                                                      | Source                                                | Implication                                                                         |
| --------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 每个 sibling 是独立 `<TreeNode>`                                | `Tree.tsx:301-347`                                    | 集合头必须是 **额外的合成 row**,不替换真实行;展开时所有真实行仍渲染                 |
| 后端已自动 `_N` 后缀                                            | `container-ops.ts:98-103`                             | UI 命名 dialog **不需要**实现后缀算法,直接调 `addContainer(parent, shortName)` 即可 |
| 后端 multiplicity 校验已有                                      | `container-ops.ts:74-88` (upper) + `:407-451` (floor) | 0..1 触顶的 disable 提示只在前端做,**后端错误兜底**                                 |
| ContextMenu action union 是 discriminated union                 | `ContextMenu.tsx:68-79`                               | 加新 action 变体必须穷举式扩展 union + 每个 builder                                 |
| TreeNode props 是 typed interface                               | `TreeNode.tsx:35-60`                                  | 加 prop 必须更新 type 定义 + 默认值处理                                             |
| i18n cluster 已拆 7 个文件                                      | `src/shared/i18n/editor.ts` (140 keys / 181 行)       | 新 key 必须落到 `editor.ts`(tree 相关 UI),不污染其它 cluster                        |
| `existingShortNames` dedup 当前在 `optionalContainers.ts:62-75` | Theme 2 evidence                                      | 集合头 UI 必须复用这个 dedup 集合,不另起炉灶                                        |
| 测试 mock store 形状固定                                        | `Tree.optionalContainers.test.tsx:136-178`            | 加新 action 必须扩 mock store,否则现有测试挂                                        |

## Architecture

### Component diagram

```
Tree
└── renderChildren(parentPath, elements)
    ├── 真 sibling rows (unchanged): <TreeNode> per real element
    ├── 集合头 (NEW,条件渲染):
    │   └── if (siblings with same shortName >= 2):
    │       └── <CollectionHeader shortName="AFECellValidSet"
    │                              count={3}
    │                              density={auto by N}
    │                              isCollapsed={true default}
    │                              onDuplicate={...}
    │                              onSortChildren={...}
    │                              onBulkDelete={...}>
    │           └── nested <TreeNode> rows for each instance
    └── OptionalAddPlaceholder rows (unchanged):
        └── <OptionalAddPlaceholder shortName="..." onAdd={addContainer}>
```

### Data flow

```
optionalContainers.findMissingOptionalSiblings(...)
  → returns Array<{ cd: ContainerDef, currentCount: number, upper: number | 'infinite' }>
  → CollectionHeader reads `upper` + `currentCount` to disable `+` at max

collections.groupSiblingsByShortName(realSiblings)
  → returns Map<shortName, ArxmlElement[]>
  → Tree renderChildren iterates groups; ≥2 elements → wrap in CollectionHeader

mutationSlice.{duplicateContainer, sortSiblings, bulkDelete}
  → call core/coreAddContainer or coreAddContainer(reuse existing) ×N for duplicate
  → re-order via Array.sort on in-memory doc mutation
  → bulk: Array.from(paths).forEach(coreRemoveContainer)
```

### View-density decision (auto by N)

| N     | View                                         | Justification                        |
| ----- | -------------------------------------------- | ------------------------------------ |
| 1     | 直接渲染无集合头                             | 当前 default 行为,无变化             |
| 2-5   | 集合头 + 全部直铺 + 默认折叠                 | N 小,直铺可读                        |
| 6-15  | 集合头 + 全部直铺 + 右侧参数预览(每行)       | N 中等,需要快速对比                  |
| 16-30 | 集合头 + toggle `▼ 全部展开` + 滚动条        | N 大,默认折叠是必需                  |
| 30+   | 集合头 + toggle + 滚动条 + (future) 虚拟滚动 | 本 spec 实现前 4 档; 30+ 留作 future |

> N 30+ 的虚拟滚动**不**在本 spec 实施,留作 v.next。

## Decision points (recommended approach)

### D1 — 集合头形态: 合成 row(独立于真 sibling)

**Why not 把真 sibling 改成集合子节点**: 真 sibling 必须保留独立 `path` / `selection` / `context menu`(用户可能单独编辑 / 单独删除 / 单独加参数到 `_3` 而不是 `_5`),合成 row 只是视觉锚点 + 集合级操作入口。

### D2 — 默认折叠: 集合头默认 expanded = false

**Why**: 大多数用户场景,先看摘要(集合头 `(×N)`),按需展开。这样 N=30 时屏幕占用恒定,不滚屏。

### D3 — 行内按钮: 复制 / 删除 / 排序都进集合头,不在每个 sibling 行

**Why**: 复制 / 排序 / 批量删除是**集合级**操作,放 sibling 行是噪音。hover 集合头才显示按钮。

### D4 — 0..1 上限: 集合头 `+` 按钮 disabled + tooltip

**Why**: 当前用户截图里看到 `AFETempValidSet` 已经 1 个,要加第 2 个才会报错。提前 disable + tooltip 让用户**事先**知道上限,不是事后报错。

### D5 — `+ 1` 按钮 vs 已有 `OptionalAddPlaceholder` 行: 统一为集合头内 `+ 1` 按钮

**Why**: `OptionalAddPlaceholder` 在树底部,跟"集合内再加一个"语义混淆(它表达"缺少的 sibling")。集合头里的 `+ 1` 明确表达"在此集合里加一个"。

### D6 — 命名 dialog: 不引入(后端自动 `_N`)

**Why**: `container-ops.ts:98-103` 已经自动 suffix,加 dialog 是冗余。如果未来需要"指定名字"再补 dialog。

### D7 — 拖拽排序: 不引入(P2 仅按钮排序)

**Why**: 按钮排序就够覆盖 80% 用例,拖拽实现成本高 + 测试覆盖难。

## Risks

| Risk                                                                       | Mitigation                                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 集合头与已有 `<TreeNode>` 视觉不一致(用户混淆 "集合头 vs 真节点")          | 集合头有独立 `data-kind="collection"` + 集合头右上角 `×N` 角标 + 不同 kind-dot 颜色   |
| `duplicateContainer` 触发 N 个 mutation,中途中断(IPC 失败 / 用户取消)      | 走 `coreAddContainer` × N 的 atomic batch wrapper;失败回滚已加实例                    |
| 集合头默认折叠后,真实 sibling 默认也折叠 → 失去位置感                      | 真实 sibling 仍是独立 `<TreeNode>`,有自己的展开态;集合头不影响 sibling 展开           |
| 新增 mutation action 改动现有测试 fixture                                  | `useArxmlStore.mutation.test.ts` 加 3 个新 case,**不**改现有 case                     |
| `ContextMenu` 加 3 个新 action union 变体,现有 context menu builder 漏覆盖 | 现有 4 个 builder 各加 1 个 `if (target.kind === 'collection')` 分支;新 testcase 验证 |

## Phased delivery

### Phase P1 (1 PATCH) — 集合头 + ×N + 默认折叠 + + 按钮 disabled

- `optionalContainers.ts` filter 扩展读 `upperMultiplicity`
- `collections.ts` + `CollectionHeader.tsx` 新建
- `Tree.tsx:renderChildren` 加集合模式分支
- `Tree.collectionHeader.test.tsx` 5 个新 scenario
- `useArxmlStore.mutation.test.ts` 加 0 case(仅 UI 改)
- 4 个 i18n key

**测试 delta**: +5
**LoC 估算**: +280 / -40

### Phase P2 (1 PATCH) — 行内按钮 + ContextMenu 扩展

- `TreeNode.tsx` 加 `onDuplicate` / `onSortChildren` / `onBulkDelete` props
- `ContextMenu.tsx` 加 3 个 action union 变体 + 2 个 item builder
- `mutationSlice.ts` 加 `duplicateContainer` / `sortSiblings` / `bulkDelete` 3 个 action
- `useArxmlStore.mutation.test.ts` 加 3 个新 case
- `Tree.collectionHeader.test.tsx` 加 2 个 scenario

**测试 delta**: +5
**LoC 估算**: +260 / -20

### Phase P3 (deferred / future) — 按 N 自动切换视图密度 + 虚拟滚动

- 6-15: 参数预览(每行右侧 Param1=xxx, Param2=yyy)
- 16-30: toggle 按钮 + 滚动条
- 30+: 虚拟滚动(需引依赖,先调研 react-window vs @tanstack/virtual)

**YAGNI until**: 真有 OEM 工单反映 N>15 实例难用。

## Verification (how to test end-to-end)

1. **单元测试**: `pnpm test src/renderer/components/tree/__tests__/Tree.collectionHeader.test.tsx` — 5 个新 scenario 全过
2. **mutation 单元测试**: `pnpm test src/renderer/store/__tests__/useArxmlStore.mutation.test.ts` — 3 个新 case 全过
3. **i18n parity**: `pnpm test src/shared/i18n/__tests__/` — 4 个新 key × 2 locale 一致
4. **integration**: `pnpm verify` 8-stage GREEN(format / lint / type-check / test / coverage / build / import-regression / python-self-test)
5. **manual smoke**:
   - 启动 dev server
   - 打开用户提供的 fixture `111.au` 路径
   - `JWQ3399ConfigSet` 下加 `AFECellValidSet` 5 次 → 验证集合头渲染 `(×5)` + 默认折叠 + `+` 按钮仍可见
   - `AFETempValidSet` 加 1 次 → 验证集合头 `(×1)` + `+` 按钮 disabled + tooltip "已达上限"
   - hover 集合头 → 复制 / 删除 / 排序按钮显示
   - 点 `复制` → 验证生成 `_6` 实例 + 复制上一实例参数
   - 点 `排序` → 验证兄弟重排
   - 点 `批量删除` → 验证全部兄弟被移除

## Files to modify (concrete file paths)

### New files

- `src/renderer/components/tree/collections.ts` (~60 LoC)
- `src/renderer/components/tree/CollectionHeader.tsx` (~120 LoC)
- `src/renderer/components/tree/__tests__/Tree.collectionHeader.test.tsx` (~200 LoC, 5 scenarios)

### Modified files

- `src/renderer/components/tree/Tree.tsx:301-385` (+40 LoC: collection branch)
- `src/renderer/components/tree/TreeNode.tsx:35-60` (+15 LoC: 5 new props)
- `src/renderer/components/tree/optionalContainers.ts:44-79` (+30 LoC: currentCount + upper in return)
- `src/renderer/components/ContextMenu.tsx:68-79` (+15 LoC: 3 new action variants + 1 new builder branch)
- `src/renderer/store/slices/mutationSlice.ts:55-137` (+80 LoC: 3 new actions)
- `src/renderer/store/__tests__/useArxmlStore.mutation.test.ts` (+60 LoC: 3 new cases)
- `src/shared/i18n/editor.ts` (+20 LoC: 4 new keys × 2 locales)

**Total**: ~640 LoC added / -60 LoC net (3 files new, 7 files modified)

## Open questions (to resolve in spec self-review)

1. 集合头的 `+` 按钮: 是 hover 才显示, 还是常驻? — **建议常驻**(always visible),降低点击成本
2. `复制` 是复制"上一实例"还是"第一个实例"? — **建议复制上一个**(用户新建逻辑连续性)
3. `排序` 默认按什么序? — **建议默认按 shortName 后缀数值升序**(`_1` < `_2` < `_10`),可切换按添加顺序
4. 集合头的 collapse/expand 状态是否持久化? — **不持久化**(per-session local state,刷新丢失),降低复杂度

## Self-review checklist (must pass before user review)

- [ ] No placeholder ("TBD" / "TODO" / "类似") — all concrete
- [ ] All file:line references from code-base mapping verified
- [ ] All 4 open questions answered inline above (no `[NEEDS DECISION]` left)
- [ ] Scope check: single subsystem (renderer tree + mutation slice),no decomposition needed
- [ ] Ambiguity check: each phase's deliverable unambiguous

## Next steps (after user approves)

1. Create implementation plan via `superpowers:writing-plans` skill
2. Plan saved to `docs/superpowers/plans/2026-07-13-multi-instance-tree-ui-phase-p1.md`
3. User chooses execution mode (subagent-driven / inline)
4. Implementation starts: P1 first (1 PATCH cycle),P2 second (1 PATCH cycle),P3 deferred

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
