# v1.8.3 — `@dbc-forge/core` git submodule migration

> **Release date**: 2026-06-22
> **Predecessor**: v1.8.2 (Repo housekeeping + v1.6.1+ build fix) SHIPPED 2026-06-22 (HEAD `9091da4`)
> **Type**: PATCH
> **Branch**: `dbc-forge-submodule`
> **Commits since v1.8.2**: 7 (`c47b546` → `2412a42`)

## What's new

This release closes the v1.7.0 §3b TODO: migrate `@dbc-forge/core` from a
sibling-repo `file:` dep to a vendored **git submodule** pinned to a
release tag, so downstream consumers (and CI) don't depend on a developer's
local checkout layout. The submodule ships at `@dbc-forge/core` **v0.1.1**,
which is the first upstream tag that includes the byte-for-byte DBC
round-trip CM_ dedup fix (commit `4f6f300`).

### Why a submodule and not a `file:` dep?

v1.7.0 originally shipped with `file:../dbc-forge/packages/core` (sibling
repo) because `git submodule add` was unreachable when github.com was
firewalling the user's network on 2026-06-21. The sibling-repo path works
locally but breaks every downstream scenario where the sibling layout
isn't reproduced (CI on a fork, a clean install on a contributor's
machine, a release tarball). v0.1.1 is now publicly tagged on github.com,
so the submodule can resolve reliably from any environment with normal
GitHub access.

### Dependency pointer

| Layer | v1.7.0 / v1.7.1 / v1.7.2 / v1.7.3 | v1.8.3 |
|---|---|---|
| `package.json` | `file:../dbc-forge/packages/core` (sibling) | `file:./vendor/dbc-forge/packages/core` |
| `pnpm-lock.yaml` | `file:../dbc-forge/packages/core` | `file:vendor/dbc-forge/packages/core` |
| `.gitmodules` | (absent) | `vendor/dbc-forge → https://github.com/jasontaotao/dbc-forge.git` |
| Submodule pin | n/a | `eb1bc8b` (tag `v0.1.1`) |

### CI now initializes submodules

`.github/workflows/ci.yml` adds `submodules: recursive` to all 5 jobs
(lint / type-check / test / coverage / build). Without this, CI would
clone an empty `vendor/dbc-forge/` and `pnpm install --frozen-lockfile`
would fail with an unfriendly 404. Verified: CI's `actions/checkout@v4`
is documented to support this exact invocation; the submodule repo is
public, so no auth is required.

### Lint and format exclusions for `vendor/`

`.eslintignore` + `.eslintrc.cjs` `ignorePatterns` + `.prettierignore`
all gain a `vendor/` entry. Submodules lint and format themselves; we
must not double-process them on `pnpm lint` or `pnpm format:check`
(stage 1 of `pnpm verify`).

### Smoke test fixture corrected to canonical DBC

The v1.7.0 dbc-forge smoke test used the bare-token form:

```
BA_ "NodeLayerModules" 5 ECU1;
```

Without an explicit `BU_`/`BO_`/`SG_` target-ref prefix, `parseBaTargetRef`
falls through to the network-level branch and `coerceAttrValue` treats
`5 ECU1` as a single STRING. The writer then emits
`BA_ "NodeLayerModules" BU_ "5 ECU1";`, which reparses to the same lossy
string — so `deepEqualNetwork` returned `true`, but only because the
parser was faithfully round-tripping a lossy coercion, not because the
actual node attribute survived. The canonical Vector CANdb++ / EB
tresos / ETAS form is:

```
BA_ "NodeLayerModules" BU_ ECU1 5;
```

which carries the target-ref explicitly. v1.8.3 switches the fixture to
the canonical form so the test now proves actual round-trip fidelity.
Added a comment in the test explaining the bare-token ambiguity so
future readers don't re-introduce the old form. The previous
`deepEqual: true` was technically correct but tested lossy coercion
behavior, not the fidelity the test's name and docstring claim.

**No production code touched.** The dbc-forge parser/writer behavior is
unchanged from v0.1.1; this is purely a test fixture correction. The
fixture also gains a `BA_DEF_DEF_ "NodeLayerModules" 0;` line which the
v0.1.0 parser tolerated by defaulting to `0` and the v0.1.1 strict
validator would flag as missing.

### Why v0.1.1 and not v0.1.0?

v0.1.0's `writeDbc` (commit `7f6eb93`) predates commit `4f6f300
'fix(writer): dedup CM_ by scope+target+text and emit from per-object
comments'`, which is the actual v0.1.1 source delta. The CM_ dedup
behavior matters for any DBC whose `CM_` lines use the same long text
across 20+ messages (a Vector data-dictionary idiom) — without the fix,
57/205 `CM_` lines silently vanish during a DBC→Network→DBC round-trip.
v0.1.1 = v0.1.0 + `4f6f300` + `7f82d75` (GBK decode in CLI) + prettier +
CHANGELOG. The v0.1.0 `BA_` value-formatting behavior is unchanged in
v0.1.1 (the parser strictly requires the target-ref prefix per the DBC
spec; the canonical fixture in this release matches that).

## Internal changes

- `.gitmodules` (new, 3 lines): submodule entry.
- `vendor/dbc-forge` (gitlink, 1 line): pointer to commit `eb1bc8b`.
- `.eslintignore` (+3 lines): `vendor/` exclusion.
- `.eslintrc.cjs` (1 line): `ignorePatterns` adds `vendor/`.
- `.prettierignore` (+3 lines): `vendor/` exclusion.
- `.github/workflows/ci.yml` (+10 lines): `submodules: recursive` on all
  5 jobs.
- `package.json` (1 line): `@dbc-forge/core` `file:` path.
- `pnpm-lock.yaml` (regenerated): `file:` directory resolution.
- `src/__tests__/dbcForgeBridge.smoke.test.ts` (+12 / -4 lines):
  canonical `BA_` syntax in fixture; comment explaining the bare-token
  ambiguity.

## Test count delta

**+0 tests** — the 7 commits touch only dependency plumbing, CI config,
tooling exclusions, and the smoke-test fixture. Test count holds at
**2097 pass + 1 skip** (v1.8.2 baseline).

## Spec / Plan / Reviews

- No spec / plan for this release (cleanup of v1.7.0 §3b TODO).
- Code review (`code-reviewer` agent, whole-branch diff vs `main`):
  **APPROVE_WITH_NOTES** — 0 Critical / 0 High / 0 Medium / 1 Low.
- Local `pnpm verify` (all 7 stages): format ✓ / lint ✓ / type-check ✓ /
  test (2097 pass + 1 skip) ✓ / coverage (2097 pass + 1 skip) ✓ / build
  (main 358.71 kB / preload 2.44 kB) ✓ / import-regression (2/2) ✓ /
  EXIT=0.

## Known issues (carry-over, not blockers)

- **M1 (LOW, carry from v1.8.1)**: `.error-banner-action` CSS class has no
  specific rule; the Undo button currently inherits from `.error-banner-btn`
  (same visual as copy/dismiss). Deferred from v1.8.2.
- **CSS @import ordering** (pre-existing): `index.css` has an `@import`
  that follows a comment, triggering a Vite warning. Cosmetic.
- **Chunk size** (pre-existing): renderer bundle 837.88 kB (>500 kB
  warning threshold). Code-splitting deferred to a future MAJOR.
- **`README.md` contributor onboarding** (LOW, new from code-review):
  first-time contributors running `git clone` without `--recurse-submodules`
  on this release will get an empty `vendor/dbc-forge/` and a
  pnpm-install 404. Deferred to v1.8.4 (one-line addition).
- **3 pre-existing TS2322** in `src/__tests__/removeBswmd.fullFlow.test.tsx`
  (carried since v1.7.1). Deferred.

## Why PATCH and not MINOR?

No new feature, no API change, no schema change. The submodule migration
was the v1.7.0 §3b TODO and the v1.7.4 TODO — both explicitly marked
"deferred". The smoke-test fixture correction is a test-side fix (no
production behavior change). The lint/format/CI exclusions are
build-system plumbing, not user-facing. v1.8.2 consumers see no behavior
change other than the dependency resolution path.