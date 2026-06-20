## v1.4.1 + v1.4.2 — Project-load PATCH series

两次 PATCH 一起发（v1.4.1 = 4-bug fix, v1.4.2 = 2 个 P0 项目加载 fix），加在 v1.4.0 Trust Sprint 之后。**用户场景**：在 `C:\Users\13777\Desktop\ClaudeAutosarWorkSpace\test1.autosarcfg.json` 上加载 BSWMD + ECUC pair，tree 上右键 `JWQ3399 / JWQ3399ConfigSet / JWQ3399SpiConfig` 加 parameter — 这一连串操作在 v1.4.0 上要么 chip 永远 0/0、要么 picker 走不通、要么 reload project 后 schema 没了。v1.4.1 + v1.4.2 + v1.5.0 (见 release-notes-v1.5.0.md) 三连击解决了这一切。

### v1.4.1 — 4-bug fix batch (commit `ed3b53a`)

**真实 vendor fixture `JWQ3399_bswmd.arxml` + `JWQ3399_EcucValues.arxml` 触发的 4 个 P0 bug**：

#### Bug 1 — BSWMD `<MULTIPLICITY-CONFIG-CLASSES>` 解析器静默丢弃

**Symptom**: 用户 BSWMD 文件包含 `<MULTIPLICITY-CONFIG-CLASSES> > <ECUC-MULTIPLICITY-CONFIGURATION-CLASS> > <CONFIG-CLASS>` 块，但 skeleton 生成时这些约束完全丢失。

**Root cause**: `src/core/project/bswmd.ts` 解析器从来没读这个块。`ContainerDef` / `BswModuleDef` interface 也没字段。

**Fix**: 
- 新增 `MultiplicityConfigClass` interface
- `ContainerDef` / `BswModuleDef` 加 `multiplicityConfigClasses?: readonly MultiplicityConfigClass[]` 可选字段
- 新增 `readMultiplicityConfigClasses()` helper
- Picker dialog 合成 fallback：`moduleDef.multiplicityConfigClasses ?? []`

#### Bug 2a — skeleton 用错 tagName

**Symptom**: skeleton 写盘时 emit `<ECUC-CONFIGURATION-CONTAINER>`（schema-side）但 `addContainer` + serializer 写 `<ECUC-CONTAINER-VALUE>`（value-side）— 两套 tag 不一致，skeleton 文件用 EB tresos / Vector 工具读会错。

**Fix**: `skeleton.ts` `buildTopContainer` + `buildSubContainerShell` 改用 `tagName: 'ECUC-CONTAINER-VALUE'`。

#### Bug 2b — skeleton 为 `lower=0` 容器预建空 shell

**Symptom**: `buildSubContainerShell` 之前不管 `lowerMultiplicity` 都 emit 一个空 container，留下一堆 ghost placeholders。

**Fix**: 改返回 `ArxmlContainer[]`（之前单个），只在 `lowerMultiplicity > 0` 时 emit shell。Top-level children 用 `flatMap` 收口空数组。AUTOSAR 惯例：skeleton 预建 minimum 1 instance，剩下的用户用 picker 加。

**Why exact 1 (not `lower`) shells**: 跟 AUTOSAR convention 一致 — skeleton 给 minimum，用户自己加剩下的。

#### Bug 2c — `findByPath` 只接 4-segment path

**Symptom**: 用户报"无法在 `JWQ3399AFECellValidSet` 加 parameter"。用户 UI 发的是 compressed 3-segment `/JWQ3399/JWQ3399ConfigSet/JWQ3399AFECellValidSet`（当 `pkg.shortName === module.shortName` 时省 module 段），但 core 假设 canonical 4-segment `/JWQ3399/JWQ3399/JWQ3399ConfigSet/JWQ3399AFECellValidSet`。

**Constraint**: 用户明确说"无法实现4段" — UI 不能 emit 4-segment，fix 必须在 core。

**Fix**: 
- `src/core/arxml/path.ts` `findByPath` 加 3-segment fallback：先试 canonical 4-segment，失败时 iterate `pkg.elements` 找 module 短名 + 第一个子容器 shortName 匹配 `rest[0]`
- 提取共享 `walkFrom` helper
- `src/core/arxml/mutation.ts` `locateParent` 现在委托 `findByPath`
- `src/renderer/components/BswmdPickerDialog.tsx` `locateParentElement` 也委托 `findByPath`

#### Code review findings (APPROVE_WITH_MEDIUM, 0 C / 0 H / 2 M / 2 L)

- **MEDIUM 1**: 3-segment fallback 在 multiple modules in same pkg 时静默 first-wins（找第一个 child 匹配 rest[0] 的 module）。**Dormant in current fixtures** — AUTOSAR convention 每个 module 放自己 pkg 下。
- **MEDIUM 2**: `replaceElement` / `removeElement` 用 `kind + shortName` identity match，not pkg-scoped。Compounds M1。**Dormant.**
- **LOW 1**: `multiplicityConfigClasses` optional type vs `buildEbModule` 永远 emit `[]` 的 cosmetic 不一致。
- **LOW 2**: pre-existing `appendChild` 永远 replace parent identity even when no actual change（不是 v1.4.1 引入）。

### v1.4.2 — Project-load P0 patches (commit `4ba5ec4`)

v1.4.1 修了 Picker 端 path 形态，但**项目加载层还有两个 P0 没修**：

#### P0-1 — ProjectPanel chip 永远 0/0、+ 按钮永远 disabled

**Symptom**: 用户加载 BSWMD 后，左侧 ProjectPanel BSWMD row 的 chip 显示 `📋 0/0` 而不是真实 module 数；`+` 按钮永远 disabled 不能 click 弹 picker。

**Root cause** (`src/renderer/components/ProjectPanel.tsx:265`):

```ts
const storeIdx = bswmdPathsInStore.indexOf(bswmdPath);
```

`bswmdPath` 来自 `manifest.bswmdPaths`（manifest 里**相对 forward-slash** 路径如 `bswmd/JWQ3399_bswmd.arxml`），但 `bswmdPathsInStore` 来自 `state.bswmdPaths`（**绝对 backslash** 路径如 `C:\Users\13777\Desktop\ClaudeAutosarWorkSpace\bswmd\JWQ3399_bswmd.arxml`）。`indexOf` 严格字符串比较 → 三项里没有一项相同 → 永不命中 → schema 永远 undefined → chip 永远 0/0。

**Fix**:
- `src/shared/path.ts` 新增 `bswmdKeyFor(path: string): string` helper — 小写 + `\` → `/` + 取最后 2 段（保证同 subdir 内的同 basename 不冲突）
- `ProjectPanel.tsx` 用 `useMemo` 派生 `bswmdKeyToSchema: Map<bswmdKey, BswmdDocument>`，renderTrailing 改 `bswmdKeyToSchema.get(bswmdKeyFor(bswmdPath))` O(1) 查询
- `ModuleFromBswmdPicker.tsx` 同步改同样的 key map

#### P0-2 — `openProject` 静默丢弃 IPC `bswmds` 字段

**Symptom**: 用户重新打开已有 project（之前手动 add 过 BSWMD 那种），store 里 `bswmdSchemas` 永远空。Picker 拿不到 module 列表 → 0 行。

**Root cause** (`src/renderer/store/useArxmlStore.ts:953-1011`):

```ts
openProject: ({ manifestPath, manifest, docs }) => { ... }
//                                                 ↑ 缺 bswmds 字段
```

main 进程 IPC `project:open` handler (`src/main/ipc/register.ts:261-278`) 实际返回 `{ manifest, docs, bswmds: { rel, path, content }[] }`，**但 renderer `openProject` 签名不收 bswmds 字段**，TypeScript 类型把 bswmds 静默丢弃，循环 `parseBswmd` push 到 store 这步永远不发生。

**Fix**:
- `useArxmlStore.openProject` 签名扩 `bswmds?: readonly { rel: string; path: string; content: string }[]`
- 循环 parse 每个 bswmd entry，push 到 `bswmdSchemas` / `bswmdPaths`（用 `entry.path` 绝对路径，跟 dialog 加的形态一致）
- 失败的走 `t(locale, 'app.error.parseBswmdFailed', { message })` 错误模板 + 跳过坏 entry（best-effort）
- **先清空现有 `bswmdSchemas` / `bswmdPaths`** 避免上一个 project 的 schema leak 进来
- `useProjectActions.openProjectFromDialog` 转发 `result.bswmds` 给 openProject

### Verification (v1.4.1 + v1.4.2 合并)

- 1537 tests pass (v1.4.1 baseline) → 1557 tests pass (v1.4.2 + 18 new + 2 round-trip drift)
- 0 type errors
- 0 lint errors after `pnpm lint --fix` (5 pre-existing import/order errors caught + fixed in `cae3d74` chore commit)
- pnpm build success
- Code reviewer APPROVE_WITH_MINOR (0 C / 0 H / 1 M / 5 L)
  - MEDIUM-1 (z-index 撞车): fixed in v1.5.0 commit
  - LOW 1-5: cosmetic / coverage gap follow-ups

### Files touched

```
ed3b53a fix(v1.4.1): BSWMD MCC parser + skeleton tag + 3-segment path walker
  src/core/arxml/mutation.ts                                          | 49 ±
  src/core/arxml/path.ts                                              | 52 +
  src/core/arxml/skeleton.ts                                          | 44 ±
  src/core/project/bswmd.ts                                           | 68 +
  src/renderer/components/BswmdPickerDialog.tsx                       | 56 ±
  src/core/arxml/__tests__/skeleton.test.ts                           | 7 ±
  src/core/ecuc/__tests__/moduleMatch.test.ts                         | 1 +
  src/core/validation/__tests__/runtimeSchema.test.ts                  | 2 +
  src/core/validation/__tests__/validate.test.ts                      | 2 +
  src/core/validation/__tests__/validateProject.canifSmoke.test.ts    | 2 +
  src/core/validation/__tests__/validateProject.schemaLayer.test.ts   | 2 +
  src/core/arxml/__tests__/bug-bswmd-multicity-and-addchild.test.ts   | 69 + (new)
  src/core/arxml/__tests__/bug2-skeleton-roundtrip.test.ts            | 174 + (new)
  package.json 1.4.0 → 1.4.1

4ba5ec4 fix(v1.4.2): BSWMD chip 0/0 + openProject drop bswmds (P0-1 + P0-2)
  src/shared/path.ts                                                  | 34 + (bswmdKeyFor)
  src/shared/__tests__/path.test.ts                                   | 61 + (9 bswmdKeyFor tests)
  src/renderer/store/useArxmlStore.ts                                 | 72 ±
  src/renderer/store/__tests__/useArxmlStore.openProject-bswmd.test.ts| 228 + (new, 5 tests)
  src/renderer/components/ProjectPanel.tsx                            | 35 ±
  src/renderer/components/ModuleFromBswmdPicker.tsx                   | 36 ±
  src/renderer/components/__tests__/ProjectPanel.path-normalize.test.tsx| 187 + (new, 4 tests)
  src/renderer/hooks/useProjectActions.ts                             | 6 + (forward bswmds)
  package.json 1.4.1 → 1.4.2

cae3d74 chore: fix import/order in v1.4.1 bug-repro tests
  src/core/arxml/__tests__/bug-bswmd-multicity-and-addchild.test.ts   | 4 ±
  src/core/arxml/__tests__/bug2-skeleton-roundtrip.test.ts            | 6 ±
```

### Verification on user's JWQ3399 fixture

End-to-end:
1. Open `C:\Users\13777\Desktop\ClaudeAutosarWorkSpace\test1.autosarcfg.json` → chip 跳到 `📋 1/1`（JWQ3399 那个 module），`+` 按钮 enabled
2. Click `+` → `ModuleFromBswmdPicker` 弹，JWQ3399 预勾选
3. Confirm → `ecuc/JWQ3399_EcucValues_EcucValues.arxml` 写入（但因为 ECUC file 已存在 — 走 round-trip 不重写）
4. Close project → reopen → BSWMD schema 仍在 store（v1.4.2 P0-2 修复）

Sprint 14 ECUC 选 module → addContainer / addParameter / addReference 走 `BswmdPickerRoot` + `BswmdPickerDialog` 端到端 (v1.5.0 wiring + v1.4.1 picker 修复合力)。

### Limitations (deliberate, deferred to v1.5.1+)

- **MEDIUM 1 + 2 from v1.4.1** dormant unless vendor data violates AUTOSAR module-pkg convention
- **`removeReference` store action** still missing (X2 falls back to setInfo toast with i18n `mutation.action.deleteReferenceNotImplemented`)

### Out of scope (deferred with reason)

- **Sprint 14 #2 — real mutation replay pipeline** (applyMutation stub left from v1.3.0)
- **`isPathInside(manifestDir)` containment** — same as v1.4.0
- **Symlink bypass** — same as v1.4.0
- **v1.4.0 trust sprint follow-ups H1-H10** — same as v1.4.0
