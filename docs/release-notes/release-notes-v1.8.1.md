# v1.8.1 — Sprint 17 PATCH follow-up

> **Release date**: 2026-06-22
> **Predecessor**: v1.8.0 (K Stencil Wizard) SHIPPED 2026-06-21 (HEAD `2b3e21c`)
> **Type**: PATCH
> **Branch**: `feature/v1-8-0-k-stencil-a`
> **Commits since v1.8.0**: 7 (spec + plan + 5 implementation commits)

## What's new

### Undo for cascade-and-unlink BSWMD remove

Sprint 17's `cascade-and-unlink` dialog option deletes a BSWMD file from disk + its dependent ARXMLs. Until v1.8.1, the `undoLastRemoveBswmd` store action existed but had no UI affordance — a user who immediately regretted had to re-load the BSWMD file from the picker manually.

Now: a success toast with an "撤销" / "Undo" button appears for 8 seconds after a successful unlink. Click it to restore the in-memory schema (the disk file is still gone; use the picker to re-attach).

A **stale-toast defense** prevents undoing the wrong BSWMD: if a newer remove replaces the snapshot, the Undo button surfaces an "撤销失败" / "Undo failed" info toast instead.

### Accessibility: distinct aria-labels for BSWMD vs ARXML remove

- `ContextMenu` "Remove module" item now carries `aria-label` = "移除 BSWMD 'Adc.arxml'" / "Remove BSWMD 'Adc.arxml'" (was just the generic "Remove module" label).
- `ProjectPanel` BSWMD row × button now uses the dedicated `projectPanel.removeBswmdAria` key (was reusing `projectPanel.removeArxmlAria` — the strings happened to read sensibly because the ARXML aria-string is generic, but screen readers now announce a precise description).

## Internal changes

- `ToastState` extended with optional `action: { label, onActivate }` field.
- `setSuccess` signature widened with optional 3rd `action` arg (back-compat for existing 2-arg callers).
- `useProjectActions.removeBswmdWithFullFlow`'s cascade-and-unlink success branch fires the new success toast.
- 4 new i18n keys (3 mutation: `mutation.action.undo` / `mutation.action.bswmdRemoved` / `mutation.action.undoFailed`; 1 projectPanel: `projectPanel.removeBswmdAria`).
- No new dependencies. No new IPC. No new source files.

## Test count delta

**+11 tests** across 4 files:

- `ErrorBanner.test.tsx`: +4 (action button render / absence / click invokes onActivate / no auto-dismiss)
- `useProjectActions.removeBswmd.test.ts`: +3 (success toast with Undo action / fresh Undo restores schema / stale Undo fires undoFailed info)
- `ContextMenu.removeModule.test.tsx`: +2 (aria-label zh-CN + en)
- `ProjectPanel.test.tsx`: +2 (BSWMD × button uses `removeBswmdAria` zh-CN + en, with negative assertion against ARXML markers)
- `FileListTab.test.tsx`: +0 (correctly identified as ARXML × button, no change needed)

Total: 2033 (v1.8.0 K Stencil baseline) + ~64 (K Stencil additions) + 11 (PATCH) = **~2108** — actual measured: 2097 passed + 1 skipped on HEAD `a37ec91`.

## Spec / Plan / Reviews

- Spec: `docs/superpowers/specs/2026-06-22-v1-8-0-patch-sprint17-undo-aria-design.md`
- Plan: `docs/superpowers/plans/2026-06-22-v1-8-0-patch-sprint17-undo-aria.md`
- 5 per-task reviews: all APPROVED (2 minor + 3 deviations adjudicated in implementer's favor)
- Final whole-branch review (Fable 5): **SHIP** (0 CRITICAL / 0 HIGH / 0 MEDIUM / 1 LOW carry-over)

## Known issues (carry-over, not blockers)

- **M1 (LOW)**: `.error-banner-action` CSS class has no specific rule; the new button currently inherits from `.error-banner-btn` (same visual as copy/dismiss). Optional follow-up in v1.8.2 to add a distinctive color if product wants to highlight Undo.
- **Pre-existing build issue (NOT a PATCH regression)**: `pnpm build` fails on `vite.main.config.ts` with "Rollup failed to resolve import `@shared/i18n` from i18nSlice.ts". Verified pre-existing on v1.8.0 release commit `2b3e21c` (also fails without PATCH). Renderer build, tests, lint, and type-check all pass. To be addressed separately (likely Vite main-bundle ESM resolution config fix).
