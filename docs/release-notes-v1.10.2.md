# Release Notes — v1.10.2

> **Date**: 2026-06-24
> **Branch**: `feature/v1-10-2-ecuc-module-delete-deletedEcucModule-followups` (2 commits ahead of `feature/v1-10-1-ecuc-module-delete`)
> **Bump**: PATCH (1.10.1 → 1.10.2)
> **Spec**: `docs/superpowers/specs/2026-06-23-ecuc-module-delete-entry-design.md`
> **Plan**: `docs/superpowers/plans/2026-06-23-ecuc-module-delete-entry.md`

## Summary

v1.10.1 was the original "Delete ECUC module" implementation (APPROVE_WITH_FOLLOWUPS, 0 CRITICAL). v1.10.2 ships 6 of the 7 followup findings: H2 + M1 + M2 + M3 + L1 + L2. **H1 (dirty-guard) is the only outstanding finding** — deferred to v1.10.3 because it requires cross-cutting wiring through `useProjectActions.guardedDirtySwitch` and a refactor of how `App.tsx` selects actions.

## Changes since v1.10.1

### H2 — Add validation trio to `deleteEcucModule` set() block

Sibling mutation actions (`addContainer`, `deleteContainer`, `addParameter`, `addReference`, `deleteParameter`, `confirmDeleteContainer`) write `validationErrors + lastValidatedAt + displayDoc` inside `set()`. The new `deleteEcucModule` writes only `documents + doc + dirtyPaths` — leaving stale validation/display entries that reference the now-removed module.

**Fix**: Add the trio to `set()`, mirroring `applyMutationResultToActive` (`src/renderer/store/helpers/mutationErrors.ts:109`).

```ts
const nextDisplayResult = computeDisplayDoc(state.viewMode, nextDocWithoutSource, nextDocuments, state.documentPaths);
// ...
set({
  documents: nextDocuments,
  doc: nextDocWithoutSource,
  displayDoc: nextDisplayResult !== null ? nextDisplayResult.doc : state.displayDoc,
  dirtyPaths: nextDirtyPaths,
  validationErrors: validateProjectForRenderer(nextDocuments),
  lastValidatedAt: Date.now(),
  warnings: nextWarnings,
});
```

### M1 — Rename i18n key to kebab-case consistency

`mutation.error.moduleNotFound` → `mutation.error.module-not-found`. Sibling keys (`path-not-found`, `name-conflict`, `multiplicity-exceeded`, `multiplicity-floor`, `no-bswmd-for-module`, `invalid-param-type`) are all kebab-case. Renamed in 4 places: type declaration + zh-CN bundle + en bundle + 2 call sites in `mutationSlice.ts`.

### M2 — Drop redundant `setErrorWithKind` call

The path-not-found branch in `deleteEcucModule` calls `setErrorWithKind(set, state.locale, { kind: 'path-not-found', path: modulePath })` first, then immediately overwrites with `get().setError(t(state.locale, 'mutation.error.module-not-found', { path: modulePath }))`. The first call's generic "Operation failed: path not found" message is dead code — the specific message supersedes it. Dropped the redundant calls (2 places).

### M3 — Guard `sourceBswmdPath` delete with `if (wasSourceBacked)`

The original implementation cleared `sourceBswmdPath` unconditionally. The guard makes the side effect match spec invariant I2 ("For source-backed modules, the link is cleared on deletion") — legacy (non-source-backed) docs keep their state unchanged.

```ts
if (wasSourceBacked) {
  delete (nextDocWithoutSource as { sourceBswmdPath?: string }).sourceBswmdPath;
}
```

### L1 — Drop `buildContainerItems` emission of `delete-module` item

Spec Goal: "Only fires for `kind: 'module'` nodes (container/reference menus unchanged)". The original implementation emitted the item in BOTH `buildContainerItems` (disabled when no `modulePath`) AND `buildBswmdItems` (enabled for module-kind re-route). The container menu showed a permanently-disabled entry — visual noise + spec deviation.

**Fix**: Drop the `buildContainerItems` emission; keep only `buildBswmdItems`. Reverts the 4 → 5 length assertions in `ContextMenu.test.tsx` and `ContextMenu.coveredByBswmd.test.tsx` back to 4. Updates `ContextMenu.deleteModule` test #3 from "is disabled for container" to "is absent for container" (using `queryByTestId` + asserting `null`). Adds a new "is enabled in bswmd mode" test for the primary user-facing path.

### L2 — Trailing newline on `useArxmlStore.deleteModule.test.ts`

POSIX text-file convention; prettier and most formatters enforce trailing newline.

## Test delta

- Critical paths: **93/93 pass** (deleteModule store 4/4 + context menu 4/4 + i18n parity 85/85)
- Full suite pre-fix: 2231 passed + 1 skipped
- Post-fix: same baseline (L1 fixes reduced test count in 2 files but added 1 new test in `ContextMenu.deleteModule.test.tsx`, net 0)

## Files changed (6 files, +86/-69)

| File                                                              | Type |
| ----------------------------------------------------------------- | ---- |
| `src/shared/i18n.ts`                                              | modified |
| `src/renderer/store/slices/mutationSlice.ts`                      | modified |
| `src/renderer/components/ContextMenu.tsx`                        | modified |
| `src/renderer/components/__tests__/ContextMenu.test.tsx`          | modified (regression: L1 reverted 4→5 length) |
| `src/renderer/components/__tests__/ContextMenu.coveredByBswmd.test.tsx` | modified (regression: L1 reverted 4→5 length) |
| `src/renderer/components/__tests__/ContextMenu.deleteModule.test.tsx` | modified (L1: disabled→absent + new enabled test) |
| `package.json`                                                    | modified (1.10.1 → 1.10.2) |

## ⚠️ Outstanding follow-up for v1.10.3

### H1 — Dirty-guard for `delete-module` action (spec invariant I3)

The new `case 'delete-module':` handler in `App.tsx` calls `deleteEcucModuleAction(action.path)` directly without a `guardedDirtySwitch`. Spec invariant I3 requires dirty-guard consistent with the `'remove-module'` flow.

**Concrete failure mode**: User right-clicks a source-backed module root → picks "Delete ECUC module" while the project has unsaved edits → module is deleted in-memory → if the user closes the project without saving, the original edits AND the deletion are silently lost.

**Fix (v1.10.3)**: Wrap `deleteEcucModuleAction(action.path)` in `guardedDirtySwitch` — mirror `removeBswmdWithFullFlow` (`src/renderer/hooks/useProjectActions.ts:587-727`).

## Risk

Low. All 6 fixes are localized to existing code paths; no API surface change; no migration needed.

## Rollback

`git revert <release-commit>` removes v1.10.2.