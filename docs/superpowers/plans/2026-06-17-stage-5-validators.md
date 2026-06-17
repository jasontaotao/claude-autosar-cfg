# Stage 5.D — Validators + Fixture Slim

> **For agentic workers:** 本 plan 是 Sprint 13 master roadmap Stage 5 的子集 (5.D)，
> 只覆盖 validators + fixture slim，**不**包含 electron-builder 打包 (Stage 5.B) 或
> coverage ≥ 90% (Stage 5.C)。
>
> Master plan: `docs/superpowers/plans/2026-06-17-sprint-13-master-roadmap.md` § 5
>
> Design spec: `docs/superpowers/specs/2026-06-17-stage-5-validators-design.md`

## Goal

把 Sprint 12 backlog 的 4 个 validation 项 ship 出去：

1. `arxml:parse` IPC 加 32 MiB size cap
2. BSWMD `<DEFAULT-VALUE>` 跨 `<LITERALS>` 校验 (warning)
3. `<CHOICES>` 递归深度上限 (defensive)
4. `samples/arxml/` fixture 体积管理 (TODO 留待后续 / 不阻塞)

## 任务清单

- [ ] **Task 1 — RED: arxml:parse size cap test**
  - 加 test `parseArxmlHandler caps content at 32 MiB`
  - 期望：`{ ok: false, error: { kind: 'xml-malformed', message: /exceeds 32.*byte cap/ } }` (与 BSWMD 同样的 `xml-malformed` kind，复用 IPC envelope)
  - 同时加一个 exactly 32 MiB 边界 test (boundary inclusive)

- [ ] **Task 2 — GREEN: arxml:parse size cap implementation**
  - 在 `src/main/ipc/register.ts` 加 `ARXML_MAX_BYTES = 32 * 1024 * 1024`
  - 改 PARSE_ARXML handler：
    ```ts
    if (req.content.length > ARXML_MAX_BYTES) {
      return {
        ok: false,
        error: {
          kind: 'xml-malformed',
          message: `ARXML content exceeds ${ARXML_MAX_BYTES}-byte cap`,
        },
      };
    }
    return parseArxml(req.content);
    ```
  - 提取一个 `parseArxmlHandler(req)` 函数（与 `bswmdReadHandler.ts` 同样 pattern），保持 register.ts 干净
  - 5/5 baseline test 不应受影响 (现有 fixture < 100 KiB)

- [ ] **Task 3 — RED: default-value 跨 enumerationLiterals 校验 test**
  - 在 `src/core/project/__tests__/bswmd.test.ts` 加 test：
    - "emits a default-value warning when DEFAULT-VALUE is not in enumerationLiterals"
    - "does not emit a default-value warning when DEFAULT-VALUE is in enumerationLiterals"
    - "does not emit a default-value warning for non-enumeration params"
  - 期望：warning string 含 param path + DEFAULT-VALUE 字面值

- [ ] **Task 4 — GREEN: default-value 跨 enumerationLiterals 校验 implementation**
  - 在 `src/core/project/bswmd.ts` `buildParam` 末尾或之后，遍历所有 modules.containers.parameters 收集 warnings
  - 加一个 `validateDefaultValue(param, warnings)` 内部函数：
    - 仅当 `param.kind === 'enumeration'`
    - 仅当 `param.defaultValue !== null` (string) 且 `param.enumerationLiterals.length > 0`
    - 仅当 `!param.enumerationLiterals.includes(param.defaultValue)`
  - 写一个 `validateModuleDefaults(modules, warnings)` 顶层函数，递归 walk `subContainers` + `choices`
  - 在 `parseBswmd` 末尾调用 `validateModuleDefaults(modules, warnings)`
  - **decision**: warning（不 fatal）— 与 `unknown container kind` 一致（sprint 12 #1 设计选择）

- [ ] **Task 5 — RED: CHOICES 递归深度上限 test**
  - 在 `src/core/project/__tests__/bswmd.test.ts` 加 test：
    - "returns xml-malformed (or invalid-structure) when container nesting depth exceeds MAX_DEPTH (64)"
  - 构造一个 pathological fixture：64 层 `ECUC-PARAM-CONF-CONTAINER-DEF` 嵌套 `SUB-CONTAINERS`
  - 期望：返回 `{ ok: false, error: { kind: 'invalid-structure', message: /depth/i } }`

- [ ] **Task 6 — GREEN: CHOICES 递归深度上限 implementation**
  - 在 `src/core/project/bswmd.ts` 加 `const MAX_CONTAINER_DEPTH = 64`
  - 修改 `buildContainerList` 接受 `depth` 参数 (默认 0)
  - 在 `buildContainer` / `buildChoiceContainer` 中：
    - 当 `depth >= MAX_CONTAINER_DEPTH` 时返回一个 fatal `invalid-structure` BswmdError
    - 在 `buildContainerList` 末尾聚合 error（如果子项返回 error）
  - 现有真实 fixture (CanIf / EcuC / Pdu) 深度通常 < 10，不会受影响
  - **decision**: 64 是 generous 上限（真实 AUTOSAR schema 深度通常 < 20）

- [ ] **Task 7 — Verify 5/5 baseline**
  - `pnpm test` 全绿
  - `pnpm verify` type-check + lint + format-check 绿
  - `validateProject.fixtures.test.ts` cross-ref 782 signed-guard 保持 [700, 850]
  - ref-dest 0 / ref-cycle 0 / schema-unknown 0
  - coverage 保持 baseline (96.78% / 87.01% / 100%) — validators 走 happy path + 1-2 negative paths 即可

- [ ] **Task 8 — Commit + push**
  - `git add` 所有相关文件
  - commit: `feat(validators): size cap + default-value + CHOICES depth (Stage 5.D)`
  - push via `git -c http.proxy= -c https.proxy= push` (failure → sleep 30s retry)

## 范围外（明确不做）

- **fixture slim (Item #7)**：samples/arxml/ 9.2MB → git-lfs
  - **原因**：git-lfs 在 github.com connection-reset 环境上 push 不可靠
  - **范围**：在 plan 末尾留 TODO，Stage 5.D 完成后 Wave 4/5 单独处理
  - **现状**：samples/arxml 实际为空（0 bytes，仅 .gitkeep），不是 9.2MB — memory 的 9.2MB 数据已过时
  - **可观测**：ls samples/arxml/ → 只有 .gitkeep
- **electron-builder 打包**：Stage 5.B / Wave 4
- **coverage ≥ 90%**：Stage 5.C / Wave 3
- **version bump**：Wave 1 完成后由主 loop 统一 bump v0.15.1

## 风险

- **R1**：`MAX_CONTAINER_DEPTH = 64` 可能误伤某个真实 AUTOSAR 4.7+ 的深层 schema
  - 缓解：test 只针对 pathological case (64+ 层)；真实 fixture 远 < 64
- **R2**：default-value warning 可能让 `samples/bswmd/*.arxml` 中的 5 真实 fixture 触发 warning
  - 缓解：先跑一次 `pnpm test`，检查现有 fixture 是否有 DEFAULT-VALUE mismatch
  - 如果有，加 `_ = warnings;` 兼容或在 plan 内加 fixup task
- **R3**：push `Recv failure: Connection was reset` 仍可能
  - 缓解：保留 memory 的 unset proxy workaround + 30s retry

## 预估时间

- Task 1-2 (size cap): ~20 min (test + impl + verify)
- Task 3-4 (default-value): ~25 min (test 3 cases + impl + integration)
- Task 5-6 (CHOICES depth): ~25 min (test + impl)
- Task 7-8 (verify + commit + push): ~15 min
- **总计 ~85 min**

## Self-Review

- ✅ 4 个 master plan § 5 item 中 3 个实际完成，1 个 (fixture slim) 留 TODO 并记录原因
- ✅ TDD 流程：每个 item 都是 RED → GREEN → verify
- ✅ 5/5 baseline cross-ref 782 signed-guard 不受影响（现有 fixture 远 < 32 MiB，且 < 64 层）
- ✅ 不 bump version（主 loop 统一处理）
- ✅ 不动 electron-builder 配置 / coverage 推动 / 跨 Stage 文件
