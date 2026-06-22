# v1.8.2 — Repo housekeeping + v1.6.1+ build fix

> **Release date**: 2026-06-22
> **Predecessor**: v1.8.1 (Sprint 17 PATCH follow-up) SHIPPED 2026-06-22 (HEAD `a37ec91`)
> **Type**: PATCH
> **Branch**: `main`
> **Commits since v1.8.1**: 6 (`8b6dcf5` → `9d36108`)

## What's new

This is a pure housekeeping release — no new feature, no API change, no schema
change. v1.8.1 release notes flagged one pre-existing build issue (the
`pnpm build:main` regression introduced in v1.6.1) and the repo had piled up
~14 root-level `release-notes-v*.md` files plus a 198 KB `PROGRESS.md` since
the v0.8.0 README was last written. v1.8.2 closes both, and also catches the
project up to the current prettier config.

### Main-process build fix (closes v1.6.1–v1.8.1 regression)

v1.6.0 K-Stencil's `src/main/ipc/stencilHandler.ts` transitively pulled
`core/sws-validator/engine.ts` into the main bundle, which imports
`@shared/i18n` for `DEFAULT_LOCALE` / `t()`. The renderer config and
`tsconfig.json` paths both resolved the alias, but `vite.main.config.ts` did
not — so `pnpm build:main` failed with `Rollup failed to resolve import
"@shared/i18n"`. The v1.8.1 release notes documented this as a pre-existing
issue and deferred it. v1.8.2 closes it by adding the two `resolve.alias`
entries to `vite.main.config.ts` (matching the renderer config). Verified: all
3 Vite build stages pass; main bundle 358.71 kB.

### Repo layout tidy-up

- 16 `release-notes-v*.md` files (v1.0.0 through v1.8.1, plus the two that
  were already in `docs/`) consolidated into a single
  `docs/release-notes/` directory. The root now only carries files that ship
  with every install (README, CHANGELOG, LICENSE, package.json, the configs).
- `PROGRESS.md` (198 KB internal sprint log, contains an absolute local path
  `D:\claude_proj2\...`) moved into
  `docs/superpowers/archive/PROGRESS.md` alongside the previously-archived
  v1.6.0–v1.8.0 specs and plans. The file is preserved as historical record;
  the path leak is left intact because archive content is historical.
- `README.md` rewritten in Chinese (replacing the stale v0.8.0 English
  version). Documents the v1.0–v1.8 feature set in milestone groups, the
  7-stage verify pipeline, the post-v1.3 `src/` layout, and the
  `docs/release-notes/` / `docs/superpowers/archive/` doc tree.

### Prettier catch-up

34 source/test files (Stencil wizard family, AppHeader, useProjectActions,
palette, ecucSlice, the e2e stencil-wizard spec, several configs) reformatted
to current prettier config. Diff is whitespace only: 63 insertions / 74
deletions. Frozen historical docs (release notes, archived specs/plans)
added to `.prettierignore` so `pnpm format:check` does not re-flow the
historical record.

## Internal changes

- `vite.main.config.ts`: `resolve.alias` for `@core` and `@shared`
  (16-line addition).
- `.prettierignore`: 6-line addition listing `docs/release-notes/**` and
  `docs/superpowers/archive/`.
- No new dependencies. No new IPC. No new source files. No new test files.

## Test count delta

**+0 tests** — the 6 commits touch only build config + docs + format
whitespace. Test count holds at **2097 pass + 1 skip** (v1.8.1 baseline).

## Spec / Plan / Reviews

- No spec / plan for this release (housekeeping only).
- Self-review: 0/0 critical/high/medium/low. Build-system change is
  additive; the two doc moves are pure renames (100% git rename detection
  on the release-notes batch, 100% on PROGRESS.md); the README rewrite
  is content-equivalent to the English version modulo the language switch
  and the v1.x version-number updates; the format drift is whitespace only.

## Known issues (carry-over, not blockers)

- **M1 (LOW, carry from v1.8.1)**: `.error-banner-action` CSS class has no
  specific rule; the Undo button currently inherits from `.error-banner-btn`
  (same visual as copy/dismiss). Optional follow-up in v1.8.3.
- **CSS @import ordering** (pre-existing): `index.css` has an `@import` that
  follows a comment, triggering a Vite warning. Cosmetic; not in scope for
  this PATCH.
- **Chunk size** (pre-existing): renderer bundle 837.88 kB (>500 kB warning
  threshold). Code-splitting deferred to a future MAJOR.

## Why PATCH and not MINOR?

No new feature, no API change, no schema change. The vite alias addition
is the missing piece of the v1.6.1 K-Stencil wiring that the v1.8.0 release
should have shipped with; the docs moves + README rewrite are pure repo
layout. v1.8.1 consumers see no behavior change.
