# 内建样例（Built-in Samples）

> 存放随应用分发的 ARXML / BSWMD 样例文件，支撑"新建项目"对话框里的 **AUTOSAR Classic 预设** 等模板选项。
>
> 此目录在**开发期**为占位（`pnpm dev` 直接读取），**生产期**通过 `electron-builder` 的 `extraResources` 字段拷到安装目录的固定路径，运行时由 main process 通过 `process.resourcesPath` 解析。

## 当前状态（Sprint 13 #1）

- ✅ 顶层 `samples/` 目录 + `arxml/` + `.gitkeep` 已建
- ✅ `package.json` 的 `build.extraResources` 已配 `samples/`
- ✅ main process 的 `templates:list` IPC 已实现，渲染器 NewProjectDialog 的 preset picker 已落地
- ⏳ 实际样例文件：用户后续放置（见下方"如何添加模板"）

## 目录结构

```
samples/
├── README.md           # 本文件
├── arxml/              # value-side ARXML 样例（Classic Platform 拓扑、ECU 抽取、SWC 描述等）
│   └── .gitkeep
└── bswmd/              # schema-side BSWMD 样例（后续 Sprint 落地后再建）
    (待建)
```

按文件**类型**分一级目录；按**模板/场景**分二级目录。例如：

```
samples/
└── arxml/
    └── classic-can-if/        # Classic Platform + CanIf 最小骨架
        ├── EcuExtract_Bsw_ECU.arxml
        ├── Com_Com.arxml
        └── bswmd/
            └── Can_Bswmd.arxml
```

## 如何添加一个新模板

1. **在 `samples/arxml/<id>/` 下建子目录**（`<id>` 用 kebab-case 短名，例如 `classic-can-if`、`adaptive-hello`、`empty-pdu-routing`）
2. **写一个 `template.json` 标记文件**（见下方 schema）。**没有这个文件，子目录不会被识别为模板**——这正是 opt-in 设计的核心。
3. **放置 value-side ARXML 文件**在子目录**根**（不要嵌套）：
   - 这些文件会被识别为 value-side，归入 manifest 的 `valueArxmlPaths`
4. **如要附带 BSWMD**，建 `samples/arxml/<id>/bswmd/` 子目录，把 `.arxml` 放进去
   - 这些文件会被识别为 schema-side，归入 manifest 的 `bswmdPaths`
5. **顶层**允许任意 `.arxml` 外的文件（README、LICENSE、`.gitkeep`），但**不计入** picker 的 fileCount，也不拷贝到新项目
6. **重启 dev**（`pnpm dev`），新模板会出现在 NewProjectDialog 的 preset 下拉里
7. **打包**时 `samples/` 整体被 electron-builder 拷到 `process.resourcesPath/samples/arxml/<id>/`

### `template.json` schema

```jsonc
{
  "id": "classic-can-if", // kebab-case，必须与子目录名一致
  "displayName": "Classic CAN-IF", // picker 显示名
  "description": "...", // picker 副标题（说明模板用途）
}
```

三个字段都是**必填**的 string，缺一个 `discoverBuiltinTemplates` 会抛错并在 IPC handler 里报 500。

### 为什么 opt-in？

仓库里已有 100+ 个 reference BSWMD 文件（`samples/arxml/<Module>/Bswmd/<Module>_bswmd.arxml`），这些是从 vendor 上游 sync 进来的**参考数据**，不是用户面向的"模板"。没有 `template.json` 标记的情况下这些目录会被**静默忽略**，picker 里只会出现真正想让用户选的模板。

## 文件分类规则

`src/main/templates/index.ts` 的 `copyTemplateFilesToDir` 用纯路径约定分类：

| 位置                            | 归类                            |
| ------------------------------- | ------------------------------- |
| `<id>/<file>.arxml`（顶层）     | `valueArxmlPaths`               |
| `<id>/<sub>/<file>.arxml`       | `valueArxmlPaths`（`sub` 保留） |
| `<id>/bswmd/<file>.arxml`       | `bswmdPaths`                    |
| `<id>/bswmd/<sub>/<file>.arxml` | `bswmdPaths`（`sub` 保留）      |
| 非 `.arxml` 文件                | 跳过（不拷）                    |
| `template.json`                 | 跳过（不拷）                    |

> **大小写注意**：上述约定 `bswmd/`（小写 b）是**新模板**的标准。仓库内现有的 100+ 参考 BSWMD（`samples/arxml/<Module>/Bswmd/<Module>_bswmd.arxml`，大写 B）属于历史 vendor 上游 sync 数据，**没有** `template.json` 标记，被 opt-in gate 静默忽略，不会出现在 picker 中。新建模板时务必用 `bswmd/`（小写）。

## 显示名

picker 里看到的"Display Name"**直接来自 `template.json` 的 `displayName` 字段**。`humanizeTemplateId(id)` 还保留着，纯粹作为 ad-hoc 工具（给测试 / 日志用），不再影响 picker。

如果想让 id 复杂但显示名简单（例如 `id: "autosar-classic-canif-full"` → `displayName: "Classic CAN-IF"`），用 `template.json` 即可。

## 打包路径

`package.json` 的 `build.extraResources` 已配：

```jsonc
"build": {
  "files": ["dist/**/*"],
  "extraResources": [
    {
      "from": "samples",
      "to": "samples",
      "filter": ["**/*"]
    }
  ]
}
```

| 阶段              | 路径                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| 开发期            | `<repo-root>/samples/`（main process 读 `app.getAppPath()/samples`）                                 |
| 生产期（Windows） | `<install-dir>/resources/samples/`（NSIS 默认装到 `C:\Program Files\AutosarCfg\resources\samples\`） |
| 运行时            | `process.resourcesPath + '/samples'`（main process 读）                                              |

## 维护守则

- ✅ 提交此目录的样例文件（**不要**加入 `.gitignore`）
- ❌ 不要在此目录里放用户真实工程文件（会随安装包分发）
- ❌ 不要引用绝对路径或 vendor 私有扩展（保持 ARXML 在 standard `AUTOSAR_00046.xsd` / `AUTOSAR_4-4.xsd` 范围内）
- 任何改动走和 `src/` 同等的 code review，重点看 ARXML 能否被 `parseBswmd` / `parseArxml` round-trip
- 文件名遵循 AUTOSAR 工具惯例：`EcuExtract_<ShortName>.arxml`、`Bsw_<ShortName>_Bswmd.arxml` 等
- 二级目录用 kebab-case 短名（`classic-can-if` / `adaptive-hello-world` / `empty`）
