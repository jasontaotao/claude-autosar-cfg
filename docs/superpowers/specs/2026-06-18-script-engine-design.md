# Script Engine — Embedded JS/TS Scripting in claude-AutosarCfg (Design Spec)

**Date**: 2026-06-18
**Status**: Draft (待 user review)
**Author**: Claude (brainstorming → writing-plans → implementation)
**Sprint**: 14 #1 of the Sprint 13+ master roadmap (v1.0.0+)
**Target version**: v1.1.0 (MINOR — new feature, additive to manifest)

> **设计预览**: `2026-06-18-script-engine-design-preview.html`（同目录）—— 含完整架构图、UI mockup、运行时序、ctx API 形状、决策对比矩阵。
> 本 spec 锁定结构、接口、契约；UI 细节以预览 HTML 为准。

---

## 1. Context

### 1.1 为什么做

v1.0.0 (HEAD `f93e054` → `01c7135`) 是 release-ready 的 GUI 工具，但工程师面对以下场景无解：

- **自定义校验**：项目级规则（如"所有 ComIPdu 的 PduId 不得重复"）需要走两次 grep + 人工对照
- **批量转换**：项目重命名 / 默认值重置 / 命名风格统一，没有批量入口
- **报告生成**：把 PduR 路由 + 引用关系生成 Excel/CSV，目前要靠手工

业界参照：EB tresos 用 Rhino + `TresosScript` 早期就解决了这三点；Vector DaVinci 用 VBScript / .NET API 解决；Artop 用 Java API 但把 90% 工程师挡在门外。

**本 spec 给 claude-AutosarCfg 加一套 GUI 内嵌 JS 脚本引擎**，让受信工程师（.arxml 项目内）能写脚本做校验、转换、报告。

### 1.2 不做什么（明确 scope-out）

- ❌ **Headless CLI 模式**（V0.1 不做；下个 sprint 独立 spec）
- ❌ **异步 / `await`**（V0.1 同步；沙箱简化）
- ❌ **真取消**（sandbox 不可中断；超时即标记 `timedOut`，等自然结束）
- ❌ **npm / 三方包 import**（仅同项目内 scripts 互 import）
- ❌ **TypeScript 编译**（用户写 JS；CodeMirror 提示 TS 风格作语法高亮，运行时仍是 JS）
- ❌ **网络 / 文件系统 / Electron API**（ctx 不暴露）
- ❌ **修改 manifest schema 的非 scripts 字段**（纯加字段，向后兼容）
- ❌ **多个 BrowserWindow / Modal 化 Scripts 面板**（V0.1 只在主窗口加可隐藏侧栏）
- ❌ **跨项目脚本共享**（V0.1 脚本只跟当前项目走）

### 1.3 核心决策（已 user 拍板）

| ID  | 决策                  | 选项                                                              |
| --- | --------------------- | ----------------------------------------------------------------- |
| Q1  | 主场景                | 自定义校验（validator）+ 批量转换（transformer）                  |
| Q2  | 脚本语言              | JavaScript（同步，CodeMirror 6 编辑器）                           |
| Q3  | API 权限边界          | 读 + 改 + 存项目模型（不开放 fs / net / IPC / Electron）          |
| Q4  | 面板形态              | 主窗口可隐藏侧栏（贴近 ASCET "Scripting" 选项卡）                |
| Q5  | 运行环境              | 主进程 `node:vm.createContext` sandbox                           |
| Q6  | 持久化                | 项目级 `manifest.scripts[]`（向后兼容）                          |
| Q7  | 脚本调度              | 多脚本库 + 同项目内 import 解析（声明式依赖）                    |
| Q8  | 事务语义              | 快照 + commit/discard（失败可回滚）                               |
| Q9  | Kind 分类             | validator / transformer / report / free（UI 区分色块 + 默认按钮） |
| Q10 | 与其他工具关系        | 头次/本设计仅做 GUI 内嵌；CLI 模式另起 spec                      |

### 1.4 与 v1.0.0 baseline 的关系

- **baseline 6 阶段** (format / lint / type-check / test / coverage / build) **不动**
- **core 层** (parser / serializer / validation / bswmd / manifest) **零修改**；脚本 ctx 直接 import 复用
- **manifest schema 扩展**（加 `scripts[]` 字段）；现有 `manifest.test.ts` 仍 pass，旧项目加载时按 `scripts: []` 处理
- **IPC contract 扩展**（加 5 个新通道：list / save / delete / run / progress）
- **release v1.1.0**：MINOR bump（additive feature，无 breaking change）

---

## 2. Architecture

### 2.1 三进程角色不变

```
┌─────────────────── Renderer (React + Zustand) ───────────────────┐
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 原有 5 大区: AppHeader / Tree / Editor / Validation / ...  │  │
│  │ 🆕 Scripts 面板 (可隐藏侧栏)                                │  │
│  │   ├─ 脚本库侧栏 (lib list + kind badge)                     │  │
│  │   ├─ CodeMirror 6 编辑器 (js mode + typescript hint)        │  │
│  │   └─ Output 面板 (log + 校验项 + 摘要 + commit/discard)    │  │
│  └────────────────────────────────────────────────────────────┘  │
│                          ↕ IPC (5 新通道)                          │
└──────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────── Main (Node + Electron) ───────────────────────┐
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 🆕 ipc/scriptHandler.ts    (注册 5 通道)                    │  │
│  │ 🆕 script/vmRunner.ts      (node:vm + timeout 看门狗)        │  │
│  │ 🆕 script/importResolver.ts (预处理 import → ctx._import)   │  │
│  │ 🆕 script/ctx.ts           (白名单 API + Zod schemas)       │  │
│  │ 🆕 script/transaction.ts   (WorkingCopy 快照 + diff/apply)   │  │
│  │ core/ (零修改)        : parser / serializer / validation /  │  │
│  │                          bswmd / manifest                   │  │
│  │ shared/ (扩展 ipc-contract.ts)                                │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 IPC 通道（5 个新增，写入 `shared/ipc-contract.ts`）

| 通道              | 方向     | 入参                                              | 出参                                                  |
| ----------------- | -------- | ------------------------------------------------- | ----------------------------------------------------- |
| `script:list`     | R→M      | `{ projectId }`                                   | `ScriptSummary[]`（不含 `source` 字段）               |
| `script:save`     | R→M      | `{ projectId, id?, name, kind, source }`          | `{ id, updatedAt }`                                   |
| `script:delete`   | R→M      | `{ projectId, id }`                               | `{ ok: true }`                                        |
| `script:run`      | R→M      | `{ projectId, id, timeoutMs? }`                   | `ScriptRunResult`（同步返回主结果）                   |
| `script:progress` | M→R（事件） | `{ runId, level, message, ts }`                | —（推流，多次）                                       |

**注**：`script:run` 整体同步返回，但中途的 `ctx.log.*` 调用通过 `script:progress` 实时回推。Renderer 端在收到主结果前先把 `progress` 累加到输出面板。

### 2.3 不引新依赖

- 沙箱：`node:vm`（Node 内置）
- 编辑器：`codemirror` + `@codemirror/lang-javascript` + `@codemirror/theme-one-dark`（V0.1 唯一新依赖；~200KB gz）
- Zod：暂不引入（用 TS 现有类型 + 简单 `typeof` 校验；V0.2 看是否需要）
- 不引 `isolated-vm` / `vm2` / `esbuild` / `monaco-editor`

### 2.4 数据流：用户点 Run 一次

```
1. 用户点 Run
2. Renderer → script:run { projectId, id, timeoutMs: 5000 }
3. Main:
   a. handler 取 manifest.scripts[id]，无则 error
   b. transaction.snapshot(project) → WorkingCopy
   c. importResolver.resolve(script, manifest.scripts) → DAG-ordered [s]，
      检测循环依赖（无则按依赖序，否则报错返回）
   d. ctx = buildCtx(WorkingCopy, sinks)  // project/document/container/param/validator/log
   e. timeout watchdog 启动 (worker_thread 心跳)
   f. vmRunner.run(compiledSource, ctx) → { returnValue, logs, violations, mutations, error? }
4. 过程中每次 ctx.log.* → script:progress 推回 renderer
5. 完成后回传 ScriptRunResult
6. Renderer 弹出 commit/discard 对话框
7. 用户选 commit → transaction.apply(WorkingCopy) 触发 zustand 合并 + 6 原生校验
8. 用户选 discard → 丢 WorkingCopy，状态回到 run 前
```

---

## 3. ctx API Surface

### 3.1 白名单对象（ctx 暴露给脚本的全部内容）

```typescript
// src/main/script/ctx.ts (V0.1)

import type { ReadonlyProject } from '../../core/project/types.js';
import type { ReadonlyDocument, Document } from '../../core/arxml/types.js';
import type { WorkingCopy } from './transaction.js';

export interface ScriptCtx {
  /** 当前项目的只读视图（容器/参数遍历用） */
  readonly project: ScriptProject;

  /** 当前文档列表（只读元数据） */
  readonly documents: ReadonlyArray<ScriptDocumentSummary>;

  /** 通过 path 拿一个可读写容器（返回 ScriptContainer，mutation 走 WorkingCopy） */
  getContainer(path: string): ScriptContainer | null;

  /** BSWMD schema 只读访问 */
  readonly schema: ScriptSchema;

  /** 脚本自定义校验项出口 → 进入主 Validation 面板 */
  readonly validator: ScriptValidator;

  /** 实时日志 → renderer 输出面板 */
  readonly log: ScriptLogger;

  /** 工具函数（与项目模型解耦） */
  readonly utils: ScriptUtils;
}
```

### 3.2 ScriptProject / ScriptDocument / ScriptContainer / ScriptParam

```typescript
export interface ScriptProject {
  readonly projectId: string;
  readonly name: string;
  readonly documents: ReadonlyArray<ScriptDocumentSummary>;

  /** 按 def path 找所有匹配容器（跨文档） */
  findContainers(filter: {
    def?: string;            // e.g. '/Com/ComConfig/ComIPdu'
    type?: 'ECUC-CONTAINER-VALUE';
    predicate?: (c: ScriptContainer) => boolean;
  }): ScriptContainer[];

  /** 构建全局 path → container 索引（昂贵：O(n)，只读） */
  buildPathIndex(): ReadonlyMap<string, ScriptContainer>;
}

export interface ScriptDocumentSummary {
  readonly path: string;       // 绝对路径
  readonly name: string;        // e.g. 'Com_Com.arxml'
  readonly containerCount: number;
}

export interface ScriptContainer {
  readonly path: string;        // e.g. '/Com/ComConfig/ComIPdu[3]'
  readonly def: string;         // e.g. '/Com/ComConfig/ComIPdu'
  readonly shortName: string;
  readonly params: ReadonlyArray<ScriptParam>;
  readonly children: ReadonlyArray<ScriptContainer>;
  readonly parent: ScriptContainer | null;

  /** 类型守卫 */
  isECUCContainer(): boolean;
  isECUCReferenceContainer(): boolean;

  /** 读参数 */
  getParam(name: string): ScriptParam | null;

  /** 新增子容器（mutate WorkingCopy） */
  addChild(shortName: string): ScriptContainer;
  removeChild(shortName: string): boolean;
}

export interface ScriptParam {
  readonly name: string;
  readonly type: 'integer' | 'float' | 'boolean' | 'string' | 'enum' | 'reference' | 'multiline';
  readonly value: ParamValue;
  readonly definition: string;  // e.g. '/Com/ComConfig/ComIPdu/ComPduId'

  asInteger(): number;
  asString(): string;
  asBoolean(): boolean;
  asEnum(): string;
  asReference(): { value: string; dest?: string };

  /** 写入（走 Zod 风格的简单类型校验 + 触发 project 校验器） */
  setValue(v: ParamValue): void;
}

export type ParamValue = number | string | boolean | { value: string; dest?: string };
```

### 3.3 ScriptValidator / ScriptLogger / ScriptSchema / ScriptUtils

```typescript
export interface ScriptValidator {
  addViolation(input: {
    kind: `script:${string}`;        // 必须以 'script:' 前缀避免与原生 7 种 kind 冲突
    severity: 'error' | 'warning';
    containerPath?: string;
    paramName?: string;
    message: string;                 // 工程师英文；不强制 i18n
    data?: Record<string, unknown>;  // 自由数据，UI 可选展示
  }): void;
}

export interface ScriptLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;      // V0.1 输出面板默认折叠
}

export interface ScriptSchema {
  /** BSWMD 加载的所有 schema 只读访问 */
  getParamDef(definitionPath: string): ScriptParamDef | null;
  getContainerDef(definitionPath: string): ScriptContainerDef | null;
  listModuleShortNames(): string[];
}

export interface ScriptUtils {
  /** 与 core/arxml/path 同构的便捷函数 */
  path: {
    join(...segments: string[]): string;
    split(path: string): string[];
    basename(path: string): string;
  };
  now(): string;                     // ISO string
  assert(cond: unknown, msg: string): asserts cond;
}
```

### 3.4 ctx 不暴露（V0.1 明确禁止）

- `fs` / `path`（Node API）— 用 `ctx.utils.path` 替代
- `process` / `globalThis` 上的任意 Node API
- `require` / `import` 真实包（仅 ctx 自身的 `_import` 可用）
- `console`（脚本里 `console.log()` 会 throw）
- 任何 Electron API（`ipcRenderer` / `dialog` 等）
- `fetch` / `XMLHttpRequest` / 网络 API
- `setTimeout` / `setInterval`（V0.1 同步；异步会破坏沙箱假设）

**实现机制**：`vm.createContext` 时只把 `ctx` 注入；不存在的全局会自然 throw `'foo' is not defined`。

---

## 4. Import Resolver

### 4.1 形态

脚本里写：
```js
import { findByPath, joinPath } from './utils/path';
```

预处理器扫到这条后改写为：
```js
const { findByPath, joinPath } = ctx._import('./utils/path');
```

`ctx._import(id)` 在运行期查项目 manifest 的 `scripts[]`，按 shortName 匹配，返回该脚本 module 的 exports。

### 4.2 DAG 解析

```
1. 收集所有 scripts → 按 shortName 建索引
2. 扫描用户选定入口脚本的 import 语句
3. 递归收集依赖 → 建依赖图
4. DFS 检测循环依赖（环上节点全部报错，列具体环）
5. 拓扑排序：返回 [依赖最深的 ... 入口脚本] 顺序
6. 拼接为单 vm.Script 源：每个被 import 的脚本用 wrapper 暴露到 IIFE 命名空间
```

### 4.3 wrapper 形态（运行期）

```js
// 伪代码：preprocess 输出
(function (ctx) {
  'use strict';
  // === ./utils/path 模块 ===
  const __m_utils_path = (function () {
    // 用户写的 utils/path 源码（已经过同样递归处理）
    return { findByPath, joinPath };
  })();
  // === 入口脚本 ===
  // 用户写的入口脚本源码（import 已替换）
})(ctx);
```

每个 module 缓存到 `importCache: Map<string, CompiledModule>`；同一次 run 内重复 import 命中缓存。

### 4.4 失败模式

| 失败                       | 错误消息                                                |
| -------------------------- | ------------------------------------------------------- |
| 找不到 `from` 目标         | `import: module './utils/path' not found in manifest`   |
| 名字未导出                 | `import: name 'foo' not exported by './utils/path'`     |
| 循环依赖                   | `import: circular dependency: A -> B -> A`              |
| 深度超限（防误用）         | `import: depth limit (8) exceeded`                      |
| ESM 语法未支持             | `import: dynamic import() not supported`                |

### 4.5 V0.1 限制

- 只支持 `import { x, y as z } from './id'`（named imports）
- **不支持**：`import x from './id'`（default）、`import * as x`、`export default`、`import('./id')`（动态）
- 不支持 `import './id'`（side-effect only）
- 不支持 `from 'pkg-name'`（裸模块 specifier）
- 不支持 `require()`（CommonJS）

错误消息明确指出"暂不支持"，指引用户改成 named import 形式。

---

## 5. Manifest Schema 扩展

### 5.1 新增字段（src/core/project/manifest.ts）

```typescript
// 在现有 Manifest 类型上 +1 个可选字段
export type ScriptKind = 'validator' | 'transformer' | 'report' | 'free';

export interface ScriptEntry {
  /** uuid v4，由 save IPC 生成并回写 */
  id: string;

  /** UI 显示名 + 内部 id（import 引用用，建议 kebab-case） */
  name: string;
  shortName: string;          // 唯一；import './shortName' 解析用

  kind: ScriptKind;

  /** 完整 JS 源（V0.1 不压缩，UI 编辑器直接 bind） */
  source: string;

  /** 静态声明的依赖（importResolver 也重扫源码；以这个为权威） */
  imports: ReadonlyArray<{ from: string; names: string[] }>;

  /** 上次更新时间（ISO） */
  updatedAt: string;
}

export interface Manifest {
  // ... existing fields ...

  /** 🆕 V0.1 可选；旧项目不写按 [] 处理 */
  scripts?: ScriptEntry[];
}
```

### 5.2 向后兼容

- `loadManifest(json)` 在 JSON 解析后做 `manifest.scripts ??= []`
- 现有 `manifest.test.ts` 全部继续 pass
- 旧项目打开后 UI 显示空脚本库，**不**自动迁移任何东西

### 5.3 save 行为

- `script:save` 入参不带 id → 生成新 uuid，分配新 shortName（用户可改名）
- 带 id → 覆盖 source / name / kind / imports
- `script:delete` 只删 scripts[] 里的条目；不影响项目其它字段
- 整个 manifest 仍走既有 `project:save` IPC（无新通道）

### 5.4 shortName 约束

- 格式：kebab-case，正则 `^[a-z][a-z0-9-]*$`
- 唯一（重名时 save 报错）
- 长度 3-40
- **黑名单**（与 ctx 已暴露的根级 key 冲突，禁止使用）：
  - `ctx`, `project`, `document`, `documents`, `container`, `param`, `validator`, `schema`, `log`, `utils`
  - `core`, `script`, `scripts`, `manifest`, `arxml`
  - `__proto__`, `constructor`, `prototype`, `hasOwnProperty`（防原型链污染）
- 黑名单实现：`save` 路径做集合查表；命中即 throw `ScriptShortNameReservedError`

---

## 6. UI Design

### 6.1 Scripts 面板布局

主窗口右侧（暂不挤压左/中布局）加可隐藏侧栏：

```
┌─────────────────────────────────────────────────────────────┐
│ [AppHeader]  ...  [🆕 Scripts ▶]  [现有 Toolbar 按钮]       │
├──────────┬─────────────────────────────┬────────────────────┤
│          │                             │                    │
│  Tree    │      Editor                 │   🆕 Scripts      │
│  +       │      (ParamEditor)          │   面板（可隐藏）   │
│  Vali-   │                             │                    │
│  dation  │                             │   脚本库 /         │
│          │                             │   CodeMirror /     │
│          │                             │   Output           │
│          │                             │                    │
└──────────┴─────────────────────────────┴────────────────────┘
```

切换按钮在 AppHeader 工具条右侧（"Scripts ▶" / "Scripts ◀"）。默认折叠。点开后占右侧约 480px，Tree+Editor 区相应收窄（沿用 Sprint 13 现有 react-resizable-panels 机制）。

### 6.2 Scripts 面板三栏

| 子区       | 内容                                                                   |
| ---------- | ---------------------------------------------------------------------- |
| 脚本库     | 上：当前 kind 过滤（all / validator / transformer / report / free）<br>中：脚本列表（kind badge + name + updatedAt）<br>下：+ 新建 / 删除 按钮 |
| 编辑器     | 上：当前脚本 kind 选择器（4 选项）+ name 输入 + Save 按钮 + Run/Stop<br>中：CodeMirror 6（JS mode + one-dark theme + 200ms debounce 自动保存到 manifest）<br>下：import 依赖预览（自动从 source 扫出，可点击跳转） |
| Output     | 上：清空 / 折叠 debug 按钮<br>中：log 流（info/warn/error 时间戳带色）<br>下：摘要（耗时、violation 数、mutation 数、commit/discard 按钮） |

### 6.3 commit / discard UX

- Run 成功且有 mutations → 输出面板右下角出现 `[✓ Commit] [✗ Discard]`
- 用户点 Commit → renderer 把 mutations 应用到 zustand store，触发现有 6 种原生校验 + 派生 'script:*' 校验项追加
- 用户点 Discard → 关闭对话框，输出面板保留 log 摘要但 mutations 不应用
- 15 秒无操作自动 discard（防忘记，状态栏闪烁提示）
- 没有 mutations（纯 validator/report）→ 不弹 commit/discard，只把 violations 推到主 Validation 面板
- Run 失败 → 编辑器跳到错误行（CodeMirror 标记），输出面板红色 banner，无 commit/discard 按钮

### 6.4 校验项 'script:*' 视觉

- Validation 面板新增一个独立组 `Script 校验`（位于现有 7 种 kind 之下）
- 颜色：紫罗兰 `#a78bfa`（区别于现有 7 种）
- 显示 kind 后缀（去掉 'script:' 前缀）+ 严重度 + containerPath + message
- 点击跳到对应 container

### 6.5 i18n（沿用现有 `shared/i18n.ts` 模式）

新增 key（v1.1.0 加）：

```typescript
'script.panel.title'            // 'Scripts / 脚本'
'script.panel.toggle'           // '显示/隐藏 Scripts 面板'
'script.lib.title'              // '脚本库'
'script.lib.empty'              // '还没有脚本，点 + 新建'
'script.lib.new'                // '新建'
'script.lib.delete'             // '删除'
'script.editor.save'            // '保存'
'script.editor.run'             // '运行'
'script.editor.stop'            // '停止'
'script.editor.placeholder'     // '在这里写 JavaScript…'
'script.output.title'           // '输出'
'script.output.clear'           // '清空'
'script.output.commit'          // '应用到项目'
'script.output.discard'         // '放弃改动'
'script.output.summary.mutations' // '修改'
'script.output.summary.violations' // '校验项'
'script.kind.validator'         // '校验'
'script.kind.transformer'       // '转换'
'script.kind.report'            // '报告'
'script.kind.free'              // '自由'
'script.error.syntax'           // '语法错误'
'script.error.runtime'          // '运行时错误'
'script.error.timeout'          // '脚本超时'
'script.error.import'           // 'import 解析失败'
'script.violation.group'        // '脚本校验'
```

英文值同 key，遵循现有 i18n.ts 现有格式（en + zh-CN 双语）。

---

## 7. Transaction Model

### 7.1 WorkingCopy

```typescript
// src/main/script/transaction.ts
export interface WorkingCopy {
  /** 原始项目（只读引用） */
  readonly original: Project;

  /** WorkingCopy 的所有 mutation 累积 */
  readonly mutations: Mutation[];

  /** WorkingCopy 期间新增的 violations */
  readonly violations: ScriptViolation[];

  /** ctx 写入入口；与 ScriptParam.setValue 等同 */
  applyMutation(m: Mutation): void;
}

export type Mutation =
  | { kind: 'set-param'; containerPath: string; paramName: string; newValue: ParamValue }
  | { kind: 'add-child'; containerPath: string; newShortName: string }
  | { kind: 'remove-child'; containerPath: string; shortName: string };
```

### 7.2 实现要点

- **不**对整个项目做 deep clone（5 fixtures 9.2MB，clone 一次很贵）；WorkingCopy 持 `(original, mutations[], violations[])` 引用，不拷贝数据
- `findContainers` / `getParam` 等读操作走 **view 函数**：先按 `containerPath` 查 mutations 数组，有 set-param 变更则用 WorkingCopy 视图，否则用原值
- 写操作（`setValue` / `addChild` / `removeChild`）只往 `mutations[]` push 记录，**不**改原项目；ctx 内部的 ScriptContainer 是 view-backed，setValue 后再读是"读自己刚写的"
- 验证：所有 mutator 走简单 `typeof` + 范围检查（`setValue` 失败时 throw `SchemaViolationError`），避免破坏 schema 不变量
- `commit` 时：把 mutations 应用到原项目（用 core 现有 setter），触发既有 6 种原生校验（与手工编辑同一路径）
- `discard` 时：mutations 数组扔掉，violations 不进入 Validation 面板

### 7.3 commit 后的回放

mutations 已应用到原项目后，renderer 收到的 `ScriptRunResult` 含 `mutations[]`，UI 弹 commit/discard；用户点 commit 时**不**再回放（已应用），只把 `violations[]` 推到 Validation 面板。

---

## 8. Concurrency & Timeout

### 8.1 单实例约束

- 同时只允许 1 个 Run：main 持有 `currentRun?: RunHandle`
- Renderer 端 Run 按钮在另一个 Run 进行中 disabled
- 状态由 main 推回：`idle | running | committing | done | error | timeout`

### 8.2 Timeout

- 默认 5000ms（manifest 可配：`manifest.scripts[id].timeoutMs` 覆盖）
- **V0.1 限制**：`vm.runInContext` 是同步阻塞主线程 API，没有"半路打断"机制。本设计的 timeout 是**事后标记**，不是真取消：
  - 进入 vm 前记录 `start = Date.now()`
  - vm 退出（return / throw）后比对 `Date.now() - start > timeoutMs`，是则在 result 上打 `timedOut: true` flag
  - 依赖 user 写"不会卡死的脚本"（同步循环不应超过 timeout）
- 上述机制的好处是无须 worker_thread（V0.1 保持零新依赖原则）；坏处是脚本真卡死了主进程也卡住，得等用户从任务管理器杀
- V0.2 计划：用 `node:worker_threads` 把 vm 跑在子线程 → 主线程能 `terminate()`，真取消

### 8.3 错误处理矩阵

| 失败               | 表现                                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| 语法错误（解析期） | 编辑器跳到第 X 行，红色 banner，无 commit/discard                          |
| import 解析失败    | 编辑器跳到 import 行，红色 banner，输出 import 错误信息                    |
| 运行时 throw       | 完整 stack trace（去混淆后），红色 banner，discard 自动                    |
| 超时               | 红色 banner + "脚本超时（>5000ms）"，等自然结束后自动 discard              |
| 违反 schema 约束   | `setValue` 抛 `SchemaViolationError`，输出面板 error 行，discard 自动      |
| 内存超限（V0.1 不强制） | 靠 vm 自身 GC；V0.2 计划用 `--max-old-space-size` 限制 worker 线程     |

---

## 9. Error Handling & Test Strategy

### 9.1 测试分层

| 层       | 工具        | 覆盖目标                                                |
| -------- | ----------- | ------------------------------------------------------- |
| Unit     | vitest      | ctx 各方法 / importResolver / transaction / 错误映射     |
| Integration | vitest   | 在 main 端跑 1 个真实脚本（fixture 上的 PduId 校验）     |
| E2E      | playwright  | UI：建脚本 → 改 → run → commit → 校验项进 Validation     |

### 9.2 必须覆盖的 case（80% 是底线）

- ctx.findContainers / getParam / setValue / addChild / removeChild
- 4 种 ParamValue 类型 + as*() 类型守卫 + 类型不匹配 throw
- ctx.validator.addViolation（kind 必须是 'script:' 前缀）
- importResolver 4 种失败模式 + 嵌套 import 5 层
- transaction.commit / discard（含 mutations + violations 互不污染）
- 5 fixture 上的 PduId 校验脚本端到端
- i18n 19 个新 key 的 en + zh-CN 都存在

### 9.3 不在 V0.1 范围

- 性能 / 压测（项目大时 clone cost）
- 国际化到日 / 德 / 法（仅 en + zh-CN）
- 脚本的版本控制 / git 集成（已经跟 manifest 走，git 自然看到 diff）
- 脚本 IDE 高级特性（断点 / 单步 / 类型诊断）

---

## 10. File / Module Layout

```
src/
├── main/
│   ├── script/                    🆕
│   │   ├── vmRunner.ts            (node:vm + timeout)
│   │   ├── importResolver.ts      (DAG + wrapper 生成)
│   │   ├── ctx.ts                 (白名单对象 + Zod 风格校验)
│   │   ├── transaction.ts         (WorkingCopy + commit/discard)
│   │   ├── errors.ts              (ScriptError 类型 + 去混淆)
│   │   └── index.ts               (barrel)
│   └── ipc/
│       └── scriptHandler.ts       🆕 (5 通道注册)
├── preload/
│   └── index.ts                   (+ 5 个 window.api.script* 方法)
├── shared/
│   ├── ipc-contract.ts            (+ 5 个通道名)
│   └── types.ts                   (+ ScriptKind / ScriptEntry / ScriptRunResult)
├── core/
│   └── project/
│       └── manifest.ts            (+ ScriptEntry + scripts?: ScriptEntry[])
├── renderer/
│   ├── components/
│   │   ├── ScriptPanel/           🆕
│   │   │   ├── ScriptPanel.tsx
│   │   │   ├── ScriptLibrary.tsx
│   │   │   ├── ScriptEditor.tsx
│   │   │   ├── ScriptOutput.tsx
│   │   │   ├── ScriptKindBadge.tsx
│   │   │   └── scriptPanel.css
│   │   └── ...
│   ├── hooks/
│   │   └── useScriptActions.ts    🆕 (5 IPC 客户端)
│   └── store/
│       └── useScriptStore.ts      🆕 (zutand 切片: scripts[] + run state)
├── shared/
│   └── i18n.ts                    (+ 19 个 key × 2 语言)
tests/
├── main/script/                   🆕
│   ├── vmRunner.test.ts
│   ├── importResolver.test.ts
│   ├── ctx.test.ts
│   └── transaction.test.ts
├── renderer/components/ScriptPanel/  🆕
│   ├── ScriptLibrary.test.tsx
│   ├── ScriptEditor.test.tsx
│   └── ScriptOutput.test.tsx
├── e2e/
│   └── script-panel.spec.ts       🆕
└── fixtures/scripts/              🆕
    ├── pduid-uniqueness.js        (示例：PduId 校验)
    └── wdgif-defaults.js          (示例：批量恢复默认值)
```

---

## 11. Out of Scope（明确划线）

| 项                       | 何时做                                | 谁来做             |
| ------------------------ | ------------------------------------- | ------------------ |
| Headless CLI 模式        | Sprint 14 #2 / 独立 spec              | 待 user 拍板       |
| 异步 / `await`           | Sprint 14 #3 (如果 user 提需求)        | 待 user 拍板       |
| 取消 sandbox             | Sprint 14 #4（用 worker_threads）      | 待 user 拍板       |
| 多窗口 / Modal           | Sprint 15+                            | 待 user 拍板       |
| npm 包 import            | 不做（违反 sandbox 假设）             | —                  |
| 真实 TypeScript 编译     | 不做（增加 esbuild / swc 依赖）       | —                  |
| 脚本 marketplace         | 远期；先做"导出 .js 字符串"           | —                  |

---

## 12. Open Issues（写 spec 时遗留，进 writing-plans 前再过一遍）

1. **性能**：WorkingCopy 不做 deep clone 的话，`getParam().setValue()` 后下游 `findContainers` 的可见性如何？需在 transaction.test.ts 里加专门的"部分视图"测试覆盖。
2. **import 解析的代码跳转**：编辑器里 Ctrl+Click `'./utils/path'` 要能跳到那个脚本。CodeMirror 6 实现成本？
3. **scripts 字段在 manifest 体积占比**：5 脚本 × 500 行 = 25KB，`.autosarcfg.json` git diff 会臃肿。V0.1 接受，V0.2 看是否拆出 `scripts/` 子目录 + 独立文件。
4. **数据格式 vs 文本格式**：是否允许脚本从外部 `.js` 文件 import 进来？V0.1 暂只 manifest 字符串。V0.2 可加 `manifest.scripts[].sourcePath` 字段。

---

## 13. References

- **设计预览 HTML**：`docs/superpowers/specs/2026-06-18-script-engine-design-preview.html`
- **EB tresos scripting**：Rhino (ES5) + `TresosScript` API + custom validator plugin 扩展点
- **Vector DaVinci**：legacy VBScript / JScript (Classic)，modern .NET API + COM
- **Artop**（开源参考）：Java API for AUTOSAR modeling，无内嵌脚本
- **现有 Sprint 13 #1 templates backend**（参考 IPC handler 形态）：`docs/superpowers/specs/2026-06-17-sprint-13-1-templates-backend-design.md`
- **现有 manifest schema**：`src/core/project/manifest.ts`（Sprint 12 #1 起）
- **现有 i18n 模式**：`src/shared/i18n.ts`（en + zh-CN）
- **现有 react-resizable-panels 布局**：Sprint 13 阶段已接入

---

**Status**: 等 user review；如通过 → writing-plans 写实施计划。
