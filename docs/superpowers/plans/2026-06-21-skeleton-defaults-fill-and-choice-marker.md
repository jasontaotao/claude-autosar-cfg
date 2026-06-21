# Skeleton Generation — Platform-Level Fixes Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

## Status

| Field | Value |
| --- | --- |
| **Date** | 2026-06-21 |
| **Owner** | Claude Fable 5 (this session) |
| **Branch baseline** | `6c4f5bc` (v1.7.0 Cluster 3 I LOCAL SHIPPED) |
| **Predecessor** | v1.6.1 LOCAL READY + v1.7.0 I (sibling-repo `@dbc-forge/core` file: dep) |
| **Goal** | Fix 4 platform-level Skeleton generation defects (P1-P4 from code review). P5 = no change. |
| **Type** | Feature: defaults fill + choice marker + description carry-through + optional visibility |
| **Verification already done** | P1-P5 claims cross-referenced against code at `src/core/arxml/skeleton.ts:117-238`, `src/core/arxml/types.ts:60-66`, `src/core/project/bswmd.ts:81-126`. |

## Decision Summary

| # | Issue | Status | Decision |
| --- | --- | --- | --- |
| P1 | 子容器参数默认值不填充 | HIGH | **FIX in S2** |
| P2 | ArxmlContainer 缺 description | MEDIUM | **FIX in S3** (chain through parser → types → skeleton) |
| P3 | Choice 容器无结构标识 | MEDIUM | **FIX in S1** (mark + branch list) |
| P4 | lower=0 可选容器不可见 | LOW | **FIX in S4** (UI placeholder row) |
| P5 | 死节点引用 | LOW | **NO CHANGE** (current behavior correct) |

## Architecture

4 atomic sub-sprints, each independently shippable. Sub-sprints are not strictly sequential — S1 + S2 share the `src/core/arxml/skeleton.ts` file so they ship sequentially; S3 also touches `skeleton.ts` so it ships after S1+S2; S4 is UI-only and parallelizable with S1+S2+S3 once the core types stabilize.

```
S1 (P3 choice marker) ─┐
                        ├─→ S3 (P2 description chain) ─→ release v1.7.1
S2 (P1 default fill)  ─┘                                  
S4 (P4 optional visibility) ─── parallel to all above ────┘
```

## Sub-Sprint Sequencing

| Sub-sprint | Scope | Files touched | Commits | Tests added |
| --- | --- | --- | --- | --- |
| **S1** | P3: `ArxmlContainer.isChoiceContainer` + `choiceBranches` + skeleton flags + UI test | `src/core/arxml/types.ts`, `src/core/arxml/skeleton.ts`, `src/core/arxml/__tests__/skeleton.test.ts` | 1 | 3-5 |
| **S2** | P1: extract `fillParamsFromBswmd()`, share between top + sub | `src/core/arxml/skeleton.ts`, `src/core/arxml/__tests__/skeleton.test.ts` | 1 | 4-6 |
| **S3** | P2: BSWMD parser reads `<DESC>` + ParamDef/ContainerDef.desc + ArxmlContainer.description + skeleton carry | `src/core/project/bswmd.ts`, `src/core/project/bswmdParser.ts`, `src/core/arxml/types.ts`, `src/core/arxml/skeleton.ts`, tests for each layer | 2-3 | 8-12 |
| **S4** | P4: TreeNode renders lower=0 placeholder rows + Add button | `src/renderer/components/tree/TreeNode.tsx`, `src/shared/i18n.ts`, tests + i18n keys (zh + en) | 1-2 | 3-5 |

**Release plan**: v1.7.1 ships after S1 + S2 + S3. S4 ships in v1.7.2 (UI scope, can be deferred without blocking skeleton defaults).

---

## S1 — Choice Container Marker (P3)

### Goal

Mark choice containers in `ArxmlContainer` so the UI can distinguish them from plain sub-containers. Currently `buildChoiceShell` emits a structurally identical shell to `buildSubContainerShell` — the only signal lives in the parent's `choices[]` array membership, which is lost once the shell is constructed.

### Files

**Modify**: `src/core/arxml/types.ts` (add 2 fields)
- `ArxmlContainer` gets `readonly isChoiceContainer?: boolean` + `readonly choiceBranches?: readonly string[]`

**Modify**: `src/core/arxml/skeleton.ts` (set the markers)
- `buildChoiceShell`: pass `isChoiceContainer: true` + populate `choiceBranches` by traversing `c.choices[].subContainers[].shortName` (the branches are nested under choice's `subContainers` per `buildChoiceContainer` in `src/core/project/bswmd.ts:864-880`)

**Modify**: `src/core/arxml/__tests__/skeleton.test.ts`
- Existing tests at line 202-232 (choice container coverage) verify the new markers
- New test: "choice shell carries isChoiceContainer: true + choiceBranches list"
- New test: "sub-container shell does NOT carry isChoiceContainer"

### Acceptance Criteria

- [ ] `ArxmlContainer` interface has `isChoiceContainer?: boolean` + `choiceBranches?: readonly string[]`
- [ ] `buildChoiceShell` outputs `isChoiceContainer: true` and `choiceBranches: ['BranchA', 'BranchB']` for a sample BSWMD with 2 choice branches
- [ ] `buildSubContainerShell` does NOT set `isChoiceContainer` (i.e. `undefined`)
- [ ] Existing choice-related tests still pass (no regression in current behavior)
- [ ] Type-check + lint clean
- [ ] Test count delta: +3-5

### Out of scope (S1)

- UI consumption of the marker (S4 / later release handles the "please pick a branch" prompt)
- Branch list deep traversal beyond direct subContainers (BSWMD `<CHOICES>` blocks are typically flat per spec; pathological nesting is not a v1.7.1 concern)

---

## S2 — Sub-Container Default Value Fill (P1)

### Goal

Fill default values into sub-container shells (second-level and deeper). Currently `buildTopContainer` calls `buildDefaultValue` per parameter, but `buildSubContainerShell` returns `params: {}` literally — every pre-created sub-container starts empty.

### Files

**Modify**: `src/core/arxml/skeleton.ts` (extract + share)
- New local function `fillParamsFromBswmd(c: ContainerDef): Record<string, ParamValue>` (lines 132-145 from `buildTopContainer` extracted verbatim)
- `buildTopContainer`: replace inline loop with `fillParamsFromBswmd(c)`
- `buildSubContainerShell`: replace `params: {}` with `params: fillParamsFromBswmd(c)`
- `buildChoiceShell`: **deliberately does NOT change** — choice branches are user-instanced; the shell is just a placeholder, not an instance with defaults (matches AUTOSAR semantics + the existing comment at skeleton.ts:230-234)

**Modify**: `src/core/arxml/__tests__/skeleton.test.ts`
- Existing tests should already pass (fill-from-defaults is now uniform across depths)
- New test: "sub-container with default parameter carries the default value"
- New test: "deeply nested sub-container (3 levels) inherits default fill"
- New test: "sub-container with no parameters returns params: {} (not undefined)"
- New test: "choice shell does NOT carry defaults (branches are user-instanced)"

### Acceptance Criteria

- [ ] `fillParamsFromBswmd(c)` exists, used in both `buildTopContainer` and `buildSubContainerShell`
- [ ] Skeleton output for a CDD module with nested sub-containers shows all defaults populated (verified via integration test on `tests/fixtures/arxml/JWQ3399_*.arxml` if available)
- [ ] Choice shells remain empty params (semantic preservation)
- [ ] `definitionRef` is carried on filled defaults (Sprint 16 invariant preserved)
- [ ] Type-check + lint clean
- [ ] Test count delta: +4-6

### Out of scope (S2)

- Description fill (S3)
- Choice marker (S1)
- Text-shape fallback for sub-containers different from top (current code path is identical, no semantic divergence needed)

---

## S3 — Container Description Carry-Through (P2)

### Goal

End-to-end `<DESC>` text flow: BSWMD parser extracts → `ContainerDef.desc` + `ParamDef.desc` → `ArxmlContainer.description` → skeleton carries. Currently the BSWMD parser does NOT read `<DESC>` at all (zero matches in `src/`).

### Files

**Modify**: `src/core/project/bswmd.ts` (2 type additions)
- `ContainerDef` gets `readonly desc?: string`
- `ParamDef` gets `readonly desc?: string`

**Modify**: `src/core/project/bswmdParser.ts` (2 read sites)
- `buildContainer`: extract `<DESC>` text content into `desc`
- `buildParam`: extract `<DESC>` text content into `desc`
- Existing `readShortName` / `readNumber` helpers — add `readDesc(item)` that returns the `<DESC>` text or undefined

**Modify**: `src/core/arxml/types.ts`
- `ArxmlContainer` gets `readonly description?: string`

**Modify**: `src/core/arxml/skeleton.ts` (carry the description)
- `buildTopContainer`: `description: c.desc`
- `buildSubContainerShell`: `description: c.desc`
- `buildChoiceShell`: `description: c.desc` (carries the choice container's own description; branches carry their own)

**Modify tests**:
- `src/core/project/__tests__/bswmd.test.ts` (or equivalent): add `<DESC>` extraction tests
- `src/core/arxml/__tests__/skeleton.test.ts`: add "skeleton carries ContainerDef.desc into ArxmlContainer.description"

### Acceptance Criteria

- [ ] `ContainerDef.desc` + `ParamDef.desc` exist as optional fields
- [ ] `bswmdParser.ts` correctly extracts `<DESC>` text content for both containers and params
- [ ] `ArxmlContainer.description` exists as optional field
- [ ] `buildTopContainer` + `buildSubContainerShell` + `buildChoiceShell` all carry `description: c.desc`
- [ ] BSWMD test fixtures that include `<DESC>` round-trip the text through to skeleton output
- [ ] Type-check + lint clean
- [ ] Test count delta: +8-12 (parser tests + skeleton tests + integration)

### Out of scope (S3)

- UI rendering of description (ParamEditor / TreeNode — separate task when UI consumes the field)
- Multi-line DESC text formatting (BWSMD allows multi-line; serializer may or may not preserve)
- DESC translation (BSWMD has only one language; English-only)

---

## S4 — Optional Container Visibility (P4)

### Goal

Surface `lowerMultiplicity = 0` containers in the tree so users know optional sub-configurations exist and can add them. Currently `buildSubContainerShell:187` + `buildChoiceShell:223` return `[]` for lower=0 — they are completely invisible outside the picker.

### Files

**TBD after UI survey** — exact files depend on which tree component renders the container tree. Likely candidates:
- `src/renderer/components/tree/TreeNode.tsx` (or the parent tree renderer)
- `src/renderer/components/LeftPanel.tsx` (if rendering is left-panel responsibility)
- New helper hook: `useOptionalChildContainers(parentPath)` that returns the lower=0 children from the active BSWMD's `ContainerDef`

**Modify**: `src/shared/i18n.ts` (i18n keys)
- `tree.addOptionalContainer` / `tree.optionalContainerHint` (zh + en)

**Modify tests**:
- New tree rendering test: "optional container with lower=0 shows a placeholder row with + button"
- New test: "clicking + on optional placeholder invokes addContainer"
- New i18n key test

### Acceptance Criteria

- [ ] TreeNode renders a placeholder row for each `lowerMultiplicity = 0` child of the currently-expanded container
- [ ] Placeholder shows shortName + a "+" affordance
- [ ] Clicking "+" invokes the existing `addContainer` action (no new write path needed)
- [ ] Optional containers added via this UI appear identical to user-added containers (no marker distinguishes them in the tree — it's just an entry point)
- [ ] Type-check + lint clean
- [ ] Test count delta: +3-5

### Out of scope (S4)

- Choice container marker UI (S1 covers the marker; S4 only consumes the marker if needed for the "please pick a branch" prompt — likely a separate S5)
- Description tooltip on the placeholder (S3 makes the data available; UI rendering is a follow-up)
- Upper-multiplicity > 1 handling (containers with multiple instances get their own "+" affordance already; only the visibility problem is solved here)

### Defer option

S4 is the largest UI scope. If v1.7.1 is time-boxed, ship S1+S2+S3 in v1.7.1 and defer S4 to v1.7.2.

---

## Risks

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | S2 default-fill changes CDD skeleton shape — downstream integration tests assert on specific value | Low | Medium | Run full `pnpm verify` after S2; if any test breaks, pin that BSWMD fixture in the skip list with a follow-up task |
| R2 | S3 `<DESC>` extraction introduces multi-line / encoding edge cases (XML entities, CDATA) | Medium | Low | Use existing `getText` / `readText` helpers; add a test for `&amp;` + multi-line DESC |
| R3 | S4 UI scope balloons into a tree-rewrite task | Medium | Medium | Scope-limit S4 to "show placeholder row + + button" — no auto-pick, no fancy grouping |
| R4 | S1 choice marker breaks UI consumers expecting exact `ArxmlContainer` shape | Low | Medium | Markers are optional fields; existing consumers ignoring `isChoiceContainer`/`choiceBranches` continue to work |

## Out of Scope (P5 — confirmed no change)

Lower=0 containers with dead/invalid ref destinations are correctly skipped by `buildSubContainerShell:187` + `buildChoiceShell:223`. The skip is intentional behavior, not a bug. No code change.

## Files Referenced (for executor)

- `src/core/arxml/skeleton.ts` — primary file (S1+S2+S3 modify)
- `src/core/arxml/types.ts` — type additions (S1+S3)
- `src/core/arxml/__tests__/skeleton.test.ts` — test expansion (S1+S2+S3)
- `src/core/project/bswmd.ts` — type + builder (S3)
- `src/core/project/bswmdParser.ts` — parser (S3)
- `src/shared/i18n.ts` — i18n keys (S4)
- `src/renderer/components/tree/TreeNode.tsx` — UI (S4, TBD after survey)

## Pre-Implementation Checklist (executor must confirm)

- [ ] Network state: github.com reachable (for push at end)
- [ ] `pnpm install` runs clean (especially `@dbc-forge/core` file: dep from v1.7.0 I)
- [ ] `pnpm test` baseline: 2013 pass / 1 skip / 0 fail
- [ ] `pnpm lint` + `pnpm type-check` baseline: clean
- [ ] Branch: `main` at `6c4f5bc` (or a feature branch derived from it)

## Commit Strategy

- One commit per sub-sprint (S1, S2, S3, S4) — atomic, revertable
- Conventional commit format: `feat(v1.7.1): ...`
- After all sub-sprints: release commit bumping `package.json` + CHANGELOG entry + `release-notes-v1.7.1.md`
- Tag: `v1.7.1` (PATCH bump — no new capability surface, just completeness fixes)
- Push + manual GH release per project pattern (gh CLI not in PATH)

## Reference

- P1-P5 claims traced against code in session of 2026-06-21 (commit `6c4f5bc`)
- Predecessor: [[claude-autosarcfg-v1-6-1-local-ready]] + [[claude-autosarcfg-v1-7-0-cluster-3-i]]
- Sprint 14 BSWMD-to-ECUC design: `docs/superpowers/specs/2026-06-18-bswmd-ecuc-skeleton-defaults-design.md` (covers original skeleton defaults decision; S2 supersedes the "top-layer only" decision)
- Sprint 16 v1.1.1 reference for `definitionRef` carry-through (preserved in S2)