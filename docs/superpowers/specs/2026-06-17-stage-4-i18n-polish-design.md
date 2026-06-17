# Stage 4 — i18n 抛光 (M6/M7/M8) Design Spec

**Date**: 2026-06-17
**Plan**: [2026-06-17-stage-4-i18n-polish.md](../plans/2026-06-17-stage-4-i18n-polish.md)
**Scope**: 3 i18n polish items from Sprint 12 backlog

## Overview

Sprint 12 (left-panel tabs / NewProjectDialog) left 3 sets of hard-coded English in the UI / IPC layer:

| Item | Location                                          | Hard-coded                                                       |
| ---- | ------------------------------------------------- | ---------------------------------------------------------------- |
| M6   | `ParamEditor.tsx` table headers                   | `Param` / `Type` / `Value`                                       |
| M7   | `pickDirHandler.ts` `dialog.showOpenDialog` title | `Choose Project Directory`                                       |
| M8   | `AppHeader.tsx` `formatParseError` switch         | 4 case strings (`XML malformed:`, `Missing root element:`, etc.) |

Goal: route every user-facing string through `t(locale, key, params)` so the existing locale toggle covers them.

## i18n key naming

Following the existing convention `<scope>.<element>.<detail>`:

- `editor.col.param` — ParamEditor 表头第 1 列 (参数名)
- `editor.col.type` — ParamEditor 表头第 2 列 (类型)
- `editor.col.value` — ParamEditor 表头第 3 列 (取值)
- `dialog.pickDir.title` — New Project 流程的 directory picker title
- `parserError.xmlMalformed` — {message} — AppHeader parser 错误的 xml-malformed 分支
- `parserError.missingRoot` — {message} — missing-root 分支
- `parserError.unsupportedVersion` — {version} — unsupported-version 分支
- `parserError.invalidStructure` — {path} {message} — invalid-structure 分支

## 文案

| Key                              | zh-CN                            | en                                     |
| -------------------------------- | -------------------------------- | -------------------------------------- |
| `editor.col.param`               | 参数                             | Param                                  |
| `editor.col.type`                | 类型                             | Type                                   |
| `editor.col.value`               | 取值                             | Value                                  |
| `dialog.pickDir.title`           | 选择项目目录                     | Choose Project Directory               |
| `parserError.xmlMalformed`       | XML 格式错误: {message}          | XML malformed: {message}               |
| `parserError.missingRoot`        | 缺少根元素: {message}            | Missing root element: {message}        |
| `parserError.unsupportedVersion` | 不支持的 AUTOSAR 版本: {version} | Unsupported AUTOSAR version: {version} |
| `parserError.invalidStructure`   | 结构错误 {path}: {message}       | Invalid structure at {path}: {message} |

## M6 改动 — ParamEditor

`src/renderer/components/editor/ParamEditor.tsx` line 118-120:

```diff
-              <th className="py-1 pr-2">Param</th>
-              <th className="py-1 pr-2">Type</th>
-              <th className="py-1">Value</th>
+              <th className="py-1 pr-2">{t(locale, 'editor.col.param')}</th>
+              <th className="py-1 pr-2">{t(locale, 'editor.col.type')}</th>
+              <th className="py-1">{t(locale, 'editor.col.value')}</th>
```

`locale` already destructured at line 69. No new state. Pure presentational change.

### Tests to update

- `src/renderer/components/editor/__tests__/ParamEditor.test.tsx` — extend to assert headers render in en (current default of suite is en).
  - "renders column headers in English when locale is en"
  - "renders column headers in Chinese when locale is zh-CN"

## M7 改动 — pickDir dialog title

### Contract change — `src/shared/types.ts`

`PickDirRequest` 加一个可选 `locale` 字段：

```ts
export interface PickDirRequest {
  readonly defaultPath?: string;
  readonly locale?: 'zh-CN' | 'en';
}
```

### Handler change — `src/main/ipc/pickDirHandler.ts`

`pickDirHandler` 内部用 `t(locale, 'dialog.pickDir.title')`：

```ts
import { t } from '../../shared/i18n.js';
// ...
const locale = req.locale ?? 'en';
const options: Electron.OpenDialogOptions = {
  title: t(locale, 'dialog.pickDir.title'),
  properties: ['openDirectory'],
};
```

> **设计决策**：默认 locale = `'en'`，因为 IPC 是 main-process API，不在用户的 locale toggle 控制下。caller (renderer) 必须显式传 `locale`。`en` 是兜底因为 OS dialog 标题原文是英文。
>
> **为什么不直接删掉 hard-coded title？** — Electron `dialog.showOpenDialog` 必须传字符串 title，没法用 i18n hook 透明代理；所以必须在 IPC 边界显式传 locale。

### Caller change — `src/renderer/components/NewProjectDialog.tsx`

找到 `pickDir` 调用位置，加 `locale`：

```diff
- await window.autosarApi.pickDir({ defaultPath: ... });
+ await window.autosarApi.pickDir({ defaultPath: ..., locale });
```

`locale` 来自 `useArxmlStore`。

### Tests to update / add

- `src/main/ipc/__tests__/pickDir.test.ts` — 加一个 case：
  - "forwards locale-derived title to dialog.showOpenDialog (zh-CN)"
  - "forwards locale-derived title to dialog.showOpenDialog (en)"
  - "falls back to en when locale is omitted"

## M8 改动 — formatParseError

`src/renderer/components/AppHeader.tsx` line 50-61：

```diff
-function formatParseError(e: ParseError): string {
+function formatParseError(e: ParseError, locale: Locale): string {
   switch (e.kind) {
     case 'xml-malformed':
-      return `XML malformed: ${e.message}`;
+      return t(locale, 'parserError.xmlMalformed', { message: e.message });
     case 'missing-root':
-      return `Missing root element: ${e.message}`;
+      return t(locale, 'parserError.missingRoot', { message: e.message });
     case 'unsupported-version':
-      return `Unsupported AUTOSAR version: ${e.version}`;
+      return t(locale, 'parserError.unsupportedVersion', { version: e.version });
     case 'invalid-structure':
-      return `Invalid structure at ${e.path}: ${e.message}`;
+      return t(locale, 'parserError.invalidStructure', { path: e.path, message: e.message });
   }
 }
```

调用点 line 172：

```diff
-            lastError = `${basename(file.path)}: ${formatParseError(parsed.error)}`;
+            lastError = `${basename(file.path)}: ${formatParseError(parsed.error, locale)}`;
```

`locale` already destructured at line 91. No new state.

### Tests to update / add

- `src/renderer/components/__tests__/AppHeader.test.tsx` — 加一个 case：
  - "Open with parse-failed result shows zh-CN error when locale is zh-CN"
  - "Open with parse-failed result shows en error when locale is en"

## 风险 & 决策

### 风险 1: 旧 `AppHeader` test 期望 `formatParseError` 1-arg 签名

- **影响**: 如果有 test 直接调 `formatParseError` 会编译错。
- **检查**: `formatParseError` 是 `AppHeader.tsx` 的 private function (没 export)，外部 test 无法直接调。只有 `AppHeader.test.tsx` 测 AppHeader 行为，不会触碰内部签名。
- **结论**: 无影响。

### 风险 2: `pickDir` IPC contract 改动是否破 backward compatibility

- **影响**: 旧 caller 不传 `locale` 也不会断（handler 兜底 `'en'`）。
- **结论**: 向后兼容，零风险。

### 风险 3: zh-CN 的 "结构错误" vs en 的 "Invalid structure at" 顺序

- **影响**: zh-CN 文案 `{path}: {message}` 和 en 一致，语义无歧义。
- **结论**: 保持原顺序，不改文案含义。

## 验收

- [ ] `pnpm test` 全部通过 (新 test cases + parity test)
- [ ] `pnpm test:coverage` 维持 96% / 87% 或更高
- [ ] `editor.col.param/type/value` 在 ParamEditor 渲染
- [ ] `dialog.pickDir.title` 在 pickDirHandler IPC title 渲染
- [ ] `parserError.*` 在 AppHeader 的 `formatParseError` 渲染
- [ ] 单一 commit `feat(i18n): polish M6/M7/M8 (Stage 4)`
- [ ] Push 到 `origin/main`
- [ ] code-reviewer APPROVE
