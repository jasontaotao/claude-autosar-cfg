# v1.10.1 Release Notes (2026-06-24)

See docs/superpowers/specs/2026-06-23-ecuc-module-delete-entry-design.md and docs/superpowers/plans/2026-06-23-ecuc-module-delete-entry.md for design + plan.

## Summary

Restores "Delete ECUC module" context-menu entry lost in Sprint 17 P3 T3.2.

## New behavior

- Right-click a source-backed module root → menu shows BOTH "Remove BSWMD" AND "Delete ECUC module 'Adc'"
- Deletion clears sourceBswmdPath (no dangling chip)
- Localized toast: 已删除 ECUC 模块 'Adc'，BSWMD 链接已断开

## Tests

+4 tests (3 context-menu + 1 store-action). 2231 passed + 1 skipped.

## v1.10.2 backlog (from code review)

- H1: wire dirty-guard in App.tsx handleContextMenuAction
- H2: add validation trio (displayDoc/validationErrors/lastValidatedAt) to set() block
- M1: rename mutation.error.moduleNotFound to mutation.error.module-not-found
- M2: drop redundant setErrorWithKind call
- M3: fix misleading comment on sourceBswmdPath clear
- L1: drop buildContainerItems emission (revert 4→5 length assertions)
- L2: trailing newline on test file

## Risk

Low. New menu item only; Sprint 17 P3 T3.2 re-route widened (adds sibling item), not undone.
