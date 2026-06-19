## v1.3.0 — Sprint 14 Script Engine

Sprint 14 集中 ship **EB tresos 风格的 Script Engine** — 用户在 panel 内写
JavaScript，whitelisted ctx API 操作 ARXML project，validator / transformer /
report / free 4 种 kind 直接进入 ValidationPanel。这是 v1.2.0 release 后第二个
MINOR bump（new feature，零 breaking change）。

### Highlights

- **Main core** (`14073ff` ~ `1aedd45`)：6 个新模块 —
  `types.ts` (ScriptEntry / ScriptLog / ScriptViolation / ScriptMutation 等
  5 个核心类型) / `errors.ts` (16 种 ScriptErrorKind 工厂 +
  `validateShortName` + RESERVED_SHORTNAMES 19 个保留字) /
  `import-resolver.ts` (DAG + cycle 检测 + depth-limit) / `ctx.ts`
  (whitelisted API surface — `project.findContainers` / `getContainer` /
  `validator.addViolation` / `log.*` / `utils.path`) / `transaction.ts`
  (WorkingCopy + commit/discard) / `vm-runner.ts` (`node:vm` 沙箱 + post-hoc
  timeout + user-line stack 捕获)。**零 react/electron import**（vm-runner 用
  `node:vm` 原生隔离，纯净 trusted-engineer trust model）。
- **5 个 IPC 通道** (`8227305` + `2ef9917` + `df47e23`)：
  `SCRIPT_LIST` / `SCRIPT_SAVE` / `SCRIPT_DELETE` / `SCRIPT_RUN` +
  `SCRIPT_PROGRESS` push channel。`script-handler.ts` (299 行) + preload
  bridge 5 wrappers。
- **25 个 i18n keys** (`55c55c8`)：zh-CN + en 双语，覆盖 panel / library /
  editor / output / violation / error 全部 scope。Parity 测试保证双语 key 集合
  完全一致。
- **3 个 sample fixtures** (`adbe248`)：`pduid-uniqueness.js` (validator) /
  `wdgif-defaults.js` (transformer) / `utils/path.js` (shared helper)。`node
  --check` 全过。
- **Renderer** (`d0286bc` ~ `45e3d7c`)：
  - `useScriptStore` (Zustand singleton) + `useScriptActions` (IPC bridge)
  - `ScriptEditor` with **CodeMirror 6** (`@codemirror/state` +
    `lang-javascript` + `theme-one-dark` + `view`)
  - `ScriptLibrary` + `ScriptOutput` + `ScriptKindBadge`
  - `ScriptPanel` 3-column host (library / editor / output) + App/AppHeader
    Scripts toggle
  - `ValidationPanel` Script 校验 group（validator-kind 脚本的 latest run
    violations 单独列出）
- **vite build fix** (`a9fad9d`)：`rollupOptions.external` 扩
  `node:vm` + `node:crypto`，Phase A import 的 Node-only 模块不再被 Vite
  错误内联到 main bundle。
- **T16 PduId validation E2E** (`569e710`)：
  `tests/e2e-vitest/script-pduid-validation.test.ts` — 5 个真实 fixture
  (Com_Com / Det_Det / EcuC_EcuC / PduR_PduR / WdgIf_WdgIf) 跑过完整 pipeline
  (import-resolver + ctx + vm-runner) + 1 个 duplicate-injection case
  （`setParamInDocument` 强制 2 个 ComTxIPdu 共享 id=42 → 验证
  `script:pduid-duplicate` violation 触发）。
- **T17 Playwright E2E happy path** (`e071dfb`)：
  `tests/e2e/script-panel.spec.ts` — Scripts toggle → 选 fixture →
  editor 填充 → Run → output 渲染 logs + status='ok'。`addInitScript` mock
  `window.autosarApi` 完整覆盖 5 个 IPC + progress subscription。

### 21 commits — 3 phase + 2 test + 1 build fix + 1 polish

| Phase | Commits | Theme |
|-------|---------|-------|
| A (T1-T5) | `14073ff` + `4af4576` + `e89f291` + `1aedd45` + `f50a79d` + `d947e53` | 6 core modules + lint polish |
| B (T6-T10) | `8227305` + `2ef9917` + `df47e23` + `55c55c8` + `adbe248` | 5 IPC + handler + preload + i18n + fixtures |
| C (T11-T15) | `d0286bc` + `882acc9` + `0e7b3a3` + `b24d270` + `45e3d7c` | store + CodeMirror 6 editor + Library/Output/Badge + Panel + ValidationPanel Script 校验 |
| Build fix | `a9fad9d` | vite main externalize `node:vm` + `node:crypto` |
| D (T16-T17) | `569e710` + `e071dfb` | 5-fixture E2E + Playwright happy path |

### Tests

- **1493 tests passing**（v1.2.0: 1309 → v1.3.0: 1493，净增 +184）+ 1 skipped
- Phase A: 82 new (`types` 14 + `import-resolver` 25 + `ctx` 18 + `transaction` 11
  + `vm-runner` 14)
- Phase B: 35 new (`script-handler` 10 + preload 4 + i18n 5 + fixtures 3 + types
  smoke 13)
- Phase C: 32 new (`ScriptKindBadge` 4 + `ScriptLibrary` 6 + `ScriptOutput` 7 +
  `ScriptPanel` 7 + `AppHeader.scripts` 4 + `ValidationPanel.scripts` 4)
- Phase D: 7 new (`script-pduid-validation` 6 = 5 fixtures + 1 duplicate +
  `script-panel.spec.ts` 1 = Playwright happy path)
- Coverage：与 v1.2.0 持平，script 子系统（types / errors / resolver / ctx /
  transaction / vm-runner / handler / store）全部 ≥85%

### Code Review / Self-review

- **Phase A review**: 0 CRITICAL / 0 HIGH / 6 LOW（设计 gap 记录）：
  - plan-vs-reality `documents[0].containers[0].params[]` ≠ 真实
    `packages[].elements[].params: Record` → 写 `setters.ts` 适配合成 path
  - `_import` 未实现（vm-runner 不剥 ESM import）→ Phase D T16 inline
    validator 验证
  - transaction 无 set-param partial rollback → renderer 自动 discard
  - cycle detection path-based 而非 minimal cycle
- **Phase B review**: 0 CRITICAL / 0 HIGH / 6 LOW（设计 gap 记录）：
  - i18n 25 keys > spec 19 keys（spec §6.5 与 brief 不一致，跟 spec 走）
  - `emptyProject()` fallback for log-only scripts
  - import-error → ScriptRunResult.status 映射而非 IPC reject
- **Phase C review**: 0 CRITICAL / 0 HIGH / 5 LOW：
  - 779 kB renderer bundle > 500 kB warning（CodeMirror 6 + lang-javascript +
    theme-one-dark）→ Electron desktop 可接受
  - `ScriptPanel.handleNew` stub（spec 允许 Phase D ship proper dialog）
  - `onCommitMutation` placeholder（mutation replay pipeline 待 Phase D 完整接）
  - ValidationPanel Script 校验 group read-only（点击 → ScriptPanel + select
    that script 待 Phase D 接）
- **Phase D review**: 0 CRITICAL / 0 HIGH / 3 LOW：
  - shipped `pduid-uniqueness.js` fixture 不能直接跑（import 语句）→ T16
    inline 等价 validator + setParamInDocument 强制 mutation
  - synthetic XML parser 拒绝 → 改用真实 Com_Com.arxml + in-memory 注入
  - vm-runner 不剥 `import` 语句：保留为已知设计 gap，Phase 15+ 决定 ESM
    引入 vs API 内部 import

### Files

- 53 files changed, +6,500 / -200 lines（rough estimate, exact 在 git diff）
- 新增：19 个 source files + 5 个 test files + 1 个 E2E spec + 1 个
  e2e-vitest spec + 4 docs
- 修改：12 个 source files（store / App.tsx / AppHeader / ValidationPanel /
  preload / shared / i18n / ipc-contract / types / package.json / vite.main）
- 不动：`core/arxml/*` / `core/project/manifest.ts` (additive `scripts?`)
  / `core/import/*`

### Upgrading from v1.2.0

Zero breaking change. MINOR bump per SemVer（新 feature）。

新加了 5 个 IPC channel (`SCRIPT_LIST` / `SCRIPT_SAVE` / `SCRIPT_DELETE` /
`SCRIPT_RUN` / `SCRIPT_PROGRESS`) — 既有 renderer 不感知（仅 ScriptPanel
订阅），manifest 兼容（`scripts?: ScriptEntry[]` additive）。

**`package.json` version 现在与 tag v1.3.0 对齐**。如果 CI badge / script 依赖
`package.json` version，从 v1.2.0 → v1.3.0 会显示从 1.2.0 跳到 1.3.0，符合预期。

### Out of Scope (deferred to Sprint 15+)

- 真实 ES module import（`_import` 当前是 stub，Phase 15 决定 ESM-vm
  wrapper vs 纯 API 内部 import）
- `ScriptPanel.handleNew` proper dialog（当前是 stub saveScript）
- `onCommitMutation` mutation replay pipeline 接通到 arxml store
- ValidationPanel Script 校验 group 点击 → 跳 ScriptPanel + select that script
- Code-split ScriptPanel 子树（lazy `import()` for CodeMirror 6）
- TypeScript-in-script 模式（当前只接受 plain JS）
- Multi-script run + 依赖图可视化
- Script library 浏览（当前只能在 user 项目内 save / load）

### Reference

- Spec: `docs/superpowers/specs/2026-06-18-script-engine-design.md`
- Plan: `docs/superpowers/plans/2026-06-18-script-engine.md`
- Phase A report: `.git/sdd/sprint14-script-engine-phase-a-report.md`
- Phase B report: `.git/sdd/sprint14-script-engine-phase-b-report.md`
- Phase C report: `.git/sdd/sprint14-script-engine-phase-c-report.md`
- Phase D report: `.git/sdd/sprint14-script-engine-phase-d-report.md`