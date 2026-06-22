# claude-AutosarCfg v1.7.3 SHIPPED

## Source

- Repo: <https://github.com/jasontaotao/claude-autosarcfg>
- Tag: `v1.7.3`
- Commits since v1.7.2: **1**
- HEAD: `e9da7d3`

## What's in this release

### Renderer build fix

`pnpm build:renderer` was broken since v1.6.1 commit `24e13e9` (the `useSwsValidatorRunner` hook landed in v1.6.1). Every release from v1.6.1 through v1.7.2 shipped with the renderer bundle failing to compile — Vite externalized the `node:fs` / `node:path` imports but Rollup then errored on the `join()` reference.

| What                                                                                              | Why                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/sws-validator/feature-flag.ts`: static → dynamic `await import('node:fs')` / `node:path'`    | Vite externalizes dynamic imports at the bundle level without failing the build; runtime try/catch falls back to `{ experimental: { swsValidator: false } }` when `node:*` unavailable |
| New `loadSwsValidatorFlag(): Promise<boolean>` async helper for main-process CLI boot             | Replaces the old sync path; CLI calls this once at startup to populate the cache from `settings.json`                                                                               |
| Sync API unchanged: `isSwsValidatorEnabled()`, `setFlagForTest()`, `_resetFlagCache()`, `_setSettingsPathForTest()` | No caller changes needed — renderer behavior already defaulted to `false` because the build never ran                                                                              |

## Quality bar

- **2033 tests pass + 1 skipped** (unchanged from v1.7.2)
- **0 type errors** (`npx tsc --noEmit` × 2 configs)
- **0 lint errors, 0 warnings** (`--max-warnings 0`)
- **`pnpm verify` all 7 stages pass** for the first time since v1.6.1:
  - format / lint / type-check / test / coverage / **build (renderer 828.93 kB, main 167.85 kB, preload 2.25 kB)** / import-regression

## Why PATCH not MINOR?

Pure build-system fix; no user-visible behavior change. Renderer's `isSwsValidatorEnabled()` was already returning `false` (default) because the broken build never shipped — production had no `dist/renderer/` artifact.

## Files changed

- **Modified**: `package.json` (1.7.2 → 1.7.3), `CHANGELOG.md`, `src/core/sws-validator/feature-flag.ts` (+73/-23)
- **New**: `release-notes-v1.7.3.md`

## Next: v1.7.4 / v1.8.0

- v1.7.4: §3b submodule migration for `@dbc-forge/core` (network now reachable; MINOR bump because dep reorg)
- v1.8.0+: real DBC↔ARXML bridging logic, Cluster 3 K Stencil Wizard, Cluster B Variants, Cluster J UDS (park research/uds-doip)
- Code review backlog audit (5 MEDIUM + 12 LOW + 6 NEEDS_CONTEXT from `claude-autosarcfg-code-review-2026-06-21.md` — 6 NEEDS_CONTEXT items may have been naturally resolved by v1.5.1/v1.6.0/v1.6.1/v1.7.x; verify before scheduling)