# BSWMD→ECUC Skeleton: Default-Value Fill + `<proj>/ecuc/` Subfolder

**Status**: PENDING USER REVIEW (brainstorming approved 2026-06-18)
**Date**: 2026-06-18
**Author**: brainstorming skill (claude-AutosarCfg post-v1.0.0)
**Parent**: [[2026-06-18-bswmd-to-ecuc-design]] (Sprint 14 — ship the picker)
**Supersedes**: —
**Sprint**: post-v1.0.0 fix-up track (HEAD `01c7135` on `feature/post-v1.0.0-wip`)

## Problem

After Sprint 14 shipped the BSWMD→ECUC picker, users (and the author)
discovered two concrete usability gaps:

1. **No default values in generated skeleton.** `core/arxml/skeleton.ts`
   emits `params: {}` for every container. The user opens the editor and
   sees an empty parameter list — nothing to read or edit. The BSWMD
   parser already extracts `defaultValue` per `ParamDef`; the skeleton
   generator simply ignores it.

2. **Newly created ECUC cannot be operated on.** Symptom: the file
   appears in the Tree, but neither the existing parameter values are
   editable (because there are none) nor can the user click "+ Add
   Parameter" on a container to add a new one. The "+ Add Parameter"
   button in `ParamEditor` is gated by `hasBswmdForModule`, which fails
   for files created via the picker (the gate doesn't look at
   `sourceBswmdPath`).

3. **File path is awkward.** New ECUC files land at `<proj>/<Module>_Cfg.arxml`
   (project root). Noisy for projects that will eventually hold many
   generated files.

## Goal

Three concrete outcomes from one user action (BSWMD picker → confirm):

- G1. The generated ECUC contains every parameter declared at the BSWMD
  module's top-level containers, pre-filled with the BSWMD-defined
  `defaultValue` (mapped through `ParamKind → ParamValue.type`).
- G2. The user can immediately click "+ Add Parameter" on any container
  in the new ECUC and successfully add a parameter from the BSWMD schema.
- G3. All newly generated ECUC files land under `<proj>/ecuc/`.

## Non-Goals

- Filling default values into **sub-containers** (user-confirmed
  "top-layer only"; deeper fills are a follow-up).
- **Migrating** already-shipped ECUC files from project root into
  `ecuc/` (backward compat: existing files keep their path; new files
  get the new path).
- Changing `addParameter` / `addReference` / `ParamEditor` UI body —
  the existing components already do the work; we only fix the gate.
- Reference / choice-container defaults.
- Rebuilding the skeleton on BSWMD reload (separate feature).

## UX Recommendation

No new entry point. The existing "ECUC模块选择..." menu and "+" inline
button still drive the flow. After confirmation, the user sees:

1. File appears in `<proj>/ecuc/` (visible in FileListTab).
2. Tree shows module + containers + **pre-filled parameters**.
3. ParamEditor opens with editable values right away.
4. "+ Add Parameter" / "+ Add Reference" buttons are enabled at every
   container row whose BSWMD schema is loaded.

The only visible text change is a single line in the picker right-pane
preview:

> 输出到 `ecuc/` 子目录 / Output to `ecuc/` subfolder

## Architecture

```
+-----------------------------------------------+
| ModuleFromBswmdPicker (existing)              |
|  + new i18n key: ecuc.fromBswmd.outputDir    |
+-----------------------------------------------+
                       |
                       v
+-----------------------------------------------+
| useCreateEcucFromBswmd (existing)            |
| - resolveCollisionFilename(picks, dir) [FIX] |
|   → returns <proj>/ecuc/<file> paths         |
+-----------------------------------------------+
                       |
                       v
+-----------------------------------------------+
| core/arxml/skeleton.ts [FIX]                 |
|   generateEcucSkeleton(doc, shortName)       |
|     buildModule  → params from module-level  |
|     buildContainer → params from top-level   |
|                     container.parameters[]   |
|                     using BSWMD defaultValue |
|                     + ParamKind→type map     |
|     buildContainer → recursive shell only    |
|                     (sub-containers unchanged)|
+-----------------------------------------------+
                       |
                       v
+-----------------------------------------------+
| projectWriteArxmlBatchHandler (UNCHANGED)    |
| mkdir -p <proj>/ecuc/ + write each file      |
+-----------------------------------------------+
                       |
                       v
+-----------------------------------------------+
| useArxmlStore.addDocumentWithSource (UNCHANGED)|
+-----------------------------------------------+
                       |
                       v
+-----------------------------------------------+
| ParamEditor (UNCHANGED UI)                   |
|   hasBswmdForModule [FIX]                    |
|     A.优先 doc.sourceBswmdPath → 检查 bswmdPaths |
|     B.回退 路径推断（保留原行为）               |
+-----------------------------------------------+
```

### Component / Module boundaries

| Layer | File | Change kind |
|---|---|---|
| core | `src/core/arxml/skeleton.ts` | **MODIFY** `buildContainer`, `buildModule` |
| core | `src/core/arxml/skeleton.ts` | **MODIFY** `resolveCollisionFilename` path prefix |
| renderer | `src/renderer/store/useArxmlStore.ts` | **MODIFY** `hasBswmdForModule` selector |
| shared | `src/shared/i18n.ts` | **MODIFY** add 1 key |
| tests | `src/core/arxml/__tests__/skeleton.test.ts` | **MODIFY** +15 cases |
| tests | `src/renderer/store/__tests__/useArxmlStore.s14.test.ts` | **MODIFY** +4 cases |
| tests | `src/renderer/components/editor/__tests__/ParamEditor.test.tsx` | **MODIFY** +2 cases |
| tests | `tests/e2e/sprint-14-picker-flow.spec.ts` | **MODIFY** +1 E2E |

**No new files**. All changes land in shipped files, keeping the diff
tight and easy to review.

## Skeleton Default-Fill Algorithm

### Type-mapping table

| BSWMD `ParamDef.kind` | ECUC `ParamValue.type` | Output XML tag | Default-value handling |
|---|---|---|---|
| `integer` | `'integer'` | `ECUC-NUMERICAL-PARAM-VALUE` | number required; `null` → skip |
| `float` | `'float'` | `ECUC-NUMERICAL-PARAM-VALUE` | number required; `null` → skip |
| `boolean` | `'boolean'` | `ECUC-NUMERICAL-PARAM-VALUE` | `0\|1`; `null` → skip |
| `enumeration` | `'enum'` | `ECUC-TEXTUAL-PARAM-VALUE` | literal string; `null` → empty string |
| `string` | `'string'` | `ECUC-TEXTUAL-PARAM-VALUE` | `null` → empty string |
| `function-name` | `'string'` | `ECUC-TEXTUAL-PARAM-VALUE` | `null` → empty string |

`reference` is **not** in this table — references go through the
separate `addReference` flow and are **not** emitted by skeleton.

### Algorithm (pseudo-code)

```typescript
function buildContainer(c: ContainerDef): ArxmlContainer {
  const params: Record<string, ParamValue> = {};
  for (const p of c.parameters) {
    const value = buildDefaultParamValue(p);
    if (value !== null) params[p.shortName] = value;
  }
  return {
    kind: 'container',
    tagName: 'ECUC-CONFIGURATION-CONTAINER',
    shortName: c.shortName,
    params,
    children: c.subContainers.map(buildContainer),
  };
}

function buildDefaultParamValue(p: ParamDef): ParamValue | null {
  switch (p.kind) {
    case 'integer':
    case 'float':
      return typeof p.defaultValue === 'number'
        ? { type: p.kind, value: p.defaultValue }
        : null;
    case 'boolean':
      if (typeof p.defaultValue === 'number') {
        return { type: 'boolean', value: p.defaultValue };
      }
      if (typeof p.defaultValue === 'boolean') {
        return { type: 'boolean', value: p.defaultValue ? 1 : 0 };
      }
      return null;
    case 'enumeration':
      return { type: 'enum', value: String(p.defaultValue ?? '') };
    case 'string':
    case 'function-name':
      return { type: 'string', value: String(p.defaultValue ?? '') };
  }
}
```

### Edge cases

| Condition | Behavior |
|---|---|
| `defaultValue === null` + integer/float/boolean | **skip** (don't emit `0`) |
| `defaultValue === null` + string/enum/function-name | emit `''` (matches `mutation.addParameter` fallback) |
| `ParamDef.kind === 'reference'` | **skip** (references use `addReference`) |
| `ContainerDef.choices` | **do not expand** (choices are user-instance in editor) |
| Module-level params (rare) | **emit** (top-layer = module-level + top-container) |
| Multiplicity 0..N containers | skeleton still emits 1 instance |
| Type-map mismatch | return `null` → silently skip; no throw |

## Subfolder Path Resolution

### Path rule

| Scenario | Old path | New path |
|---|---|---|
| Single pick | `<proj>/Can_Cfg.arxml` | `<proj>/ecuc/Can_Cfg.arxml` |
| Cross-BSWMD name collision | `<proj>/Can__intewell_Cfg.arxml` | `<proj>/ecuc/Can__intewell_Cfg.arxml` |
| Same vendor key repeats | `<proj>/Can__intewell_1_Cfg.arxml` | `<proj>/ecuc/Can__intewell_1_Cfg.arxml` |

### Implementation

`resolveCollisionFilename` — only the `${projectDir}/` literal is
changed to `${projectDir}/ecuc/`. The collision / vendor-key logic is
unchanged. `vendorKeyFromPath` and `keyOf` are unchanged.

### IPC handler

`projectWriteArxmlBatchHandler` already runs `fs.mkdir(dirname(filePath), { recursive: true })`. The `ecuc/` subdirectory is created on
demand by the first batch write — no handler change.

### Backward compatibility

- **Already-shipped ECUC** keep their `<proj>/<Module>_Cfg.arxml` path.
- **ProjectOpen** continues to load any absolute path; the subfolder
  prefix is purely a create-time convention.
- **Cascade remove** (BSWMD × with dependents) walks the
  `sourceBswmdPath` map; subfolder doesn't change the dependency lookup.

## Add-Param Gate Fix

### Current state

`ParamEditor.tsx:236-243` renders a "+ Add Parameter" button gated by:

```typescript
disabled={!hasBswmdForModule}
```

For files created via the BSWMD picker, `hasBswmdForModule` returns
`false` because:

- The doc has `sourceBswmdPath` set (added in `addDocumentWithSource`).
- The current selector implementation only does path-inference from
  `selectedPath`, not from `sourceBswmdPath`.

### New selector (priority A → B fallback)

```typescript
// renderer/store/useArxmlStore.ts
export function selectHasBswmdForModule(
  state: ArxmlState,
): (selectedPath: string) => boolean {
  return (selectedPath) => {
    const doc = state.documents.find(d => d.path === selectedPath);
    if (doc === undefined) return false;

    // A. Priority: sourceBswmdPath (picker-created ECUC).
    if (doc.sourceBswmdPath !== undefined) {
      return state.bswmdPaths.includes(doc.sourceBswmdPath);
    }

    // B. Fallback: path-inference (legacy / manually-imported ECUC).
    const moduleShortName = inferModuleShortName(selectedPath);
    return state.bswmdSchemas.some(s =>
      s.modules.some(m => m.shortName === moduleShortName),
    );
  };
}
```

If the current implementation is **inline** rather than a selector,
apply the same A→B logic at the call site; extraction to selector is a
**separate refactor** (out of scope).

### Downstream calls unchanged

- `openBswmdPicker({ parentPath: selectedPath, kind: 'parameter' })`
  → already filters candidates by `parentPath`.
- `mutation.addParameter(doc, containerPath, paramDef, moduleDef)`
  → already accepts `moduleDef`; the picker plumbing resolves it.

## i18n (1 new key)

```
ecuc.fromBswmd.outputDir
  zh-CN: "输出到 {dir}/ 子目录"
  en:    "Output to {dir}/ subfolder"
```

Used in `ModuleFromBswmdPicker` right pane above the "Will create"
list.

No other i18n additions — `mutation.action.addParameter`,
`mutation.error.no-bswmd-for-module`, etc. already exist.

## Files Changed (predicted)

| Action | File |
|---|---|
| MODIFY | `src/core/arxml/skeleton.ts` |
| MODIFY | `src/shared/i18n.ts` (+1 key, zh-CN + en) |
| MODIFY | `src/renderer/store/useArxmlStore.ts` (selector or inline) |
| MODIFY | `src/core/arxml/__tests__/skeleton.test.ts` (+15 cases) |
| MODIFY | `src/renderer/store/__tests__/useArxmlStore.s14.test.ts` (+4) |
| MODIFY | `src/renderer/components/editor/__tests__/ParamEditor.test.tsx` (+2) |
| MODIFY | `tests/e2e/sprint-14-picker-flow.spec.ts` (+1 E2E) |

No new files; no package.json change; no IPC contract change.

## Testing Strategy

| Layer | Target | New cases |
|---|---|---|
| `skeleton.test.ts` type-map unit | ≥ 95% | 9 (one per kind) + 3 edges (null int, null str, reference skip) |
| `skeleton.test.ts` resolveCollisionFilename | ≥ 95% | 3 (single pick, vendor suffix + subfolder, trailing slash) |
| `useArxmlStore.s14.test.ts` | ≥ 90% | 4 (source path A, fallback B, no match, post-cascade) |
| `ParamEditor.test.tsx` | ≥ 85% | 2 (button enabled for new doc, disabled when BSWMD missing) |
| E2E `sprint-14-picker-flow.spec.ts` | full flow | 1 (pick module → create ECUC → file in `ecuc/` → +Add Parameter works) |

**Estimated +22 tests; coverage floor stays ≥ 97.5% stmts / 90.7%
branches / 100% funcs.**

## Commit Plan (3 commits)

| # | Commit message | Scope |
|---|---|---|
| 1 | `feat(bswmd): skeleton emit default param values from BSWMD top-level containers` | `core/arxml/skeleton.ts` + `__tests__/skeleton.test.ts` (12 cases) |
| 2 | `feat(bswmd): route new ECUC files to <proj>/ecuc/ subfolder` | `core/arxml/skeleton.ts` `resolveCollisionFilename` + `shared/i18n.ts` (1 key) + 3 unit cases |
| 3 | `fix(editor): enable + Add Parameter for ECUC files created from BSWMD picker` | `useArxmlStore.ts` selector fix + 4 store cases + 2 component cases + 1 E2E |

Each commit is independently shippable / revertable. Land all 3 on
`feature/post-v1.0.0-wip` (current branch); the PR to `main` then
includes this spec's 3 commits + the 6 already on the branch.

## Risk Register

| Risk | Level | Mitigation |
|---|---|---|
| `hasBswmdForModule` is inline, not a selector | LOW | Read the implementation first in the plan; apply A→B at call site; extraction is separate |
| BSWMD author omits `defaultValue` → skeleton still empty | LOW | Falls back to Sprint 14 behavior; user can still add params via the (now-fixed) gate |
| Subfolder name `ecuc/` collides with user project | MED | New files only; user can rename / move post-create if needed |
| Sub-container not filled → users expect full skeleton | LOW | User-confirmed "top-layer only"; sub-containers are user-extensible via existing UI |
| Serialization of default boolean (`1`/`0`) | LOW | Reuses `mutation.buildDefaultValue` semantics; already covered by mutation tests |
| Backward-compat regression on ProjectOpen | LOW | Path computation is create-time only; ProjectOpen unchanged |
| Skeleton `buildDefaultParamValue` drifts from `mutation.buildDefaultValue` | LOW | Implementation plan **must** read `core/arxml/mutation.ts` `buildDefaultValue` first and align semantics (or extract to a shared `core/arxml/defaultValue.ts` if same logic) |

## Open Questions

None — all resolved in brainstorming:

- Q1 (Approach): ✅ **B** — defaults + subfolder + add-param gate fix
- Q2 (Subfolder name): ✅ `ecuc/`
- Q3 (Defaults granularity): ✅ top-layer (module-level params + top containers)
- Q4 (Add-param behavior): ✅ **default fill + manual add** both
- Q5 (Commit split): ✅ 3 commits
- Q6 (Backward compat): ✅ old files keep old paths; no migration
