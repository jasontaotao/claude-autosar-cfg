# v1.7.0 — Cluster 3 I: Reuse dbc-forge — Design

> **Status**: ✅ IMPLEMENTED 2026-06-21 (network-outage adjusted: sibling-repo `file:` dep used instead of git submodule; submodule init pending network recovery)
> **Owner**: Claude Fable 5 (this session)
> **Cluster**: v1.7.0 Cluster 3 (I = dbc-forge reuse, K = Stencil, N = DROPPED)
> **Predecessor**: v1.6.1 LOCAL READY (HEAD `59c4f54`); v1.6.0 SHIPPED 2026-06-21
> **Goal**: Pull dbc-forge (Excel↔DBC↔Network TypeScript library, v0.1.0 PUBLISHED) into claude-AutosarCfg so future BSWMD DBC bridging work can reuse it instead of forking.

## 1. Background

- **dbc-forge** is published at https://github.com/jasontaotao/dbc-forge (v0.1.0 tag, 285 tests, 91.6% line / 80.82% branch coverage).
- Layout: `D:/claude_proj2/dbc-forge/` — **already a pnpm monorepo** (`pnpm-workspace.yaml` globs `packages/*`).
  - `packages/core` — `@dbc-forge/core` (pure Excel↔DBC model + writer + reader + diff)
  - `packages/cli` — `@dbc-forge/cli` (Node CLI wrapper)
- **claude-AutosarCfg** is single-package at `D:/claude_proj2/claude-AutosarCfg/`. It has a `pnpm-workspace.yaml` but only for `allowBuilds:` — no `packages:` globs.
- v1.7.0 Cluster 3 scope (per `claude-autosarcfg-v1-6-brainstorm.md`):
  - **I** — reuse dbc-forge ← this doc
  - K — Stencil (config template export)
  - N — ASPICE **DROPPED** (legal/death-march)
- v1.7.0 does NOT yet need to wire DBC↔ARXML logic. The scope of v1.7.0 I is just **getting dbc-forge usable inside AutosarCfg** (build + import + smoke test). Real bridging is v1.8.0+ scope.

## 2. Three Layout Options (user decides)

### Option A — Git submodule + `pnpm add file:`

```
D:/claude_proj2/
├── claude-AutosarCfg/    # this repo
│   ├── src/
│   ├── pnpm-workspace.yaml  (no package globs)
│   ├── package.json       # + "dependencies": { "@dbc-forge/core": "file:../dbc-forge/packages/core" }
│   └── .gitmodules        # points to dbc-forge
└── dbc-forge/             # git submodule (pinned to v0.1.0 or main HEAD)
```

- **Pro**: independent versioning. Submodule pinned, bump only when user wants new dbc-forge features.
- **Pro**: minimal repo restructure in AutosarCfg.
- **Con**: editing dbc-forge locally requires `git submodule update` + separate commit/PR.
- **Con**: CI must init submodules (`git submodule update --init` before `pnpm install`).
- **Con**: file: deps re-resolve on dbc-forge edit (rebuild required).

### Option B — Workspace member (pnpm monorepo)

```
D:/claude_proj2/
└── claude-AutosarCfg/    # single repo
    ├── pnpm-workspace.yaml   # + "packages": ["packages/*"]
    ├── package.json          # root = claude-autosarcfg
    ├── packages/
    │   ├── autosarcfg-app/   # ← moved existing src/ + electron/ + vite configs here
    │   └── dbc-forge-bridge/ # ← cloned dbc-forge/packages/core + minimal adapter
    └── dbc-forge/            # git submodule at packages/dbc-forge-bridge/vendor/
```

- **Pro**: unified `pnpm dev` + `pnpm test` + cross-package type-check.
- **Pro**: `workspace:*` protocol for instant local updates.
- **Con**: large restructure. Existing `src/renderer/...` import paths stay but root moves.
- **Con**: Vite/Electron config needs to handle the new package boundaries.
- **Risk**: breaks CI/release flow.

### Option C — Submodule + npm-published version (no live link)

```
D:/claude_proj2/
├── claude-AutosarCfg/    # this repo
│   ├── package.json       # + "dependencies": { "@dbc-forge/core": "^0.1.0" }
│   └── pnpm-lock.yaml     # resolves to registry (npmjs)
└── dbc-forge/             # independent, npm-published
```

- **Pro**: cleanest. No local coupling. CI is unchanged.
- **Con**: requires dbc-forge to be **npm-published** (currently GitHub-only per `dbc-forge-v0-1-0-overview.md`).
- **Con**: forces a release coordination every time AutosarCfg wants a newer dbc-forge.

## 3. Recommendation

**Option A (git submodule + file: dep)** for v1.7.0.

Reasons:
- dbc-forge is NOT on npm yet; Option C requires a release step outside our scope.
- Option B is too much repo surgery for what we need (we only consume `@dbc-forge/core`, not modify it).
- Option A keeps both repos independently releasable while letting local dev work via file: protocol. CI change is a 1-line addition to the install step.

When dbc-forge later publishes to npm, we can switch to Option C with a one-line package.json edit. No code changes.

## 3a. Implementation delta (2026-06-21)

Implemented during v1.6.1 close-out session. Actual implementation diverges from §3 above in one way:

- **Network outage** prevented `git submodule add https://github.com/jasontaotao/dbc-forge.git vendor/dbc-forge` (fatal: clone of `https://github.com/jasontaotao/dbc-forge.git/...` failed; github.com unreachable both directly and via 127.0.0.1:7897 proxy).
- **Fallback**: used `pnpm add file:../dbc-forge/packages/core` instead of vendored `file:./vendor/dbc-forge/packages/core`. The dbc-forge checkout at `D:/claude_proj2/dbc-forge/` is a sibling repo, not a submodule.
- **What this means**:
  - ✅ Local install works (3.7s, 36 packages added, no errors)
  - ✅ Smoke test passes (3/3, round-trip preserves network byte-for-byte)
  - ⚠️  CI / new contributors need the sibling repo at the exact relative path `../dbc-forge`. The submodule-based spec §4 has been deferred; documented in "Future cleanup" below.
  - ⚠️  No `.gitmodules` / no submodule init step in CI — needs to be added when network returns.

## 3b. Implementation summary

**Files changed** (3):
- `package.json` — `+@dbc-forge/core: file:..\dbc-forge\packages\core` in dependencies
- `pnpm-lock.yaml` — resolves `@dbc-forge/core 0.0.0` via file: protocol (36 transitive packages)
- `src/__tests__/dbcForgeBridge.smoke.test.ts` (new, 73 lines, 3 tests)

**Test count delta**: 2010 → 2013 (+3).

**Future cleanup** (when network returns):
1. `git submodule add https://github.com/jasontaotao/dbc-forge.git vendor/dbc-forge`
2. `cd vendor/dbc-forge && git checkout v0.1.0`
3. Update `package.json`: `file:..\dbc-forge\packages\core` → `file:./vendor/dbc-forge/packages/core`
4. Update CI to `git submodule update --init --recursive` before `pnpm install`
5. Update the smoke test comment to point at `vendor/dbc-forge`

## 4. Scope of v1.7.0 I

Per the recommendation:

1. Add dbc-forge as git submodule at `vendor/dbc-forge/` (no `packages/dbc-forge-bridge/` plumbing — direct file: dep to its own `packages/core`).
2. `package.json` adds `"@dbc-forge/core": "file:./vendor/dbc-forge/packages/core"`.
3. `.gitmodules` records the submodule binding (pinned tag v0.1.0).
4. CI install step: `git submodule update --init --recursive` before `pnpm install`.
5. **Smoke test** in `src/__tests__/dbcForgeBridge.smoke.test.ts`:
   - Import `@dbc-forge/core`
   - Parse a 1-frame DBC string, assert frame/messages parsed
   - Round-trip via the writer, assert byte-stable output
6. **No production code yet** that uses dbc-forge. v1.7.0 I = plumbing only.
7. Update `docs/architecture.md` (or `docs/superpowers/specs/` entry) with the dependency graph.

## 5. Decisions to Lock

| # | Decision | Default proposal |
|---|----------|------------------|
| D1 | Layout option | A (submodule + file:) |
| D2 | Submodule pin | v0.1.0 tag (current released) |
| D3 | Vendored path | `vendor/dbc-forge/` |
| D4 | Smoke test scope | 1-frame round-trip only |
| D5 | Update frequency | Manual `git submodule update --remote` (no auto-tracking) |

## 6. Out of Scope (deferred)

- DBC ↔ ARXML bridging logic (v1.8.0+)
- Com/DbCom BSWMD generation from DBC (v1.8.0+)
- dbc-forge npm publish (separate project)
- Real bidirectional sync between AutosarCfg project and .dbc files (v1.8.0+)
- Option B monorepo migration (only if v1.7.x experiment shows friction)

## 7. Risks

- **R1**: dbc-forge ships breaking changes between v0.1.0 and v0.2.0 → file: dep rebuild will fail. Mitigation: submodule pin to v0.1.0 tag, bump explicitly.
- **R2**: Windows path quirks with file: deps (we saw `--loader` issue with A+C bin per A+C-5 commit). Mitigation: smoke test in CI must run on Windows too.
- **R3**: Submodule init forgotten by a contributor → silent failure. Mitigation: README + onboarding doc updated; CI fails loudly if submodule not present.

## 8. Acceptance Criteria (v1.7.0 I ships when)

- [ ] `git submodule status` shows dbc-forge at v0.1.0
- [ ] `pnpm install` resolves `@dbc-forge/core` from `vendor/dbc-forge/packages/core`
- [ ] `npx vitest run` shows new smoke test passing
- [ ] CI workflow file (if exists) includes submodule init step
- [ ] Release notes mention v1.7.0 I = "add dbc-forge as vendored dep"

## 9. Next Step

User picks D1 (A / B / C) and approves D2-D5. Then implementation plan is written.