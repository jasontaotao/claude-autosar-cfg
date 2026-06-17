# Sprint 13 #1 — Built-in Templates Backend (Design Spec)

**Date**: 2026-06-17
**Status**: Draft (待 user review)
**Author**: Claude (brainstorming → writing-plans → implementation)
**Sprint**: 13 #1 of the Sprint 12 #3 follow-up backlog
**Target version**: v0.14.0 (MINOR — new feature, no breaking change)

---

## 1. Context

### 1.1 为什么做

Sprint 12 #3 (v0.13.0) 落地了 `NewProjectDialog` 统一弹窗（`80eb697`）。Sprint 12 #3 的 PROGRESS.md 行 1322 明确说：

> "Sprint 13 #1: Phase 2 模板 (empty / classic / clone), NewProjectDialog 顶部加 TemplateCard, classic 模板预填 bswmdPaths, clone 模板调 `project:clone` IPC + 二级文件选择"

但 Sprint 13 #1 的**第一次尝试**（plan 文件 `planwise-painting-piglet.md`，已删）在 code review BLOCK 后被 user/linter 显式回退到 pre-Sprint-13 state。回退原因：scope 过大（6 个 sub-step 一起 ship + 试图 ship picker UI + 同时引入 manifest schema / IPC contract / main process / projectNewHandler / preload+hook / dialog+i18n / package extraResources 7 块），并且试图 ship 真实 classic 模板的 BSWMD 内容，触发 vendor dialect 兼容性问题。

本 spec 是 Sprint 13 #1 的**重新设计**，遵循"最小可工作后端基础设施，不动 renderer"原则。

### 1.2 不做什么（明确 scope-out）

- **不 ship TemplateCard / picker UI**：renderer 端 NewProjectDialog 保持 Sprint 12 #3 状态（仅 name + dir）
- **不 ship 真实 classic 模板内容**：不预填任何 vendor BSWMD
- **不 ship clone 模板实现**：只留 `template.clone.{displayName,description}` i18n key 占位
- **不 ship project:clone IPC**：留 Sprint 13 #2+ 视情况决定
- **不 ship BSWMD 多选 chips**（Sprint 13 #2）
- **不 ship saveAndProceed 真实实现**（Sprint 13 #3）
- **不 ship overwrite-confirm 二次 dialog**（Sprint 13 #4）
- **不 ship 100+ reference BSWMD 移动**：保持 `samples/arxml/<Module>/Bswmd/<Module>_bswmd.arxml` 原位

### 1.3 核心决策（已 user 拍板）

| ID | 决策 | 选项 |
|---|---|---|
| Q1 | Classic 模板的 BSWMD 内容 | **不 ship**（0 模板，placeholder 都不要） |
| Q2 | Picker UI 范围 | **不 ship picker UI**（renderer 不动） |
| Q3 | 100+ reference BSWMD 归属 | **不另动，discoverBuiltinTemplates 过滤**（opt-in） |
| Q4 | i18n key 处理 | **预留全套 key**（6 个：empty/classic/clone × displayName/description） |

---

## 2. Architecture

### 2.1 高层流程

```
┌────────────────────────────────────────────────────────────────────┐
│ main process startup (bootstrap.ts)                                │
│   ├─ samplesRoot = isDev                                          │
│   │     ? path.join(app.getAppPath(), 'samples')                   │
│   │     : path.join(process.resourcesPath, 'samples')              │
│   ├─ if (!fs.existsSync(samplesRoot)) → warn log, return []       │
│   └─ app._builtinTemplates = discoverBuiltinTemplates(samplesRoot) │
│                          (sort by id, stable)                       │
└────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────┐
│ IPC layer (templatesHandler.ts)                                    │
│   ├─ 'templates:list'   → return summary (no absolute paths)      │
│   └─ 'templates:copy'   → copyTemplateFilesToDir(template, ...)    │
└────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────┐
│ Preload bridge (index.ts)                                          │
│   ├─ window.api.listTemplates()  → invoke 'templates:list'         │
│   └─ window.api.copyTemplate(req) → invoke 'templates:copy'        │
└────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                       (Renderer 在 Sprint 13 #2 接)
```

### 2.2 不引新依赖

所有逻辑走 Node.js `fs` + `path` 内置 API。不引 `chokidar` / `globby` / `glob` / `fast-glob`。Sprint 12 #3 baseline 已用 `node:fs/promises`，本 spec 一致。

### 2.3 严格分层（与 S0 ESLint 一致）

| 层 | 允许 import | 禁止 import |
|---|---|---|
| `src/main/templates/*.ts` | `core/`, `shared/`, `node:*`, `electron` | `react`, `react-dom`, renderer 代码 |
| `src/main/ipc/templatesHandler.ts` | `main/templates/`, `shared/`, `electron` | renderer |
| `src/preload/index.ts` | `shared/`, `electron` | main 业务代码 |
| `src/shared/types/ipc.ts` | 无（纯类型） | 所有运行时 |

### 2.4 错误处理原则

- **discovery 期错误**（samples-root-missing / template-json-invalid / template-id-mismatch）：**warn log + skip**（不 crash 整个 discovery，1 个 template 错不影响其他）
- **IPC handler 错误**（unknown-template / dest-dir-missing / file-copy-failed / dest-dir-not-empty）：**走统一 error envelope**（与 Sprint 12 #1 #2 #3 bswmdRead / projectNew 一致；handler 抛 `TemplateError` 4-kind union，preload 收到 rejected Promise）

---

## 3. Module Layout

### 3.1 新增文件

```
src/main/templates/
├── index.ts              (~30 行)  对外 re-export: discoverBuiltinTemplates, copyTemplateFilesToDir, types, errors
├── discover.ts           (~120 行) discoverBuiltinTemplates(samplesRoot) → BuiltinTemplate[]
├── copy.ts               (~80 行)  copyTemplateFilesToDir(template, samplesRoot, destDir) → CopyResult
├── errors.ts             (~40 行)  TemplateError 4-kind union + classTemplateError(kind, ...) helper
├── types.ts              (~50 行)  BuiltinTemplate, TemplateManifest, CopyResult
├── __tests__/
│   ├── discover.test.ts          (~150 行) 9 case
│   ├── copy.test.ts              (~100 行) 5 case
│   ├── template-json.test.ts     (~80 行)  5 case
│   └── fixtures/
│       └── samples-root/         test fixture (独立, 不走 process.resourcesPath)
│           ├── empty/template.json
│           ├── classic/template.json
│           ├── clone/template.json
│           ├── no-template-json/Can/Bswmd/Can_bswmd.arxml  ← 应被 ignore
│           ├── invalid-template/template.json              ← 缺 displayName
│           └── id-mismatch/template.json                   ← id 字段 != dirname
└── (no other dirs)

src/main/ipc/
├── templatesHandler.ts   (新, ~100 行) register: 'templates:list' + 'templates:copy'
└── __tests__/
    └── templatesHandler.test.ts   (~120 行) 6 case
```

### 3.2 修改文件

| 文件 | 变更 |
|---|---|
| `src/main/ipc/register.ts` | + 2 行: `registerIpcHandlers(['templates:list', 'templates:copy'], templatesHandler)` |
| `src/main/bootstrap.ts` | + 5 行: 启动时调 `discoverBuiltinTemplates` 缓存到 `app._builtinTemplates`（weakMap or 直接 ref） |
| `src/preload/index.ts` | + 2 个 invoke wrapper: `listTemplates()`, `copyTemplate(req)` |
| `src/preload/index.d.ts` | + 类型声明: `interface Api { listTemplates(): Promise<...>; copyTemplate(...): Promise<...> }` |
| `src/shared/types/ipc.ts` | + 4 个 interface: `TemplateListRequest/Response` + `TemplateCopyRequest/Response` |
| `src/shared/locales/zh-CN.json` | + 6 key: `template.empty/classic/clone.{displayName,description}` |
| `src/shared/locales/en.json` | + 同 6 key |
| `src/shared/locales/__tests__/parity.test.ts` | + 6 行: 断言 zh-CN + en 各 6 key 存在 |
| `package.json` | + `build.extraResources: [{ from: 'samples', to: 'samples', filter: ['**/*'] }]` |

### 3.3 公开 API（core 层）

```typescript
// src/main/templates/types.ts
export interface BuiltinTemplate {
  readonly id: string;                    // 'empty' | 'classic' | 'clone'，kebab-case
  readonly displayNameKey: string;        // 'template.empty.displayName'（renderer 端 t() 解析）
  readonly descriptionKey: string;        // 'template.empty.description'
  readonly valueArxmlPaths: readonly string[];   // absolute paths within samplesRoot
  readonly bswmdPaths: readonly string[];
  readonly fileCount: number;             // valueArxmlPaths.length + bswmdPaths.length
}

export interface TemplateManifest {
  readonly id: string;
  readonly displayName: string;   // 原始 displayName（renderer 不直接用, 只取 key）
  readonly description: string;   // 原始 description（同上）
  // Zod schema 拒绝其他字段（strict mode）
}

export interface CopyResult {
  readonly copiedValueArxml: readonly string[];   // absolute paths in destDir
  readonly copiedBswmd: readonly string[];
}

// src/main/templates/discover.ts
export function discoverBuiltinTemplates(samplesRoot: string): BuiltinTemplate[];

// src/main/templates/copy.ts
export function copyTemplateFilesToDir(
  template: BuiltinTemplate,
  samplesRoot: string,
  destDir: string,
): CopyResult;
```

### 3.4 IPC 契约

```typescript
// src/shared/types/ipc.ts
export interface TemplateListRequest {}     // 无字段
export interface TemplateListResponse {
  readonly templates: ReadonlyArray<{
    readonly id: string;
    readonly displayNameKey: string;
    readonly descriptionKey: string;
    readonly fileCount: number;
    // 不暴露绝对路径（renderer 拿不到 process.resourcesPath，且无需求）
  }>;
}

export interface TemplateCopyRequest {
  readonly templateId: string;
  readonly destDir: string;        // 绝对路径（main 侧已 dialog 选过）
}
export interface TemplateCopyResponse {
  readonly copiedValueArxml: readonly string[];   // 相对 destDir 的路径
  readonly copiedBswmd: readonly string[];
}
```

### 3.5 Error envelope

```typescript
// src/main/templates/errors.ts
export type TemplateErrorKind =
  | 'samples-root-missing'        // discovery warn log, return [] (不抛)
  | 'template-json-invalid'       // discovery warn log, skip 该 template (不抛)
  | 'template-id-mismatch'        // discovery warn log, skip (不抛)
  | 'unknown-template'            // IPC handler throw
  | 'dest-dir-missing'            // IPC handler throw
  | 'file-copy-failed'            // IPC handler throw
  | 'dest-dir-not-empty';         // IPC handler throw

export interface TemplateError {
  readonly kind: TemplateErrorKind;
  readonly message: string;        // 中文 + 英文（与 Sprint 12 #1 bswmdRead 错误格式一致）
  readonly details?: Record<string, unknown>;
}

export function classTemplateError(kind: TemplateErrorKind, message: string, details?: Record<string, unknown>): TemplateError;
```

### 3.6 i18n key 设计

`src/shared/locales/zh-CN.json` 与 `en.json` 各加 6 个 key：

```jsonc
{
  "template": {
    "empty": {
      "displayName": "空项目",        // en: "Empty Project"
      "description": "从零开始创建项目"   // en: "Start a new project from scratch"
    },
    "classic": {
      "displayName": "经典（即将上线）",   // en: "Classic (coming soon)"
      "description": "预填常见 BSWMD 的项目模板"  // en: "Project template with common BSWMD prefilled"
    },
    "clone": {
      "displayName": "克隆（即将上线）",   // en: "Clone (coming soon)"
      "description": "基于现有项目创建副本"  // en: "Create a copy of an existing project"
    }
  }
}
```

Parity test 加 6 行断言（zh-CN 6 + en 6 共 12 行，附 parity 框架的 i18n complete 断言）。

### 3.7 package.json 变更

```jsonc
"build": {
  "appId": "com.claude.autosarcfg",
  "productName": "AutosarCfg",
  "directories": { "output": "release" },
  "files": ["dist/**/*"],
  // 新增 ↓
  "extraResources": [
    {
      "from": "samples",
      "to": "samples",
      "filter": ["**/*"]
    }
  ],
  // ... 现有 win / linux / mac 配置保持
}
```

---

## 4. Data Flow（细化）

### 4.1 `discoverBuiltinTemplates` 内部

```typescript
export function discoverBuiltinTemplates(samplesRoot: string): BuiltinTemplate[] {
  if (!fs.existsSync(samplesRoot)) {
    // 静默 warn + return []，不抛
    app.logger.warn('[templates] samples root missing', { samplesRoot });
    return [];
  }

  const entries = fs.readdirSync(samplesRoot, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.'));

  const templates: BuiltinTemplate[] = [];
  for (const entry of entries) {
    const dirPath = path.join(samplesRoot, entry.name);
    const manifestPath = path.join(dirPath, 'template.json');
    if (!fs.existsSync(manifestPath)) continue;   // opt-in: skip reference data

    let manifest: TemplateManifest;
    try {
      const raw = fs.readFileSync(manifestPath, 'utf8');
      const parsed = JSON.parse(raw);
      manifest = TemplateManifestSchema.parse(parsed);
    } catch (e) {
      app.logger.warn('[templates] template.json invalid', { dir: entry.name, err: String(e) });
      continue;
    }

    if (manifest.id !== entry.name) {
      app.logger.warn('[templates] id != dirname', { dir: entry.name, id: manifest.id });
      continue;
    }

    const valueArxmlPaths = walkArxml(dirPath, { exclude: 'bswmd' });
    const bswmdDir = path.join(dirPath, 'bswmd');
    const bswmdPaths = fs.existsSync(bswmdDir) ? walkArxml(bswmdDir, {}) : [];

    templates.push({
      id: manifest.id,
      displayNameKey: `template.${manifest.id}.displayName`,
      descriptionKey: `template.${manifest.id}.description`,
      valueArxmlPaths: valueArxmlPaths.map(p => path.resolve(dirPath, p)),
      bswmdPaths: bswmdPaths.map(p => path.resolve(dirPath, p)),
      fileCount: valueArxmlPaths.length + bswmdPaths.length,
    });
  }

  return templates.sort((a, b) => a.id.localeCompare(b.id));   // 稳定排序
}

// walkArxml: 递归找 *.arxml
function walkArxml(root: string, opts: { exclude?: string }): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); }
    catch { continue; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      if (opts.exclude && e.name === opts.exclude && fs.statSync(path.join(cur, e.name)).isDirectory()) continue;
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && e.name.endsWith('.arxml')) out.push(path.relative(root, full));
    }
  }
  return out.sort();
}
```

### 4.2 `copyTemplateFilesToDir` 内部

```typescript
export function copyTemplateFilesToDir(
  template: BuiltinTemplate,
  samplesRoot: string,
  destDir: string,
): CopyResult {
  if (!fs.existsSync(destDir)) {
    throw classTemplateError('dest-dir-missing', `目标目录不存在: ${destDir}`, { destDir });
  }
  // 不要求 destDir 为空：template 文件可能多于用户现有的同名文件 → overwrite
  // (与 README 设计一致: 模板覆盖写入)

  const copyOne = (src: string): string => {
    const rel = path.relative(samplesRoot, src);
    const dst = path.join(destDir, rel);
    try {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    } catch (e) {
      throw classTemplateError('file-copy-failed', `无法复制 ${rel}: ${String(e)}`, { src, dst });
    }
    return dst;
  };

  return {
    copiedValueArxml: template.valueArxmlPaths.map(copyOne),
    copiedBswmd: template.bswmdPaths.map(copyOne),
  };
}
```

### 4.3 IPC handler 行为

```typescript
// src/main/ipc/templatesHandler.ts
export function registerTemplateIpcHandlers(): void {
  ipcMain.handle('templates:list', async () => {
    const templates = app._builtinTemplates ?? [];
    return {
      templates: templates.map(t => ({
        id: t.id,
        displayNameKey: t.displayNameKey,
        descriptionKey: t.descriptionKey,
        fileCount: t.fileCount,
      })),
    };
  });

  ipcMain.handle('templates:copy', async (_e, req: TemplateCopyRequest) => {
    const templates = app._builtinTemplates ?? [];
    const template = templates.find(t => t.id === req.templateId);
    if (!template) {
      throw classTemplateError('unknown-template', `未找到模板: ${req.templateId}`, { templateId: req.templateId });
    }
    const samplesRoot = app._samplesRoot;
    if (!samplesRoot) {
      throw classTemplateError('samples-root-missing', 'samples 根目录未初始化');
    }
    const result = copyTemplateFilesToDir(template, samplesRoot, req.destDir);
    return {
      copiedValueArxml: result.copiedValueArxml.map(p => path.relative(req.destDir, p)),
      copiedBswmd: result.copiedBswmd.map(p => path.relative(req.destDir, p)),
    };
  });
}
```

---

## 5. Testing Strategy

### 5.1 测试文件 + case 数

| 文件 | case | 覆盖点 |
|---|---|---|
| `src/main/templates/__tests__/discover.test.ts` | 9 | ① samplesRoot 不存在 → `[]` ② 1 个合法 template ③ 3 个合法 sort stability ④ missing `template.json` → opt-in skip ⑤ JSON 语法错 → skip + warn ⑥ Zod fail (缺 displayName) → skip ⑦ id != dirname → skip ⑧ 隐藏目录 (`.foo`) → skip ⑨ value/bawmd 分类正确（含 `bswmd/` 子目录识别） |
| `src/main/templates/__tests__/copy.test.ts` | 5 | ① empty template 0 文件 ② value-only ③ bswmd-only ④ value+bswmd 混合 ⑤ source 路径不存在 → throw `file-copy-failed` |
| `src/main/templates/__tests__/template-json.test.ts` | 5 | ① 合法 manifest ② 缺 displayName ③ 缺 description ④ 缺 id ⑤ id 含大写（Zod reject） |
| `src/main/ipc/__tests__/templatesHandler.test.ts` | 6 | ① list happy path ② list 空 cache → `{ templates: [] }` ③ copy happy path ④ copy unknown-template → throw ⑤ copy dest-dir-missing → throw ⑥ copy file-copy-failed → throw |
| `src/shared/locales/__tests__/parity.test.ts` | +2 | 6 key zh-CN 存在 + 6 key en 存在 |
| **合计新增** | **27 case** | |

### 5.2 Fixture 策略

`src/main/templates/__tests__/fixtures/samples-root/` 用**真实目录结构**：

```
samples-root/
├── empty/template.json                 { id: 'empty', displayName, description }
├── classic/template.json               同上
├── clone/template.json                 同上
├── no-template-json/Can/Bswmd/Can_bswmd.arxml   ← opt-in skip
├── invalid-template/template.json      { id: 'invalid-template' }  ← 缺 displayName
└── id-mismatch/template.json           { id: 'different', displayName, description }  ← id != 'id-mismatch'
```

Test 直接传 `path.join(__dirname, 'fixtures', 'samples-root')` 给 `discoverBuiltinTemplates`，**不**走 `process.resourcesPath` / `app.getAppPath()`。保持测试独立、零 mock、可在 CI 跑。

### 5.3 覆盖率目标

与 Sprint 12 #3 baseline 持平：
- stmts ≥ 96% (baseline 96.47%)
- branches ≥ 85% (baseline 85.45%)
- funcs = 100% (baseline 100%)

**新增约 350 行 src/**（types 50 + discover 120 + copy 80 + errors 40 + handler 100 + bootstrap 5），应自然 lift coverage。`walkArxml` 边界 case 是核心 branch 点，已在 discover.test ⑨ 覆盖。

### 5.4 5/5 baseline 守护

| Item | Threshold | 备注 |
|---|---|---|
| cross-ref | 782 signed-guard [700, 850] | 与 Sprint 12 #3 同 |
| ref-dest | = 0 | 同 |
| ref-cycle | = 0 | 同 |
| schema-unknown | = 0 | 同 |
| **NEW**: samples/ 目录存在 | `samples/arxml/.gitkeep` exists | **新增 baseline item**（本 sprint 引入 samples/ 作为 product 资产） |

### 5.5 不写 E2E / Playwright

- **不**为 bootstrap 启动流程写 E2E（renderer 暂未集成）
- **不**为 IPC handler 写 Playwright（vitest IPC mock 已覆盖，handler 是 13#1 后端逻辑）
- Sprint 13 #2 ship 真实 picker 时再加 E2E

---

## 6. Out of Scope（明确不做）

| 项 | 推到 |
|---|---|
| TemplateCard UI 组件 | Sprint 13 #2 |
| Classic 真实 BSWMD 内容 | Sprint 14+（vendor 选型 + license 调研） |
| Clone IPC + 二级文件选择 | Sprint 14+（需 `project:clone` 新 main handler） |
| BSWMD 多选 chips | Sprint 13 #2 |
| saveAndProceed 真实实现 | Sprint 13 #3 |
| overwrite-confirm 二次 dialog | Sprint 13 #4 |
| 2 个意外 M 文件恢复 | Sprint 13 cleanup |
| i18n M6 ParamEditor column header | Sprint 14+ |
| i18n M7 OS dialog title | Sprint 14+ |
| i18n M8 formatParseError | Sprint 14+ |
| `findModuleForPath` vendor-namespace 兼容 | Sprint 14+ |
| BSWMD serialize round-trip | Sprint 14+ |
| CanIf 用户 BSWMD fixture 加载 | 等用户提供 |
| fixture 体积管理 (#7) | Sprint 14+ |
| electron-builder 打包 (#8) | Sprint 14+（但本 sprint 已加 `extraResources` 块） |
| coverage ≥90% (#9) | Sprint 14+ |

---

## 7. Risk & Open Questions

### 7.1 Risk

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `walkArxml` 递归深度上限 — vendor 大型 samples 可能 stack overflow | Low | Med | 同 Sprint 12 backlog `<CHOICES>` 递归深度上限，**留 Sprint 14+**（本 spec 不为 recursive ARXML 加深，因为只读 `samples/` 而非 user-supplied 路径） |
| `fs.copyFileSync` 缺 8 MiB size cap — 大型 BSWMD 可能 OOM | Low | Med | Sprint 12 #1 bswmdRead 已加 cap；本 spec 在 copy 路径**不**加（template 是 curated, 体积可控）。Sprint 14+ 视实际体积再决定 |
| 100+ reference BSWMD 命名 `Bswmd/`（大写 B）与 samples/README.md 描述的 `bswmd/`（小写 b）不一致 | Med | Low | `walkArxml` 用 case-sensitive 匹配，**大小写敏感**。README 需更新一致。**README 修正**列入本 sprint 1 个 hygiene commit |
| `package.json` `build.extraResources` 缺 — production 装包后 samples/ 找不到 | Med | High | **本 spec 已包含**（§3.7）。测试不能直接验装包路径，但 dev 路径可跑通 |
| 旧的 planwise-painting-piglet.md 已删，新 spec 与原 plan 完全不同 | N/A | N/A | 新 spec 是**重新设计**，不继承旧 plan 任何决策 |

### 7.2 Open Questions

- **Q5 (Sprint 13 #2 决定)**: TemplateCard 的视觉方向？左 panel tabs 化（`docs/left-panel-tabs-proposal.html` 已 mockup）+ TemplateCard 嵌进 files tab？还是 NewProjectDialog 顶部加 inline radio 卡片？
- **Q6 (Sprint 14+ 决定)**: 选哪个 vendor 的 BSWMD ship 进 classic？EB tresos / Vector / AUTOSAR standard 任一？license + 体积 + dialect 兼容是核心约束

### 7.3 Hygiene 修正（in scope）

`samples/README.md` line 71-76 描述 `bswmd/` 子目录（小写 b），但实际 100+ reference 文件用 `Bswmd/`（大写 B）。**修正**：更新 README 行 71-76 为 `Bswmd/`，并在 `walkArxml` 注释里明确 case-sensitive（§4.1 已有注释）。1 个 commit，零代码逻辑变更。

---

## 8. Deliverable Checklist (ship gate)

- [ ] `src/main/templates/{index,discover,copy,errors,types}.ts` 全部 ship
- [ ] `src/main/templates/__tests__/` 14 case 全过
- [ ] `src/main/ipc/templatesHandler.ts` + `__tests__/templatesHandler.test.ts` 6 case 全过
- [ ] `src/main/bootstrap.ts` 启动时调 discover + 缓存到 `app._builtinTemplates`
- [ ] `src/preload/index.ts` + `index.d.ts` 暴露 listTemplates / copyTemplate
- [ ] `src/shared/types/ipc.ts` + 4 interface
- [ ] `src/shared/locales/{zh-CN,en}.json` + 6 key × 2 locales
- [ ] `src/shared/locales/__tests__/parity.test.ts` + 6 断言
- [ ] `package.json` + `build.extraResources` 块
- [ ] `samples/README.md` 大小写 hygiene 修正
- [ ] 640 tests + 27 = 667 tests 全过（**注**：原 640 不变，新增 27）
- [ ] coverage ≥ 96% stmts / ≥ 85% branches / 100% funcs
- [ ] 5/5 baseline 全绿（含 NEW samples/.gitkeep exists）
- [ ] code-reviewer APPROVE（0 CRITICAL / 0 HIGH）
- [ ] v0.14.0 version bump（MINOR） + CHANGELOG.md entry
- [ ] push 到 origin/main（参考 Sprint 12 #1 unset proxy workaround）

---

## 9. 怎么继续

1. User review 本 spec → 拍板 / 修订
2. Invoke `superpowers:writing-plans` skill → 把本 spec 拆成 step-by-step implementation plan
3. 按 plan 执行：先 types/errors → discover → copy → handler → IPC/preload → i18n → package.json → tests → coverage → baseline → commit + push
4. Sprint 13 #2 启动时（template picker UI）再起新 spec
