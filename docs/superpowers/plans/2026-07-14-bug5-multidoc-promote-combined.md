# Bug 5 PATCH: openProject auto-promotes viewMode='combined' on multi-doc open

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `openProject` resolves the manifest bundle and ends up with 2+ value-side ARXML docs,
the store auto-promotes `viewMode` from the default `'single'` to `'combined'` so the Tree shows
all docs' module roots (the user-reported "Tree shows only 2 of 8 root modules" Bug 5 is fixed).

**Architecture:** One mutator in `projectSlice.openProject` gains a guard:

```
if (orderedDocuments.length > 1 && viewMode would land on 'single') setViewMode('combined')
```

The promote reuses `setViewMode` from `uiSlice` so all consumers (Tree, FileListTab, warnings
slice, selectedPath reset) stay in sync. No new IPC, no new file, no new dependency.

**Tech Stack:** TypeScript 5.6 + React 19 (Zustand store in renderer only).

## Global Constraints

- **No 746+ test baseline regression** — `pnpm verify` 8-stage GREEN before AND after. The
  current `viewMode: 'single'` default at `src/renderer/store/slices/uiSlice.ts:148` MUST stay
  `'single'`; promote is per-openProject call only, not a global default change.
- **Combined-mode lockout** — if `state.importSession !== null`, do NOT promote (the user is
  in an import-merged flow; `setViewMode('combined')` would be rejected by the existing
  three-state guard at `src/renderer/store/slices/uiSlice.ts:189-194`). Skip promote silently
  in that case (no toast — the user explicitly chose import-merged).
- **i18n parity required** — any new user-facing string must appear in BOTH
  `src/shared/i18n.en/app.ts` AND `src/shared/i18n.zh-CN/app.ts` with a parity test.
  (For this task: I expect NO new i18n key — promote is silent. Verify before declaring done.)
- **No mutation dispatch from a setter** — `openProject` already calls `set(...)` once at the
  end; do NOT split into two `set(...)` calls. Compute the target `viewMode` first, then call
  `computeDisplayDoc` and `set` ONCE with the resolved viewMode already in the payload.
  Actually: `setViewMode('combined')` after the openProject `set(...)` would force a second
  store update — preferable for keeping the openProject reducer atomic. Pick atomic-via-second-
  set-if-pure; document the choice.
- **`@core/arxml/path` untouched** — no path-lookup changes; combined-mode path lookup already
  supports multi-doc via `findByPathMultiDoc` flat-mode fallback (combinedDoc.ts line 393-407).
- **Git: `main` branch** — worktree-less; commit ON `main` directly. Session pattern (per
  Phase P1 ship at `4f1ed8c`).
- **No commits to remote other than `main`**, push AFTER local review (user pre-review gate per
  session 245).

## Task Decomposition

### Task 1: openProject viewMode promote

**Files:**

- Modify: `src/renderer/store/slices/projectSlice.ts:88-265` — `openProject` reducer body.
  Insert promote logic AFTER `computeDisplayDoc` (line 210-216) and BEFORE the final `set(...)`
  block (line 218-264). Resolve the desired `viewMode` first, attach it to the single `set(...)`
  payload — no second set call.
- Test: `src/renderer/store/__tests__/useArxmlStore.openProject-bswmd.test.ts` — add 4 it()
  cases after the existing `'keeps error null when the IPC bundle matches every manifest entry'`
  test (line 313-350).

**Interfaces:**

- Reads: `get().viewMode`, `get().importSession`, `orderedDocuments.length`.
- Reads (BSWMD context, just for the existing `setError` shape; unchanged).
- Writes: single `set({ ..., viewMode: <resolved> })` payload. The existing 18 keys in the
  `set({...})` block at line 218-264 stay verbatim; add `viewMode` as the 19th.

**Inputs / outputs (what `'single'` vs `'combined'` looks like in test):**

- `'single'` (the existing default at uiSlice.ts:148) — displayDoc is `foldVendorPackages(activeDoc, schemas)`.
- `'combined'` — displayDoc is `foldVendorPackages(buildCombinedDocument(documents, filePaths).doc, schemas)`.
  Already implemented; the test just needs to assert which branch ran.

**TDD flow (RED → GREEN → IMPROVE):**

1. **RED — write the 4 failing tests first.**
   - Test A: "promotes viewMode to 'combined' when orderedDocuments.length > 1".
     Arrange: `valueArxmlPaths` references 2 distinct ECUC files; IPC bundle delivers both.
     Act: `openProject({...})`.
     Assert: `state.viewMode === 'combined'` (default `'single'` should have flipped).
   - Test B: "leaves viewMode at 'single' when only 1 doc is in the bundle".
     Arrange: `valueArxmlPaths` references 1 file; IPC delivers 1.
     Act: `openProject`.
     Assert: `state.viewMode === 'single'`. (Snapshot the previously-set viewMode first.)
   - Test C: "does NOT promote when importSession is active (combined-mode lockout)".
     Arrange: pre-set `state.importSession = { ... }` (any truthy placeholder; type is
     `unknown` unless you import the real type — use the real type from
     `src/renderer/store/types.ts` or wherever it's declared, look it up).
     Setup: import 2+ docs.
     Act: openProject.
     Assert: `viewMode` stays as it was (still whatever `importSession` requires; pre-set it
     to `'import-merged'` so the assertion is concrete).
   - Test D: "re-promotes to combined on second openProject after importSession is cleared".
     Arrange: importSession = null at start; open with 2 docs (becomes combined); reset
     importSession back to null + viewMode to 'single' via `setViewMode('single')`; open
     again with 2 docs. Assert: re-promotes.

2. **GREEN — minimal patch in `openProject`.**
   Insert just before the final `set({...})`:

   ```ts
   // Bug 5 — promote viewMode='combined' when the open bundle holds
   // 2+ value-side docs. Pre-fix the Tree only rendered
   // `documentPaths[0]`'s root package in single-mode (computeDisplayDoc
   // line 79-90), so users importing 8 ECUC files saw 1 module. The
   // combined view already routes the path lookup through
   // `findByPathMultiDoc` (combined flat fallback at combinedDoc.ts
   // line 393-407), so promoting viewMode is sufficient — no path or
   // mutation changes needed. Skip when an import session is active
   // (the three-state guard at uiSlice.ts:189-194 would reject the
   // 'single'->'combined' flip; respect the user's explicit choice).
   const wantCombined =
     orderedDocuments.length > 1 && get().viewMode === 'single' && get().importSession === null;
   const resolvedViewMode: 'single' | 'combined' | 'import-merged' = wantCombined
     ? 'combined'
     : get().viewMode;
   const finalDisplayResult = computeDisplayDoc(
     resolvedViewMode,
     activeDoc,
     orderedDocuments,
     orderedPaths,
     get().bswmdSchemas,
   );
   ```

   Then change the existing `set({...})` (line 218) to include:
   - `viewMode: resolvedViewMode` (additive new key)
   - `displayDoc: finalDisplayResult?.doc ?? null` (replace the existing one keyed on
     `get().viewMode`)

   The `warnings:` key (line 237-240) already keys on `get().viewMode`; change to
   `resolvedViewMode` — when promoting, this is the combined-mode warnings slice that
   matters.

3. **IMPROVE — re-run the existing 5 tests in the file.**
   The 5 existing `it()` cases at lines 139-311 don't assert viewMode directly except the
   multi-doc `viewMode-combined` assertions that were removed in `9b1b2c7`. Confirm those
   tests stay GREEN; the promote branch should be no-op for them (they pass 0 docs or 1 doc).
   Watch the `setErrorWithKind` callback at line 153 and 211 — both reference
   `get().viewMode` for the warnings slice computation; check they didn't get rekeyed by
   accident.

4. **Verify commands before commit:**
   - `pnpm tsc --noEmit` — clean.
   - `pnpm vitest run src/renderer/store/__tests__/useArxmlStore.openProject-bswmd.test.ts` —
     new 4 tests + existing 5 = 9 PASS.
   - `pnpm verify` (8-stage) — GREEN.
   - Count: 9 → expected 3199 + 7 SKIP / 0 fail (was 3190 + 7 SKIP before patch).

5. **Commit on `main`:**
   - Message body: explain promote rationale + cite Bug 5 user report.
   - Use `git commit -F` with a file or here-doc (`bash` parses `_[0-9]+$` segments badly as
     commands inside `-m`); use temp file `git commit -F .git/COMMIT_EDITMSG_TEMP`.

6. **Push to origin after local review:**
   - `git push origin main` ONLY after the user has reviewed the diff (session 245
     protocol).

### Task 2 (review only)

No separate reviewer subagent per session 245 protocol. After commit, run `pnpm verify`
once more and read the diff visually with `git log -p HEAD~1..HEAD`. Document the
lesson-candidate observation in vault pkm-capture (deferred to user — not part of this plan).

## Self-Review

- **Spec coverage:**
  - [x] Single doc: viewMode stays 'single' (Test B).
  - [x] Multi doc: viewMode='combined' (Test A).
  - [x] Import session lockout: skip promote (Test C).
  - [x] Re-promote after import cleared (Test D).
- **Placeholder scan:** None ("TBD"/"later"/"similar to...").
- **Type consistency:** `resolvedViewMode` typed as the existing 3-state union from
  `uiSlice.ts:43`. Reuses `set({...,viewMode: resolvedViewMode})` slot — same field.
- **One set call:** `openProject` keeps its single `set(...)`; promote logic is purely
  pre-set computation. No `setViewMode` invoked from inside `openProject` (would create
  a second store update + side effects from `setViewMode` that we don't want here, like
  the `warnings` reset that's keyed on its own viewMode).
- **No global default change:** `uiSlice.ts:148` is untouched.

## Acceptance Criteria

- 4 new tests PASS, 3190 + 7 SKIP baseline becomes 3199 + 7 SKIP.
- `pnpm verify` 8-stage GREEN.
- `viewMode` field default unchanged in `uiSlice.ts`.
- Single-doc openProject behavior unchanged (no regression).
- Multi-doc openProject surfaces all docs in Tree (manual smoke — `pnpm dev` + open a
  2-doc project; user confirms after commit).

## Out of Scope (explicit)

- Bug 4 (CanIfHrhCfg_1 collection fold) — separate PATCH.
- Package version bump (1.54.2 → 1.54.3) — deferred to user after the commit lands;
  release-checklist will then drive a docs commit + tag.
- PKM vault capture — deferred per session 245 throttling rule.
