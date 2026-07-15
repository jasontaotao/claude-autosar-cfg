# v1.54.4 — dBC-Apply Tree Display (PATCH)

**Released:** 2026-07-15
**Tag:** [`v1.54.4`](https://github.com/jasontaotao/claude-autosar-cfg/releases/tag/v1.54.4)
**Cycle type:** PATCH (store-hydrate display fix; no IPC, no schema, no backend change)
**Ship basis:** 2 commits — 1 source fix + 1 version bump

## Summary

Closes the user-reported "导入 dBC 后 com/canif/pdur 容器未更新" UX gap
from 2026-07-15. The user saw a 1-of-N module render in the Tree after
a dBC apply + reload — actually 1 of 3 modules, not a "project closed"
state. Root cause was a stale-reference bug in the store's
`openProject` path: `computeDisplayDoc` was handed
`get().bswmdSchemas` (the *previous* store state, empty on a fresh
open and stale on a reload) instead of the locally-built
`bswmdSchemasOut` (the freshly-parsed bswmds from *this* openProject
call).

The downstream effect: `foldVendorPackages` could not identify the
`AUTOSAR_R22` / `EcucDefs` generic vendor wrappers as foldable (it
needs the inner module shortNames in the bswmd set as a positive gate).
Without the fold, the 3 ECUC value-side docs each kept their
`AUTOSAR_R22` root shortName, and the Sprint 17c T10 dedup pass in
`buildCombinedDocument` collapsed 3-of-3 to 1. The user saw one
module where the project has three.

Fix: pass `bswmdSchemasOut` (the value also being written to the
store payload via `set({ bswmdSchemas: bswmdSchemasOut, ... })`) into
`computeDisplayDoc`. The display path now sees the same bswmd set as
the persisted state, so fold + dedup are consistent.

**Zero IPC change. Zero backend change. Zero schema change.**

## Commits

| # | Commit | Title |
|---|---|---|
| T1 source fix | `63459bd` | `fix(store): use locally-built bswmdSchemasOut in openProject's computeDisplayDoc (Bug 7)` |
| T-ship | `c26a2a0` | `chore(release): bump version 1.54.3 → 1.54.4` |

## Decisions

- **D1 use the local `bswmdSchemasOut`, not the stale `get().bswmdSchemas`** — the bug is a stale-reference read; the fix is the locally-built value that already gets persisted via `set({ bswmdSchemas, ... })`. No reorganisation, no separate state.
- **D2 keep `buildCombinedDocument` + `foldVendorPackages` unchanged** — these helpers were correct; the upstream caller was passing the wrong bswmd set. The fix is in the caller, not the helpers.
- **D3 single 1-line surgical change** — `get().bswmdSchemas` → `bswmdSchemasOut`. The fix doesn't touch the dedup logic, the fold regex, the validateProjectForRenderer call, or the set payload. Minimum diff to close the gap.
- **D4 regression test uses the canonical AUTOSAR_R22 > EcucDefs > <module> shape** — matches the user's actual workspace; a non-canonical fixture (e.g. `EcucValues` root) would *also* trigger the dedup bug but the test wouldn't surface the fold path. The canonical shape is the only one that exercises the production code path.
- **D5 keep the existing `useArxmlStore.combined.test.ts` and `useArxmlStore.openProject-bswmd.test.ts` patterns** — the new test follows the same 4-tuple shape (manifest, docs, bswmds, openProject) and uses the existing `sampleManifest` / `useArxmlStore.getState().openProject` calling pattern, not a custom harness.

## User-visible behavior

Before v1.54.4:
- Open a project whose manifest references 3+ ECUC value files in the
  canonical `AUTOSAR_R22 > EcucDefs > <module>` shape
- Apply a dBC import (which writes the 3 Com / CanIf / PduR files
  atomically and triggers `project:reload`)
- Tree shows 1 module shortName (e.g. `Com`) — the post-apply
  `displayDoc.packages` was dedup-collapsed from 3-of-3 to 1-of-1
  because the fold skipped

After v1.54.4:
- Open the same project, apply the same dBC import
- Tree shows all 3 module shortNames (`Com`, `CanIf`, `PduR`)
- Each module shows both the pre-existing container and the
  freshly-mapped dBC container (ComConfig + ComIPdu_0, etc.)

## Test results

- vitest 367 files / **3217 + 7 SKIP / 0 fail** (+2 net from v1.54.3's
  3215 baseline)
- tsc both `tsconfig.json` + `tsconfig.web.json` clean
- `pnpm verify` 8-stage GREEN
- New tests added (session 252):
  - **`useArxmlStore.bug7-dbc-reload-reflects-new-containers.test.ts`** —
    1 test that opens a 3-doc + 3-bswmd project and asserts the
    post-apply `displayDoc.packages` lists all 3 module shortNames
    plus the dBC-mapped containers in each module's children

## Process lessons applied

- **`function-extract-must-clip-verbatim-not-reimplement`** (standalone) —
  the test fixture uses verbatim copies of the `MIN_BSWMD_*` template
  pattern from `useArxmlStore.openProject-bswmd.test.ts`; no
  reimplementation drift.
- **`release-checklist-must-verify-package.json-bump-on-every-version-ship`**
  (standalone) — `package.json` bumped `1.54.3` → `1.54.4` in a
  separate commit (T-ship) per the established v1.54.0+ pattern.
- **`systematic-debugging` Iron Law** (NO FIXES WITHOUT ROOT CAUSE
  INVESTIGATION FIRST) — the fix is not at the symptom (the visible
  1-of-3 dedup). The fix is at the source (the stale `get().bswmdSchemas`
  read in `computeDisplayDoc`).

## NEW 1/3 lesson candidates (awaiting 2 more observations each)

- **`stale-get-state-read-in-pre-set-call-corrupts-derived-display`** —
  the pattern of `computeDisplayDoc(..., get().someField)` (reading
  the *previous* store state during a write cycle) silently produces
  wrong display when the field is updated by the same call. Two
  fixes needed: (a) use the local variable that's about to be
  written, (b) make `computeDisplayDoc` accept the freshly-built
  bswmd set as an explicit parameter so the call site can't reach
  back into `get()` accidentally. This needs 1 more observation
  before promotion to 2/3.
- **`dedup-after-fold-needs-2-piece-bug-prevention-fixture`** —
  the test fixture must use a canonical-shape (foldable) root
  package; an `EcucValues` root would trigger the same dedup
  bug but for a different reason (no fold attempt). The canonical
  shape is the only one that distinguishes the bug from a
  dedup-only failure. Awaits 1 more observation.

## Related documents

- **Bug 6 (v1.54.3)**: `docs/release-notes/v1.54.3/README.md` — the
  preceding PATCH. The Bug 6 fix (`toManifestRelative` takes manifest
  directory, not manifest file path) closed the partition step;
  Bug 7 closes the hydrate step.
- **Bug 5 (v1.54.2)**: `docs/release-notes/v1.54.2/README.md` — the
  Sprint 17c T10 / multi-doc promote combined fix. Sprint 17c T10's
  dedup is the reason the un-folded `AUTOSAR_R22` shortName collapses
  3-of-3 to 1-of-1 in Bug 7; without the dedup, the user would have
  seen 3 duplicate modules in the Tree (a different bug).
- **CHANGELOG**: top entry of `CHANGELOG.md`

## Future work (deferred per Bug 4 / Bug 6 closeout)

- **`Bug 4` — `CanIfHrhCfg_1` collection fold** (sessions 245 + 251
  deferred). The `stripSuffix` widening reverted in `9b1b2c7` is the
  candidate next PATCH; needs a separate repro before fix.
- **Single-source `get().X` reads in slice setters** (deferred) —
  any other slice action that calls a helper while building the
  `set(...)` payload should be reviewed for the same
  `stale-get-state-read` pattern. Triage item for the next whole-
  project review.
- **`computeDisplayDoc` parameter tightening** (deferred feature
  work) — instead of `get().bswmdSchemas` as the 5th arg, accept
  `bswmdSchemas: readonly BswmdDocument[]` as a required parameter
  so the call site must be explicit. The current call signature
  works, but a parameter rename would prevent future regressions.

## Manual smoke test (recommended at install time)

1. Open `C:\Users\13777\Desktop\ClaudeAutosarWorkSpace\111.autosarcfg.json`
2. Verify ProjectPanel lists 5 ECUC value files under "值侧 ARXML"
3. Verify Tree renders 5 module roots (e.g. `JWQ3399` / `CanIf` / `CanNm` /
   `Com` / `ComM`) — pre-v1.54.4 this rendered 1
4. Open a DBC file via the dBC import wizard → preview → Apply
5. Verify the 3 Com/CanIf/PduR modules show their dBC-mapped
   containers (ComIPdu_0, CanIfRxPduCfg_0, PduRRoutingPath_0) in
   the Tree without a project reopen
6. Verify the success toast (or `displayDoc.packages` count via
   dev-tools) reports 3 modules — pre-v1.54.4 this was 1
