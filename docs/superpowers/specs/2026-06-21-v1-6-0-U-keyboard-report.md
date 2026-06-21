# Cluster U Spec Writer Agent — Report

**Date**: 2026-06-21
**Agent**: v1.6.0 Cluster U Keyboard-First Power User design spec writer
**Status**: DONE

---

## 1. Status

**DONE** — spec shipped at `D:\claude_proj2\claude-AutosarCfg\docs\superpowers\specs\2026-06-21-v1-6-0-U-keyboard-design.md`.

## 2. Spec Path

`D:\claude_proj2\claude-AutosarCfg\docs\superpowers\specs\2026-06-21-v1-6-0-U-keyboard-design.md`

## 3. Spec Section Checklist (10/10)

| #   | Section                       | Status | Notes                                                              |
| --- | ----------------------------- | ------ | ------------------------------------------------------------------ |
| 1   | Overview & Goals              | DONE   | Brainstorm 引用 + out-of-scope (vim mode / emacs mode / mouse gesture) 明确 |
| 2   | User Stories                  | DONE   | 3 个: 老 AUTOSAR 工程师 / NVDA screen reader / power user macro     |
| 3   | Architecture & Components     | DONE   | 新增模块图 (CommandPalette / ShortcutRegistry / KeymapProvider / CheatSheet) + v1.3.0 复用边界 |
| 4   | API/Interface Contract        | DONE   | Shortcut schema / CommandPalette API / IPC 集成 (复用 runScript) / CheatSheet 数据源 |
| 5   | Data Model                    | DONE   | Command / CommandContext / ShortcutBinding / PaletteEntry / CheatSheetSection |
| 6   | Error Handling                | DONE   | Shortcut 冲突 (warn 不 block) / palette 无结果 (aria-live) / script 复用 v1.3.0 / feature flag 早期 return / focus trap |
| 7   | Testing Strategy              | DONE   | 53 unit + 15 integration + 10+ e2e (Playwright + axe-core) / ≥ 95.5/87 覆盖目标 |
| 8   | Migration / Backward Compat   | DONE   | 完全 parallel / 不改 v1.3.0 / 不改 v1.5.1 / feature flag OFF = 0 开销 |
| 9   | Risks & Open Questions        | DONE   | 9 条 user 拍板 + 4 条技术风险                                     |
| 10  | Acceptance Criteria           | DONE   | 13 BLOCK (含 measurable: ≤100ms / 50+ shortcut / 0 conflict 误报 / axe 0 violation) + 3 WARN + 7 OUT |

## 4. Self-Review Checklist (12/12 PASS)

- [x] Cmd-K / Ctrl-K palette 定义完整 (open / close / filter / execute)
- [x] Shortcut schema 定义完整 (Command interface + CommandContext + ModifierToken)
- [x] 50+ shortcut 候选分类列出 (11 类 / 47 个候选, plan 阶段补到 50+)
- [x] 明确复用 v1.3.0 Script Engine (不重复 sandbox, 只调 useScriptStore.runScript)
- [x] 跨平台差异考虑 (Mac Cmd vs Win Ctrl via `navigator.userAgentData` 或 IPC 询问 main process)
- [x] 浏览器 default 冲突讨论 (Cmd+R/Cmd+W/Cmd+T 等 electron menu 显式 registerAccelerator)
- [x] 与 brainstorm 锁定 U 范围一致, 无 scope creep (vim mode / multi-cursor / macro 录制 / mouse gesture / custom keybinding 全部 v1.7.0+)
- [x] 与 v1.5.1 spec 风格保持一致 (同样 14 章节结构 + Decisions Locked 表 + Build Approach 三波 + File Structure locked)
- [x] i18n 策略明确 (≥ 60 keys, 实际 ≥ 72 keys: 46 commands + 10 categories + 6 palette + 5 cheatsheet + 5 errors)
- [x] a11y 策略明确 (WCAG 2.2 AA + axe-core 0 violations + focus trap + aria-live + aria-keyshortcuts + NVDA smoke)
- [x] Feature flag 明确 (`V16_KEYBOARD_FIRST` 默认 OFF, 与 `experimental.streaming` 风格一致但用 `v16` 前缀因 product feature)
- [x] 风险和 user 拍板问题清晰列出 (9 条 open question + 4 条技术风险)

## 5. Key Decisions Locked (5)

1. **Shortcut schema = `{ id, labelKey, category, bindings[], when?, run }`** — i18n 通过 labelKey 走 t(); bindings 字符串语法 `'Mod+K'` (运行时 Mac/Win normalize); when 条件支持 context-aware (e.g. ScriptPanel focus 时 Mod+S = saveScript)
2. **Cmd-K 入口 = Feature flag gated** — `V16_KEYBOARD_FIRST` 默认 OFF; ON 后全局触发, palette 自动 focus 到 input; close 时 focus 还回 previousActiveElement
3. **复用 v1.3.0 Script Engine 范围** — 只复用 `runScript` IPC + ScriptPanel 组件; **不**复用 CodeMirror 编辑器 (palette 自己用 `<input>`); **不**重复造 sandbox; palette "Run Script" 命令直接调 `useScriptStore.runScript(id)`
4. **a11y 策略 = WCAG 2.2 AA** — palette / cheatsheet 都用原生 `<dialog>` + `role="dialog"` + `aria-modal="true"` + focus trap + Esc 关闭 + axe-core CI gate; AppHeader menu items 加 `aria-keyshortcuts="Ctrl+O"`; cheat sheet 按 category 分组显示 50+ 快捷键
5. **跨平台策略 = isMac 检测通过 IPC** — renderer 不直接读 `navigator.platform` (弃用警告); main process 暴露 `window.autosarApi.getPlatform()` → 'darwin' / 'win32' / 'linux'; `normalizeKey('Mod+K')` 渲染时自动 '⌘K' / 'Ctrl+K'

## 6. 50+ Shortcut 候选清单 (47 → plan 阶段补 3+)

| Category | Count | Examples |
|---|---:|---|
| File | 5 | `Mod+O` Open · `Mod+S` Save · `Mod+Shift+S` Save As · `Mod+W` Close · `Mod+R` Recent |
| Edit | 7 | `Mod+Z` Undo · `Mod+Shift+Z` Redo · `Mod+X/C/V` Cut/Copy/Paste · `Mod+F` Find · `Mod+H` Replace |
| View | 5 | `Mod+B` Toggle Left · `Mod+J` Toggle Right · `Mod+=/-/0` Zoom |
| Navigate | 5 | `F12` Go to Def · `Shift+F12` Go to Ref · `F8/Shift+F8` Next/Prev Error · `Mod+P` Quick Open |
| Selection | 5 | `Mod+A` Select All · Expand/Shrink · Multi-cursor Above/Below |
| Tree | 5 | `Mod+Shift+E` Reveal · Collapse/Expand All · Jump Parent/Child |
| Script | 4 | `Mod+Shift+P` Open Editor · Run (via Cmd-K) · `Mod+S` (in panel) · `Shift+Alt+F` Format |
| ECUC | 5 | `Mod+I` Add Container · `Mod+Backspace` Delete · `Mod+D` Duplicate · Add Param · Edit Param |
| Window | 3 | `Mod+Shift+N` New · `Mod+Shift+W` Close · `Mod+1/2/3` Focus |
| Help | 2 | `?` Cheat Sheet · `F1` Docs |
| Palette | 1 | `Mod+K` Toggle |
| **TOTAL** | **47** | (需 plan 阶段补 `Mod+/` Toggle Comment / `Mod+T` New Tab / 1 个到 50+) |

**Conflict 预检** (Q3 决策 = warn not block):
- `Mod+Shift+P` 绑到 Script Editor + Add Parameter → plan 阶段拆分 (改 Add Parameter 到 `Mod+Shift+I`)
- `Mod+S` 主窗口 = Save Project, ScriptPanel 内 = Save Script → 用 `when: ctx => ctx.focusedArea === 'script'` 区分

## 7. Concerns / Open Questions for User

1. **50+ shortcut 完整定稿** — spec 列 47 个候选, 需 plan 阶段 user 拍板补 3+ 个 (建议 `Mod+/` Toggle Comment, `Mod+T` New Tab, `Mod+L` Line Comment); 哪些 binding 命名用户最熟 (EB tresos / VS Code / Sublime 哪个心智模型?)
2. **`Mod+Shift+P` 冲突** — Script Editor vs Add Parameter 同 binding; 建议 Add Parameter 改 `Mod+Shift+I` ("Insert"), 保留 `Mod+Shift+P` 给 Script Editor (VS Code 习惯), user 同意?
3. **Multi-cursor 是否 deferred** — Q6 锁定 defer 到 v1.7.0, 但 ParamEditor 是否需要 placeholder? (建议: 留 TODO, 不在本 sprint)
4. **跨平台检测** — main process 暴露 `window.autosarApi.getPlatform()` IPC (新加 1 个 handler) 还是 renderer 直接读 `navigator.userAgent`? (建议前者, 更可靠)
5. **CodeMirror 内部快捷键冲突** — ScriptPanel 内 CodeMirror 已有自身 keymap; 全局 listener 用 capture phase 还是会冲突? (plan 阶段跑 e2e 实测)
6. **i18n key 数量** — spec 给 ≥ 72 keys, 是否够用? cheat sheet 是否需要每条 binding 都 i18n? (建议 binding 显示本地方言, 例如 "Ctrl+Shift+P" 中文化为 "Ctrl+Shift+P" 不翻译, 但 category label 翻译)
7. **Feature flag 命名** — 用 `V16_KEYBOARD_FIRST` (与版本对齐) 还是 `experimental.keyboardFirst` (与 streaming 一致)? (spec 建议前者, 因它是 product feature 不是 infra; plan 阶段 user 拍板)

---

## 8. Spec 写作中发现的 Ambigious 决策

- **Cheat sheet 排序**: 按 category 内 alphabet 还是按 binding 长度? spec 暂用 category 内 alphabet; plan 可改
- **Palette prefill 参数**: `open('>')` 切到 script mode 是 VS Code 习惯, 但 Cluster U 不一定需要; spec 列出 optional 参数, plan 决定
- **Focus restore 范围**: palette 关闭时 restore focus 到 opening 前的 element, 但 cheatsheet 关闭是否也 restore? spec 默认 both, plan 可改

## 9. 下一步建议

1. **Spec review** (user 拍板 Q1-Q9 + 7 个 open question)
2. **Plan writing** — `docs/superpowers/plans/2026-06-21-v1-6-0-U-keyboard.md` (建议 subagent-driven 3 波合并)
3. **Wave 1 启动** — ShortcutRegistry + 静态定义 + feature flag (~1 wk)

---

## 10. 关联

- [[claude-AutosarCfg-v1-6-brainstorm]] — Cluster U 范围
- [[sprint-14-v1-3-0-shipped]] — 复用 Script Engine runScript IPC
- [[claude-AutosarCfg-v1-5-1-shipped]] — Foundation baseline
- Spec 文件: `D:\claude_proj2\claude-AutosarCfg\docs\superpowers\specs\2026-06-21-v1-6-0-U-keyboard-design.md`
