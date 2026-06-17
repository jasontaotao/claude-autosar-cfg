# Combined Tree View — 实施方案

> 创建日期：2026-06-17
> 状态：待确认

## 概述

在 FileListTab 顶部增加 `[Combined]` 虚拟入口，点击后 Tree 将所有已加载文档的 module 合并展示。

## 合并后 Tree 结构

```
[Combined]
├── Adc.arxml
│   └── EcucDefs → Adc → ...
├── Can.arxml
│   └── EcucDefs → Can → CanConfigSet → ...
├── CanIf.arxml
│   └── EcucDefs → CanIf → CanIfInitCfg → ...
├── CanNm.arxml
│   └── ...
└── CanSM.arxml
    └── ...
```

## 实施步骤

### Phase 1: 核心基础设施

**Step 1** — `src/renderer/store/useArxmlStore.ts`

- 新增 `buildCombinedDocument(documents, filePaths)` 私有函数
- 为每个源文件的 packages 创建 basename 包装 `ArxmlPackage`
- 返回虚拟 `ArxmlDocument`（`path: '[Combined]'`）
- 同名 basename 冲突时 fallback 到 `[doc:0]` / `[doc:1]` 索引命名
- 浅包装，不深拷贝，性能无损

**Step 2** — `src/core/arxml/path.ts`

- 新增 `findByPathMultiDoc(docs, filePaths, elementPath)` 导出函数
- 从 combined path（如 `/CanIf.arxml/EcucDefs/...`）中剥离 basename 前缀
- 定位源文档后调用现有 `findByPath`

### Phase 2: Store 改造

**Step 3** — `src/renderer/store/useArxmlStore.ts`

- 新增状态：`viewMode: 'single' | 'combined'`（默认 `'single'`）
- 新增派生字段：`displayDoc: ArxmlDocument | null`
- 新增 action：`setViewMode(mode)`
- 所有 mutation 点（`addDocument` / `removeDocument` / `setActiveDocument` / `openProject` / `clear` / `setDoc`）同步重算 `displayDoc`
- `setViewMode` 时重置 `selectedPath = null`

**Step 4** — `src/renderer/store/useArxmlStore.ts`

- `updateParam` 适配 combined 模式
- 检测 `viewMode === 'combined'` 时从 `containerPath` 剥离 basename 前缀
- 定位源文档后调用现有 `applyParamUpdate`

### Phase 3: Tree 组件

**Step 5** — `src/renderer/components/tree/Tree.tsx`

- `ArxmlStoreSlice` 扩展：用 `displayDoc` 替代 `doc`
- 本地 state 订阅改为 `store.getState().displayDoc`
- 空状态检查适配

### Phase 4: 切换入口

**Step 6** — `src/renderer/components/FileListTab.tsx`

- 文件列表顶部插入 `[Combined]` 虚拟条目（有文档时显示）
- 区分样式：merge 图标 + 背景色 + `is-active-doc` 高亮
- 点击 → `setViewMode('combined')`
- 点击普通文件 → `setViewMode('single')` + `setActiveDocument(p)`
- 新增 i18n key：`fileList.combinedView`

### Phase 5: ParamEditor 适配

**Step 7** — `src/renderer/components/editor/ParamEditor.tsx`

- combined 模式下 `selectedPath` 解析改用 `findByPathMultiDoc`
- `updateParam` 继续走 store（Step 4 已处理路径解码）

### Phase 6: 打磨

**Step 8** — `src/renderer/components/ArxmlPanel.tsx`

- combined 模式下显示聚合统计（文档数 + 总 package/element 数）
- dirty 标记使用 `dirtyPaths.size > 0` 综合判断

**Step 9** — `src/shared/i18n.ts`

- 新增 key：`fileList.combinedView`、`arxmlPanel.combined`

### Phase 7: 测试

| 文件                                     | 内容                                          |
| ---------------------------------------- | --------------------------------------------- |
| `useArxmlStore.combined.test.ts`（新建） | `buildCombinedDocument` 单测 + store 集成测试 |
| `path.test.ts`（扩展现有）               | `findByPathMultiDoc` 单测                     |
| `Tree.test.tsx`（扩展现有）              | combined 模式 Tree 渲染验证                   |

## 关键设计决策

| 决策     | 说明                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------- |
| 命名冲突 | 同 basename → `[doc:0]` / `[doc:1]` 索引 fallback，共享 `resolveCombinedPathSegment()` helper   |
| 验证层   | 不改动，`validateProjectForRenderer(documents)` 已全量覆盖                                      |
| 向后兼容 | `viewMode` 默认 `'single'`，此时 `displayDoc === doc`，640 现有测试不受影响                     |
| 性能     | 合并是浅包装（引用原始对象），Tree 懒渲染（expansion set 初始空）                               |
| 路径往返 | combined path 格式 `/<basename>/<原始路径>`，`findByPathMultiDoc` 和 `updateParam` 共享解码逻辑 |

## 成功标准

- [ ] FileListTab 有 `[Combined]` 入口
- [ ] 点击后 Tree 展示所有 module，按文件 basename 分组
- [ ] 点击普通文件恢复单文档视图
- [ ] combined 模式下选中节点 → ParamEditor 显示正确元素
- [ ] combined 模式下编辑参数 → 修改正确源文档
- [ ] 两种模式下 Save 均正常
- [ ] 验证面板不受影响
- [ ] 同名 basename 文件正确去歧义
- [ ] 全部 677 现有测试通过
- [ ] 新代码覆盖率 ≥ 80%
