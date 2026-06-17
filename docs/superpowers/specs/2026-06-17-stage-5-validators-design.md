# Stage 5.D — Validators + Fixture Slim Design Spec

> **For agentic workers:** 本 spec 是 `2026-06-17-stage-5-validators.md` 的设计文档。
> 详细 implementation 步骤见 plan。
>
> Master plan: `docs/superpowers/plans/2026-06-17-sprint-13-master-roadmap.md` § 5

## Overview

4 个 validators 增强 + 1 个 fixture 体积管理 TODO，4 个 validators 全部 ship，fixture slim 留 TODO。

## Architecture

### 1. arxml:parse size cap (Item #1)

**问题**：`PARSE_ARXML` IPC handler 当前直接 `parseArxml(req.content)`，没有 size cap。
恶意 / 意外 payload 可以 OOM main process。

**Solution**：

| 层           | 文件                                             | 改动                                                                       |
| ------------ | ------------------------------------------------ | -------------------------------------------------------------------------- |
| Constant     | `src/main/ipc/register.ts`                       | 加 `ARXML_MAX_BYTES = 32 * 1024 * 1024`                                    |
| Handler      | 提取 `src/main/ipc/parseArxmlHandler.ts`         | 加 cap check + 调用 `parseArxml`                                           |
| Registration | `src/main/ipc/register.ts`                       | 用 `parseArxmlHandler(req)` 替换 inline call                               |
| Test         | `src/main/ipc/__tests__/parseArxml.test.ts` (新) | 6 case：happy / cap exceeded / boundary / +1 byte / -1 byte / exact 32 MiB |

**Rationale for `xml-malformed` kind reuse**：

- BSWMD cap 已用 `xml-malformed` (见 `register.ts:307`)
- 避免新增 `kind` 触达 IPC envelope
- Renderer 端 i18n 已经有 `xml-malformed` 文案

**Rationale for 32 MiB**：

- 与 `BSWMD_MAX_BYTES` 一致
- 覆盖 AUTOSAR standard master BSWMD (~12 MiB at R4.2.2)
- 真实 ARXML fixtures (CanIf / EcuC / Pdu) 远 < 1 MiB

**Rationale for extracting handler**：

- 与 `bswmdReadHandler.ts` 同样 pattern (Sprint 12 #2)
- 直接 testability（不需 mock ipcMain）
- register.ts 保持 thin

### 2. default-value 跨 enumerationLiterals 校验 (Item #2)

**问题**：BSWMD 中的 `<DEFAULT-VALUE>` 不在 `<LITERALS>` 时不报错。
例如 vendor 写 `<DEFAULT-VALUE>FOO</DEFAULT-VALUE>` 但 LITERALS 只有 `['BAR', 'BAZ']`，
应该发 warning。

**Solution**：

| 层              | 文件                                                                                                         | 改动                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| ParamDef type   | `src/core/project/bswmd.ts`                                                                                  | 不变（`defaultValue: string \| number \| boolean \| null`）        |
| Validator       | `src/core/project/bswmd.ts`                                                                                  | 加 `validateModuleDefaults(modules, warnings)`                     |
| Walk            | `walkContainerDefaults(container, warnings, depth=0)`                                                        | 递归 walk `subContainers` + `choices`                              |
| Per-param check | `param.kind === 'enumeration' && param.defaultValue !== null && !enumerationLiterals.includes(defaultValue)` | emit warning                                                       |
| Integration     | `parseBswmd()` 末尾                                                                                          | `validateModuleDefaults(modules, warnings)`                        |
| Test            | `src/core/project/__tests__/bswmd.test.ts`                                                                   | 3 case：warn on mismatch / no-warn on match / no-warn for non-enum |

**Warning format**：

```
DEFAULT-VALUE 'FOO' for enumeration param '/EcucDefs/Foo/Bar' is not in declared literals [BAR, BAZ]
```

**Severity：warning（不 fatal）**

- 原因 1：与现有 `unknown container kind` warning 一致（sprint 12 #1 设计）
- 原因 2：vendor tool 写错 default 但 schema 仍然 readable
- 原因 3：避免 reject 真实 vendor BSWMD（避免 false negative）

### 3. `<CHOICES>` 递归深度上限 (Item #3)

**问题**：`buildContainer` / `buildChoiceContainer` / `buildContainerList` 互相递归调用没有 depth limit。
恶意 / 病理 (pathological) BSWMD 可以 stack overflow main process。

**Solution**：

| 层                                        | 文件                                       | 改动                                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Constant                                  | `src/core/project/bswmd.ts`                | 加 `MAX_CONTAINER_DEPTH = 64`                                                                                                                                   |
| `buildContainerList`                      | `src/core/project/bswmd.ts`                | 加 `depth: number = 0` 参数；当 `depth >= MAX_CONTAINER_DEPTH` 返回 `[null, 'invalid-structure']` 标记                                                          |
| `buildContainer` / `buildChoiceContainer` | `src/core/project/bswmd.ts`                | 接受 `depth` 参数并 forward                                                                                                                                     |
| 集成                                      | `parseBswmd()`                             | 检查 `buildContainerList` 返回的 error signal → 返回 `{ ok: false, error: { kind: 'invalid-structure', path, message: 'Container nesting depth exceeds 64' } }` |
| Test                                      | `src/core/project/__tests__/bswmd.test.ts` | 构造 64 层 nested fixture                                                                                                                                       |

**Rationale for 64**：

- 真实 AUTOSAR schema (R4.x / R19-11 / R20-11) 容器深度 < 20
- 64 是 generous 上限，留 3-4x headroom
- 远低于 Node.js 默认 stack limit (~10000 frames) — 64 层不够触发 SO，但足以 catch pathological input

**Rationale for fatal `invalid-structure`**：

- 与 `<BSW-MODULE-DESCRIPTION> missing <SHORT-NAME>` 一致 (见 `bswmd.ts:401`)
- Depth limit 是 binary "schema unparseable" decision — 不可 warn-and-continue（partial schema 没有 semantics）
- User 必须 fix vendor file

### 4. fixture slim (Item #4) — **TODO 留待后续**

**现状**：

- `samples/arxml/` 实际**为空** (0 bytes，仅 `.gitkeep`)
- Memory 记录的 9.2MB 数据**已过时** — Sprint 12/13 重构期间清理过
- 真实 ARXML fixtures 在 `tests/fixtures/` (git-lfs already?)

**Action**：

- **本 Stage 不做** — 写 TODO 记录于 plan / memory
- Stage 5.D 完成后报告：`fixture slim: TODO 留待 Wave 4/5`
- Wave 4/5 单独处理时重新评估 samples/ 状态

## Cross-cutting concerns

### TDD workflow

每个 task 严格 RED → GREEN → verify：

1. 写 test（RED — fail）
2. 写 minimal implementation（GREEN — pass）
3. refactor / improve（VERIFY — 仍 pass）
4. 跑 `pnpm test` 确认 5/5 baseline 仍绿

### Backward compatibility

- 现有 5 baseline ARXML fixtures (EcuC / Pdu / CanIf 等) 远 < 32 MiB → size cap 不影响
- 现有 5 baseline BSWMD fixtures 容器深度 < 10 → depth limit 不影响
- 现有 fixtures 没有 enumeration default-value mismatch → warning 不影响

### i18n

- size cap error message 用英文（与 BSWMD 一致）
- i18n key 不在本 Stage 范围（Stage 4 i18n polish 已处理 — 见 `stage-4-i18n-polish.md`）

### Versioning

- **不 bump version** — Wave 1 结束后主 loop 统一 bump v0.15.1
- CHANGELOG 暂不更新（Wave 1 结束后一起 update）

## File inventory

| 文件                                                             | 类型     | 行数估计                                   |
| ---------------------------------------------------------------- | -------- | ------------------------------------------ |
| `src/main/ipc/parseArxmlHandler.ts`                              | NEW      | ~40                                        |
| `src/main/ipc/register.ts`                                       | MODIFIED | +20 / -5                                   |
| `src/main/ipc/__tests__/parseArxml.test.ts`                      | NEW      | ~100                                       |
| `src/core/project/bswmd.ts`                                      | MODIFIED | +60 (validate + depth limit)               |
| `src/core/project/__tests__/bswmd.test.ts`                       | MODIFIED | +80 (3 default-value cases + 1 depth case) |
| `docs/superpowers/plans/2026-06-17-stage-5-validators.md`        | NEW      | 150                                        |
| `docs/superpowers/specs/2026-06-17-stage-5-validators-design.md` | NEW      | (this file)                                |

**Total**：2 new source files + 4 modified files + 1 new plan + 1 new spec

## Test inventory

| Test                                                                           | File               | Purpose            |
| ------------------------------------------------------------------------------ | ------------------ | ------------------ |
| `parseArxmlHandler returns ok for content under cap`                           | parseArxml.test.ts | happy path         |
| `parseArxmlHandler returns xml-malformed for content over 32 MiB`              | parseArxml.test.ts | cap exceeded       |
| `parseArxmlHandler returns ok at exactly 32 MiB boundary`                      | parseArxml.test.ts | boundary inclusive |
| `parseBswmd emits default-value warning when DEFAULT-VALUE is not in LITERALS` | bswmd.test.ts      | enum mismatch      |
| `parseBswmd does not warn when DEFAULT-VALUE is in LITERALS`                   | bswmd.test.ts      | enum match         |
| `parseBswmd does not warn for non-enumeration params`                          | bswmd.test.ts      | non-enum skip      |
| `parseBswmd returns invalid-structure when container depth exceeds 64`         | bswmd.test.ts      | depth limit        |

**Test count delta**：+7 tests (3 size cap + 3 default-value + 1 depth)

## Risks

| ID  | Risk                                            | Likelihood | Impact | Mitigation                                                                                 |
| --- | ----------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------ |
| R1  | Existing fixture triggers default-value warning | Low        | Low    | Run baseline test first; if triggers, add fixup task to update fixture or adjust validator |
| R2  | Real AUTOSAR 4.7+ schema > 64 depth             | Very Low   | Med    | Generous cap; 64 vs typical < 20                                                           |
| R3  | Push `Recv failure: Connection was reset`       | Med        | Low    | Unset proxy + 30s retry (memory workaround)                                                |
| R4  | 5/5 baseline test (cross-ref 782) changes       | Very Low   | High   | Pure additive changes; no existing schema lookup altered                                   |

## Out of scope (explicit)

- electron-builder 打包配置 (Stage 5.B / Wave 4)
- coverage ≥ 90% (Stage 5.C / Wave 3)
- i18n key addition (Stage 4 已 ship)
- version bump (主 loop)
- `samples/arxml/` fixture slim (留 TODO; memory 数据过时)
