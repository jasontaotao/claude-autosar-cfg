# claude-AutosarCfg v1.7.2 SHIPPED

## Source

- Repo: <https://github.com/jasontaotao/claude-autosarcfg>
- Tag: `v1.7.2`
- Commits since v1.7.1: **2**
- HEAD: `9eb90b3`

## What's in this release

### S4 — Optional Container Visibility UI

Closes the final sub-sprint of the v1.7.1 skeleton-defaults plan (`docs/superpowers/plans/2026-06-21-skeleton-defaults-fill-and-choice-marker.md` L171-209, "Defer option" line 209).

| What | Why |
| --- | --- |
| Tree subscribes to `bswmdSchemas` | Same field that powers the BswmdPickerDialog and the validator — no new store surface |
| `findMissingOptionalSiblings` helper (new) | Walks the BSWMD-side parent container, returns `ContainerDef[]` where `lowerMultiplicity === 0` AND shortName absent from value tree |
| `OptionalAddPlaceholder` sub-component (new) | Same `role="treeitem"` shape as `TreeNode`, muted styling, `+` button invoking existing `addContainer` mutation |
| 2 i18n keys (`tree.addOptionalContainer`, `tree.optionalContainerHint`) | Localized button aria-label + placeholder hint, en + zh-CN parity |

### Hotfix — 3 pre-existing TS2322 errors

| What | Why |
| --- | --- |
| `AutosarApiStub` test interface: `ReturnType<typeof vi.fn>` → `Mock<any[], any>` | Variance mismatch with inline `vi.fn(async () => ({...} satisfies X))` produced `Mock<[], Promise<{...}>>` — more specific than the interface field |
| Existing pattern reused | Matches `useRemoveEcucFiles.test.tsx` + `App.test.tsx` test-stub idiom |

## Quality bar

- **2033 tests pass + 1 skipped** (2028 → 2033, +5 from S4 + 0 from TS2322 hotfix)
- **0 type errors** (`npx tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.web.json`)
- **0 lint errors, 0 warnings** (`npx eslint . --ext .ts,.tsx --max-warnings 0`)
- Full `pnpm verify` (7 stages) passes end-to-end

## Files changed

- **Modified**: `package.json` (1.7.1 → 1.7.2), `CHANGELOG.md`, `src/renderer/components/tree/Tree.tsx`, `src/renderer/components/tree/__tests__/Tree.test.tsx`, `src/renderer/components/tree/__tests__/TreeNode.module.test.tsx`, `src/shared/i18n.ts`, `src/renderer/__tests__/integration/removeBswmd.fullFlow.test.tsx`
- **New**: `src/renderer/components/tree/OptionalAddPlaceholder.tsx` (95 lines), `src/renderer/components/tree/optionalContainers.ts` (125 lines), `src/renderer/components/tree/__tests__/Tree.optionalContainers.test.tsx` (298 lines)

## What's deferred to v1.7.3+

- **§3b submodule migration for `@dbc-forge/core`** — github.com now reachable (HTTP 200, ping 76ms as of 2026-06-21), bumped to v1.7.3 MINOR (submodule init is a dep-reorg, not a PATCH)
- **Optional container description tooltip** — `desc` field is on `ContainerDef` (v1.7.1 S3); UI follows when needed
- **5 hardcoded `D:/claude_proj2/...` fixture paths** — portable-helper refactor when CI moves to Linux

## Why PATCH not MINOR?

S4 is renderer-only composition on top of already-shipped `addContainer` mutation. No new IPC channels, no new feature flags, no new store actions. The TS2322 hotfix is pure typing-tightening. Existing v1.7.1 consumers see no behavior break except the documented S4 visibility change.

## Next: v1.7.3 §3b + brainstorm v1.8.0

- v1.7.3: submodule migration for `@dbc-forge/core` (MINOR bump, dep reorg)
- v1.8.0+: real DBC↔ARXML bridging logic, Cluster 3 K Stencil Wizard, Cluster B Variants, Cluster J UDS (park research/uds-doip)