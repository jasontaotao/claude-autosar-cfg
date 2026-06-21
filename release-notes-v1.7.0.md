# claude-AutosarCfg v1.7.0 SHIPPED

## Source

- Repo: <https://github.com/jasontaotao/claude-autosar-cfg>
- Tag: `v1.7.0` (annotated)
- Commits since v1.6.1: **1** (`6c4f5bc` — see `git show v1.7.0^{}`)
- Predecessor: v1.6.1 LOCAL READY (HEAD `59c4f54`); v1.6.0 SHIPPED 2026-06-21

## What's in this release

### Cluster 3 I — DBC↔ARXML plumbing via dbc-forge reuse

This release brings `dbc-forge` (Excel↔DBC↔Network TypeScript library, v0.1.0 PUBLISHED) into claude-AutosarCfg as a transitive dependency. **Plumbing only** — no production code uses dbc-forge yet. Real ARXML↔DBC bridging is v1.8.0+ scope.

| Change | Detail |
| --- | --- |
| `package.json` | `+@dbc-forge/core: file:..\dbc-forge\packages\core` in dependencies |
| `pnpm-lock.yaml` | Resolves `@dbc-forge/core 0.0.0` via file: protocol (36 transitive packages, no errors) |
| `src/__tests__/dbcForgeBridge.smoke.test.ts` | New, 73 lines, 3 tests |
| `docs/superpowers/specs/2026-06-21-v1-7-0-dbc-forge-integration-design.md` | Updated with implementation delta (§3a) and Future cleanup (§3b) |

**Smoke test asserts**:
1. `@dbc-forge/core` exports the expected public API surface (`parseDbc` / `writeDbc` / `deepEqualNetwork`)
2. Parses a minimal 1-frame DBC string
3. Round-trips `parseDbc → writeDbc → parseDbc` and asserts `deepEqualNetwork` true

## Implementation delta from design §3

**Originally recommended**: Option A — `git submodule` + `file:` dep.

**Actually shipped**: `file:../dbc-forge/packages/core` (sibling-repo fallback).

**Reason**: `git submodule add https://github.com/jasontaotao/dbc-forge.git vendor/dbc-forge` failed with `fatal: unable to access 'https://github.com/...': Failed to connect to github.com port 443`. Direct curl + proxy `127.0.0.1:7897` both unreachable at ship time. Local `pnpm install` succeeded (3.7s, 36 packages) because the local fs isn't blocked.

## Implications

- ✅ Local dev works (sibling repo at `D:/claude_proj2/dbc-forge/`)
- ⚠️  New contributors need to clone dbc-forge at exactly `../dbc-forge` relative path — fragile
- ⚠️  No `.gitmodules` / no CI submodule init step — need to add when network returns

## Future cleanup (when github.com network stable)

1. `git submodule add https://github.com/jasontaotao/dbc-forge.git vendor/dbc-forge`
2. `cd vendor/dbc-forge && git checkout v0.1.0`
3. Update `package.json`: `file:..\dbc-forge\packages\core` → `file:./vendor/dbc-forge/packages/core`
4. Update CI workflow to `git submodule update --init --recursive` before `pnpm install`
5. Update smoke test comment to point at `vendor/dbc-forge`

## Quality bar

- **2013 tests pass + 1 skipped, 0 fail** (2010 → 2013, +3 smoke)
- **0 type errors** (`npx tsc --noEmit`)
- **0 lint errors, 0 warnings** (`npx eslint . --ext .ts,.tsx --max-warnings 0`)
- `pnpm verify` passes all 7 stages: `format` / `lint` / `type-check` / 2013 tests / `coverage` / `build` / `import-regression`
- Coverage unchanged: **96.61% stmts / 87.72% branches** (target ≥ 95.5% / ≥ 87%)

## What's still in the v1.7.0+ backlog

- **Cluster 3 K** — BSWMD-Free Stencil Wizard (depends on G validators now shipped in v1.6.0). 8-10 wks scope; defer to v1.7.1 or break into smaller sub-sprints.
- **Cluster 3 I (real)** — actual ARXML↔DBC bridge, Com/DbCom BSWMD generation from DBC. v1.8.0+ scope per design §6.
- **Submodule migration** — required for CI / new contributors per §3b Future cleanup.

## Next: v1.7.1 skeleton defaults + choice marker

Spec at `docs/superpowers/specs/2026-06-18-bswmd-ecuc-skeleton-defaults-design.md` (Sprint 14 era, still applicable). Plan at `docs/superpowers/plans/2026-06-21-skeleton-defaults-fill-and-choice-marker.md` (committed in v1.7.0 cycle as prep). 4 sub-sprints (S1 choice marker + S2 sub-container defaults + S3 description carry-through + S4 optional container visibility); v1.7.1 ships S1+S2+S3 (PATCH), v1.7.2 ships S4 (UI scope).