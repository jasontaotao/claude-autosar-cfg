# Stage 4 — i18n 抛光 (M6/M7/M8)

**Date**: 2026-06-17
**Parent**: [Sprint 13+ Master Roadmap](./2026-06-17-sprint-13-master-roadmap.md) § Stage 4
**Scope**: 3 items from Sprint 12 backlog — `ParamEditor` column headers, OS dialog title, `formatParseError`
**HEAD baseline**: `aea386c` (chore(format), 703 tests / 96.78% / 87.01%)

## Tasks

- [ ] **M6** ParamEditor column header 本地化
  - 改 `Param` / `Type` / `Value` 三个表头为 i18n key
  - 新 key: `editor.col.param`, `editor.col.type`, `editor.col.value` (3 keys)
  - 改 `src/renderer/components/editor/ParamEditor.tsx` line 118-120

- [ ] **M7** OS dialog title 本地化
  - `pickDirHandler` 加 `locale` 参数
  - main 侧用 `t(locale, key, params)` 渲染 dialog title
  - 改 `src/shared/types.ts` (PickDirRequest) + `src/main/ipc/pickDirHandler.ts` + caller (`NewProjectDialog`)
  - 新 key: `dialog.pickDir.title` (1 key)

- [ ] **M8** `formatParseError` 本地化
  - AppHeader 的 `formatParseError(e)` switch 改为走 i18n keys
  - 4 个 new keys: `parserError.xmlMalformed`, `parserError.missingRoot`, `parserError.unsupportedVersion`, `parserError.invalidStructure`
  - 改 `src/renderer/components/AppHeader.tsx` line 50-61

## I18n parity constraint

每加 1 个 i18n key 必须:

1. 在 `Messages` interface 加 readonly field
2. `MessagesZhCN` 和 `MessagesEn` 都加对应文案
3. `src/shared/__tests__/i18n.test.ts` 的 parity test 自动覆盖
4. 至少 1 个新 test case 渲染新 key (RED → GREEN)

## i18n key 总数

3 + 1 + 4 = **8 new keys**

## 工作流

1. RED: 写新 test case (i18n.test.ts 渲染 8 个新 key) → `pnpm test` 失败
2. GREEN: i18n.ts 加 keys + MessagesZhCN/MessagesEn → test 过
3. M6: ParamEditor 改 t() → test
4. M7: pickDirHandler 加 locale + dialog title → test
5. M8: formatParseError 改 t() → test
6. 跑全套: `pnpm test` + `pnpm test:coverage` 必须保持 ≥ 96% / 87%
7. 单一 commit
8. code-reviewer
9. push

## 验收

- [ ] 8 new i18n keys + 3 zh-CN + 3 en 文案
- [ ] ParamEditor 表头 i18n
- [ ] pickDir dialog title i18n
- [ ] formatParseError i18n
- [ ] All tests pass
- [ ] Coverage >= 96% / 87%
- [ ] Single commit pushed to origin/main
- [ ] Code review APPROVE

## 不要

- 不要 bump version（Wave 1 后主 loop 统一到 v0.15.1）
- 不要改其他 sub-stage 的文件
- 不要合并多个 commit
