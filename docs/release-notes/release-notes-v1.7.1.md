# claude-AutosarCfg v1.7.1 SHIPPED

## Source

- Repo: <https://github.com/jasontaotao/claude-autosar-cfg>
- Tag: `v1.7.1` (annotated)
- Predecessor: v1.7.0 SHIPPED 2026-06-21 (HEAD `f4b57c4` + tag v1.7.0); v1.6.1 LOCAL READY (`59c4f54`); v1.6.0 SHIPPED (`2907177`)
- Commits since v1.7.0: **5** (`ed8a352` + `de8878e` + `e355c3e` + `7279170` + final release bump)
- HEAD: `7279170` + 1 release bump = final HEAD after this commit

## What's in this release

PATCH bump — 3 sub-sprints fix platform-level Skeleton generation defects found in code-review (P1-P3 from the plan at `docs/superpowers/plans/2026-06-21-skeleton-defaults-fill-and-choice-marker.md`). No new capability surface; existing features get richer output.

### S1 — Choice Container Marker (P3)

`ArxmlContainer` gains 2 optional readonly fields so the UI can distinguish choice-container shells from plain sub-container shells.

| Field                | Type                | Set when                                                                                                                     |
| -------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `isChoiceContainer?` | `boolean`           | shell came from a BSWMD `<ECUC-CHOICE-ORIENTED-STRUCTURE-DEF>` or `<ECUC-CHOICE-CONTAINER-DEF>` (always `true` in that case) |
| `choiceBranches?`    | `readonly string[]` | same; lists the alternative branch shortNames in BSWMD source order                                                          |

Previously `buildChoiceShell` emitted a shape that was byte-identical to `buildSubContainerShell` apart from the children list — the only signal was membership in the parent's `choices[]` array, which was lost the moment the shell was constructed. The UI now has a reliable marker.

### S2 — Sub-Container Default Value Fill (P1)

Pre-created sub-container shells now carry BSWMD-declared defaults instead of being hardcoded `params: {}`. New `fillParamsFromBswmd(c)` helper extracted from `buildTopContainer` is shared between top + sub builders.

> **⚠️ Observable behavior change (release-notes call-out per S2 code-review).**
> Pre-v1.7.1: sub-container shells started with `params: {}`; only top-level containers had defaults.
> Post-v1.7.1: every pre-created sub-container shell starts with its BSWMD-declared defaults.
>
> User-visible impact: the value-side ECUC XML written from a skeleton now contains `<ECUC-*-PARAM-VALUE>` wrappers at every depth instead of only the top layer. Anyone round-tripping a v1.7.0-built ECUC value file through a vendor tool will see additional default-valued parameter entries at depths that previously had empty `<CONTAINER-VALUE>` shapes.
>
> Downstream consumers (`mutation.ts`, `applyPatchSteps.ts`, `diff.ts`, `read.ts`, `paramUpdate.ts`) all **read** `params[name]` and skip when undefined — adding default-filled entries can only produce _more_ matches, which is the intended S2 behavior. No silent failures.

Choice shells deliberately stay `params: {}` (branches are user-instanced at runtime per AUTOSAR ECUC-CHOICE semantics — `buildChoiceShell` does NOT call `fillParamsFromBswmd`).

### S3 — Container Description Carry-Through (P2)

End-to-end `<DESC>` text flow: BSWMD parser extracts → `ContainerDef.desc` / `ParamDef.desc` → `ArxmlContainer.description` → skeleton carries.

Previously the BSWMD parser did NOT read `<DESC>` at all (zero matches in `src/` pre-S3), so the BSWMD-side documentation never reached the value-side UI.

| Layer        | New field                                                                          | Source                                   |
| ------------ | ---------------------------------------------------------------------------------- | ---------------------------------------- |
| BSWMD parser | `ContainerDef.desc?` + `ParamDef.desc?`                                            | `readDesc(item)` helper on `<DESC>` body |
| ARXML types  | `ArxmlContainer.description?`                                                      | forwarded from `ContainerDef.desc`       |
| Skeleton     | all 3 builders (`buildTopContainer`, `buildSubContainerShell`, `buildChoiceShell`) | `description: c.desc`                    |

`undefined` when the BSWMD omits `<DESC>` or declares an empty `<DESC></DESC>` (the two cases collapse so downstream UI doesn't have to distinguish them).

## Quality bar

- **2029 tests** (2028 pass + 1 skipped, 0 fail) — 2017 → 2029 (+12 since v1.7.0)
- **0 NEW type errors** — the 8 TS2375 errors S3 introduced (due to `exactOptionalPropertyTypes: true` + `description: c.desc` where `c.desc` is `string | undefined`) were fixed in `7279170` by adding explicit `| undefined` to the 3 new field declarations
- **0 lint errors** (`pnpm lint`)
- `pnpm verify` passes 6 of 7 stages: format / lint / 2029 tests / coverage / build / import-regression
- **3 pre-existing TS2322 errors** in `src/renderer/__tests__/integration/removeBswmd.fullFlow.test.tsx` (lines 95, 96, 296) — unrelated to v1.7.1, present on `d34f5e5` (v1.7.0 cycle end) before S1+S2+S3 shipped. Tracked separately.

## Coverage

| Module                       | Lines                              | Branches  | Notes                                               |
| ---------------------------- | ---------------------------------- | --------- | --------------------------------------------------- |
| `src/core/arxml/skeleton.ts` | +3.1% (new helper + carry-through) | unchanged | `fillParamsFromBswmd` + 3 `description:` writesites |
| `src/core/project/bswmd.ts`  | +0.8%                              | +0.5%     | `readDesc` + 5 builder sites                        |
| Project-wide                 | ≥ 95.5% / ≥ 87%                    | unchanged | both targets met                                    |

## Sub-Sprint Breakdown

| Sub     | Commit    | What                                                                          |
| ------- | --------- | ----------------------------------------------------------------------------- |
| **S1**  | `ed8a352` | Choice marker — 3 tests, 120 lines                                            |
| **S2**  | `de8878e` | Sub-container default fill — 4 net new tests (5 added - 1 removed), 260 lines |
| **S3**  | `e355c3e` | Description carry-through — 8 tests, 340 lines                                |
| **Fix** | `7279170` | exactOptionalPropertyTypes compat — 3 field types                             |

## What's still in the v1.7.x backlog

- **Cluster 3 K** — BSWMD-Free Stencil Wizard (depends on S1's marker + S3's description). Now unblocked by S1+S2+S3. Planned v1.7.2 if scope allows.
- **S4 (P4)** — lower=0 optional container visibility (TreeNode placeholder + + button). UI scope, deferred from v1.7.1 per plan. Planned v1.7.2.
- **arxml-stream** — true SAX parser swap (v1.5.1 release-note caveat). Unchanged.

## Next: v1.7.2 candidates

Two options to consider:

1. **Cluster 3 K (Stencil Wizard)** — new capability surface (MINOR bump candidate).
2. **S4 (optional container visibility) + S2 polish** — PATCH bump, completes the v1.7 series.

User decision pending.
