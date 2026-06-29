# v1.16.0 Release Notes (2026-06-29) — MINOR

**Layering Hardening (C12 from joint review)**

See [CHANGELOG](../../CHANGELOG.md#v1160-2026-06-29--minor) for the headline.

## 关键决策

- **共享类型 re-export 而非整体移动** — `src/main/script/types.ts` 9 个类型 shape 保留原位（main 侧仍用相对路径），renderer 侧通过 `src/shared/script/types.ts` 的 `export type { ... } from '../../main/script/types.js'` 访问。TypeScript 编译时完全擦除，0 运行时成本。
- **path alias 阻断需要显式列出** — `no-restricted-imports` 默认按字符串字面量匹配，path alias `@main` 不会命中现有的 `'electron'` 包名检查。修复：rule `paths` 加 `{ name: '@main', message: '...' }`。
- **`@core/*` 跨层保留为允许** — Joint review 把 144 处 `renderer→@core/*` 也列为违规，verify 复核后实际不违规：`core/` 是纯 TS（README 明文 "core/ 允许依赖：无（纯 TS）"），renderer 可依赖。**只有 `@main/*` reverse 是硬违规**（11 处 type-only → 0 处）。
- **C9 单线 ESLint rule，不重构 144 处 core import** — 范围内只解决 main reverse（11 处），core reverse 留作未来 audit 区分项。

## 推迟到 v1.17.0 MINOR（5 项 carry-over）

- C8 MULTIPLICITY-CONFIG-CLASSES 校验消费
- C9 `<DERIVED-FROM>` classifier
- C10 FOREIGN-REFERENCE-DEF dest 跨方言保留
- C11 `<MODULE-REF>` in ECUC-DEFINITION-COLLECTION 恢复
- C13 AppHeader / useProjectActions 文件拆分

C12 已关闭（C12 = 分层 ESLint 守门，本 release 解决）。

## 流程教训（PKM 永久）

1. **Path alias 是 ESLint 盲区** — `no-restricted-imports` 按字符串匹配；Vite 的 `@main/*` 别名在 ESLint 不解 alias。需要显式列出 `@main` 字面量（无尾部斜杠）作为 rule name。
2. **Architect 误判 vs 实际分层契约** — `core/` 纯 TS 性质让 `renderer→@core/*` 144 处是合法的（README 分层表明确）。审计时按 README 字面验证而非凭直觉。
3. **Type-only re-export 是 0 成本跨层桥** — 不增加 bundle size，不增加运行时依赖；仅做类型契约的传递层。
4. **git smart-HTTP endpoint 不稳定但 curl 通** — 同网络下 `curl https://github.com/.../info/refs?service=git-upload-pack` 200 OK，但 `git push` 走 smart-HTTP 协议时会被 TCP SYN 21s timeout 阻断。Network flake 模式与 peakcan-host v1.15.5 ship 时相同（曾 21s timeout 后自愈）。

## Ship Method (executed 2026-06-29)

1. `git checkout -b feature/v1-16-0-minor` (from main @ e69753c)
2. 实施 + `pnpm verify` 7-stage 全绿
3. `git commit -m "feat(architecture): v1.16.0 ..."` → SHA `2342611`
4. `git push -u origin feature/v1-16-0-minor` (前 3 次 21s timeout，第 4 次自愈)
5. `gh pr create --base main` → PR #18
6. `gh pr merge 18 --squash --delete-branch` → squash SHA `6137cb1`
7. `git checkout main` + `git reset --hard origin/main`
8. `git tag v1.16.0` + push
9. `gh release create v1.16.5` — pending (本文件就是 release notes)

## 测试基线

- v1.15.5: 2504 pass + 2 SKIP
- v1.16.0: **259 pass + 1 SKIP** (单元 + 集成合计；refactor-only 无新增 test)
- pnpm verify 7-stage 全绿