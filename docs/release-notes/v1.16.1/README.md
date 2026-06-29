# v1.16.1 Release Notes (2026-06-30) — PATCH

**Script-handler async writeAtomic (FIO-1 from v1.15.5 surface observations)**

See [CHANGELOG](../../CHANGELOG.md#v1161-2026-06-30--patch) for the headline.

## 命名说明 (Naming note)

本 PATCH 在内部规划文档（plan / spec / branch name `feature/v1-15-6-patch` / devlog）全程以 **v1.15.6** 标识，但严格 semver 下，v1.16.0 MINOR 之后的第一个 PATCH 必须是 `1.16.1`（"v1.15.x PATCH 在 v1.16.0 MINOR 之后"会误导下游依赖消费者）。外部 tag、CHANGELOG、release-notes、GH release 全部以 **v1.16.1** 为准；内部 plan/spec 文件保留 v1.15.6 字样作为历史记录（与 commit message 一致：内部 commit `ebdd398 → e504bf9` 仍以 v1.15.6 标识）。

下一 PATCH 序列继续 v1.16.x：v1.16.2 → v1.16.3 ...

## 关键决策

- **`writeAtomic` 覆盖审计必须含 `await fs.writeFile` 调用方** — v1.15.5 C1 的 grep 只针对 sync `writeFileSync`，漏掉了 `stencilSaveHandler.ts:97` 这种用 `await fs.writeFile` 的 raw 写。完整 PATCH 的 audit grep 应该是 `(writeFile|writeFileSync)\(` 对 `src/main/`（排除 writeAtomic helper 自身）。FIO-2 在 v1.17.0 Gate A 联合复审时被挖出。
- **sync → async 转换要检查传递调用方** — `writeCurrentManifest` 是 sync；转 async 时它调用的 `loadCurrentManifest` 也得变 async（否则 await 不能用），进而 4 个上层 handler 全要更新。blast radius 实际是 2 层而非 1 层。pre-implementation 阶段必须 grep direct + transitive callers。
- **TypeScript strict mode 立刻捕获 sync→async 漏改** — `tsc --noEmit` 在测试跑之前就报 `readFileSync is not defined`。机械 fix 加 `await` 即可。教训：**sync→async 转换后先跑 `tsc` 再跑 `vitest`**，类型检查器是最快的反馈回路。
- **eslint import/order 在 import 编辑后必须重跑** — 写 import 时把 `writeAtomic` 放在 `errors` 和 `import-resolver` 之间，但 `import/order` 要求 `../io/*` 在 `../script/*` 之前。教训：edit 完 import 立即跑 eslint，不要等 commit 才发现。
- **PATCH 范畴内的"surface observation"可以单独 ship 为 PATCH** — 本次 v1.16.1 原本属于 v1.15.5 release notes "3 surface observations to revisit in v1.17.0" 的 item (1)，v1.17.0 plan Gate D 显式允许"scope 干净就升级为单独 PATCH"。单条 follow-up + 无跨文件影响 = PATCH 形状，即使原计划是 MINOR-defer。
- **v1.16.0 commit (e504bf9 + amend) build 断裂原因** — `node:fs/promises` 没在 `vite.main.config.ts` externals 列表里。修复：加 `'node:fs/promises'` 到 externals（与 `'node:fs'` 并列）。这是 code-review 漏掉的 fix（reviewer 没跑 `pnpm verify`），verify 7-stage gate 在 ship 前捕获。**教训：code-review checklist 必须含 `pnpm verify green`，单看 review verdict 不够。**

## v1.16.1 范围（1 item from v1.15.5 surface observation #1）

| ID | Severity | Title | Files |
|----|----------|-------|-------|
| **FIO-1** | MEDIUM (latent) | `script-handler.ts:133` sync `writeFileSync` for script-engine manifest migrated to async + `writeAtomic` | `src/main/ipc/script-handler.ts` (production) + `src/main/ipc/__tests__/script-handler.test.ts` (test) + `vite.main.config.ts` (build) |

### Production changes (`src/main/ipc/script-handler.ts`)

- **Imports**: `readFileSync, writeFileSync` from `node:fs` → `readFile` from `node:fs/promises` + new `writeAtomic` from `../io/writeAtomic.js`
- **`loadCurrentManifest()`** → async (`Promise<LoadedManifest>`); uses `await readFile(...)`
- **`writeCurrentManifest(scripts)`** → async (`Promise<void>`); uses `await writeAtomic(...)`
- **4 callers updated** to `await loadCurrentManifest()`: `scriptListHandler`, `scriptSaveHandler`, `scriptDeleteHandler`, `scriptRunHandler`
- **3 callers updated** to `await writeCurrentManifest(...)`: lines 214, 234, 243
- **New comment block** on `writeCurrentManifest` documenting v1.16.1 rationale + scope qualifier (FIO-2 `stencilSaveHandler.ts:97` still non-atomic; was added during code-review MEDIUM #2 resolution)

### Test changes (`src/main/ipc/__tests__/script-handler.test.ts`)

- Added `readdirSync` import
- **New top-level `describe('v1.16.1 PATCH — atomic write invariant')` block** with 1 test: "save + update + delete leaves no .tmp-* leftovers in the project dir"

### Build fix (`vite.main.config.ts`)

- Added `'node:fs/promises'` to `rollupOptions.external` (alongside existing `'node:fs'`)
- Multi-line array format for readability
- Updated comment block explaining why `node:fs/promises` must be externalized (same fs implementation as `node:fs`, promise-namespaced view)

## Code-review verdict (whole-commit)

Code-reviewer: **0C / 0H / 2M / 3L / 3N**. Both MEDIUM addressed before ship:

1. **MEDIUM #1 — Test scope confusion**: original test lived inside `describe('script:run handler...')` block, suggesting it tested `scriptRunHandler` specifically when it actually exercised save/update/delete flow. **Fix**: moved test out into dedicated top-level `describe('v1.16.1 PATCH — atomic write invariant')` block.
2. **MEDIUM #2 — Inaccurate comment**: original comment claimed "last sync write site in src/main/" — this is wrong because `stencilSaveHandler.ts:97` still uses raw `fs.writeFile` (NOT `writeAtomic`). **Fix**: comment qualified to "script-engine manifest path" + explicit reference to FIO-2 follow-up.

(Additional **MEDIUM surfaced post-review**: code-reviewer did not run `pnpm verify`, missing the build break. Captured as process lesson #6 above. Test file also had 1-line prettier nit — auto-fixed and amended into commit.)

## 推迟 (deferred to v1.17.0 MINOR 或后续)

- **FIO-2** — `stencilSaveHandler.ts:97` 仍用 raw `await fs.writeFile`（未迁移到 `writeAtomic`）。v1.15.5 C1 的 grep 仅针对 `writeFileSync` sync 形态，遗漏了 async 的 raw 写。**v1.16.1 不修**（超出 scope），下推到 v1.17.0 MINOR 或独立 v1.16.2 PATCH（由用户决定）。`writeCurrentManifest` 上的注释显式 cross-reference FIO-2，未来 grep 不会再撞同样的 gap。
- **v1.16.1 ship-phase 发现的本地 tag 卫生问题**（独立于本 PATCH scope，留作 hygiene task）：
  - 本地 tag `v1.15.1` 错位指向 `17a4192`（v1.15.0 的 commit），应指向 `2223e83`
  - 本地缺失 `v1.15.2/3/4` tags（远程存在，fetch 时被本地错位 clash 阻断）
  - `docs/release-notes-v1.15.3.md` 是 untracked（v1.15.3 ship-bug：release notes 写了但没 commit）

## Ship Method (待执行)

1. 分支 `feature/v1-15-6-patch`（内部命名，外部 tag = v1.16.1）
2. 1 commit `fix(main): script-handler async writeAtomic (v1.15.6 PATCH)` (内部 SHA `ebdd398` → 经 format fix amend 后 `e504bf9`；ship 前再加 build fix + release artifacts 后 SHA 会变)
3. `pnpm verify` 7-stage 全绿（含 build stage — fix 后）
4. `git push -u origin feature/v1-15-6-patch`（带 `git -c http.proxy="" -c https.proxy=""` proxy bypass；fallback `gh api` 路径）
5. `gh pr create --base main` → PR #19
6. `gh pr merge 19 --squash --delete-branch` → squash SHA
7. `git checkout main` + `git reset --hard origin/main`
8. `git tag v1.16.1 <squash-SHA>` + push
9. `gh release create v1.16.1 --notes-file docs/release-notes/v1.16.1/README.md --target <squash-SHA>`

## 测试基线

- v1.16.0: 259 + 1 SKIP (verify 阶段 unit + integration 合计)
- v1.16.1 (e504bf9 amend 前): 2505 + 2 SKIP + 0 fail (+1 net: 新增 atomic write invariant test)
- v1.16.1 (ship 时): 2505 + 2 SKIP + 0 fail（无新增 test，仅 build fix + release artifacts）
- pnpm verify 7-stage: format ✓ / lint ✓ / type-check ✓ / test ✓ / **build ✓ (新)** / smoke ✓