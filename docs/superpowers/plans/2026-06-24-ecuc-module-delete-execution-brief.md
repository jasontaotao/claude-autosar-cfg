# ECUC Module Delete Entry — Execution Brief (drift from 2026-06-23 plan)

> **For subagents:** This file supplements
> `docs/superpowers/plans/2026-06-23-ecuc-module-delete-entry.md` with
> drift corrections against current code at HEAD `3b185aa`
> (feature/v1-9-1-ecucdefs-fold). Read both before starting.

---

## Drift table — line refs from plan → reality

| Plan says                                                         | Reality at HEAD `3b185aa`                                                                                                                                                                  | Note                                                                                                                                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/i18n.ts` zh 933-940                                   | zh-CN keys at lines 933-940 — exact match                                                                                                                                                  | Insert new keys AFTER line 940 (`mutation.action.undoFailed`) and BEFORE line 941 (`mutation.action.deleteReferenceNotImplemented`)                                                               |
| `src/shared/i18n.ts` en 1437-1444                                 | en keys at lines 1437-1450 (`removeModuleAria` at 1443, `bswmdRemoved` at 1447, `undoFailed` at 1448, `deleteReferenceNotImplemented` spans 1450-1451)                                     | Insert new keys AFTER line 1451 and BEFORE `'confirm.cascade.title'`                                                                                                                              |
| `src/renderer/components/ContextMenu.tsx` 47-51                   | ContextMenuTarget at 47-51 — exact match                                                                                                                                                   | Add `modulePath?: string` field on line 51                                                                                                                                                        |
| `src/renderer/components/ContextMenu.tsx` 60-66                   | ContextMenuAction union at 60-66 — exact match                                                                                                                                             | Extend the union on line 66 (after `remove-module`)                                                                                                                                               |
| `src/renderer/components/ContextMenu.tsx` 248-287                 | `buildContainerItems` at 248, `delete-container` item at 280-284                                                                                                                           | Insert new `delete-module` item BEFORE line 280 (before `delete-container`); the range grew to 248-289 with the `remove-module` Sprint 17 item                                                    |
| `src/renderer/components/tree/TreeNode.tsx` 182-218               | module-kind re-route at lines 182-217 (line 218 is closing `}`)                                                                                                                            | Update re-route to add `modulePath: path` to the `openContextMenu` target on line 206-214                                                                                                         |
| `src/renderer/App.tsx` 329-370                                    | `handleContextMenuAction` at 329-377 (extended to include `remove-module` case + dep array)                                                                                                | Add new `case 'delete-module':` branch after line 367 (the existing `case 'remove-module':` block); pull the new action at the top alongside other store hooks                                    |
| `src/renderer/store/useArxmlStore.ts` (single file, plan assumed) | **Plan assumes monolithic file but it's now a 158-line facade. The actual `deleteContainer` lives in `src/renderer/store/slices/mutationSlice.ts:128`**                                    | **Add `deleteEcucModule` to `mutationSlice.ts` in the `createMutationSlice` factory, NOT to `useArxmlStore.ts`**. The facade re-exports the slice automatically.                                  |
| `findByPath(doc, modulePath)` — plan says "likely already exists" | Exists at `src/core/arxml/path.ts:64`. Import as `import { findByPath } from '@core/arxml/path.js';`                                                                                       | No change                                                                                                                                                                                         |
| `removeModuleFromDoc(doc, modulePath)`                            | Does NOT exist — plan correctly says to add                                                                                                                                                | Add as a private helper in `mutationSlice.ts` (or `src/core/arxml/mutation.ts` if it's pure). Prefer `mutation.ts` since it's a pure transform — keeps `mutationSlice.ts` focused on store wiring |
| `setInfo` / `setError`                                            | Exist in `uiSlice.ts:263/286`. The `setErrorWithKind(set, locale, ...)` helper is the canonical toast-with-error-kind path (used by `deleteContainer` already at `mutationSlice.ts:67-73`) | Use `setErrorWithKind` for error paths; use `setInfo` (which dispatches to toast with `'info'` kind, 3s autoDismiss by default) for success toasts                                                |

---

## Slice composition (PR(5) reference)

`useArxmlStore.ts` composes 7 slices via Zustand's slice pattern:

```ts
type ArxmlState = BswmdSlice &
  EcucSlice &
  I18nSlice &
  ImportSlice &
  MutationSlice &
  ProjectSlice &
  TourSlice &
  UiSlice;
```

The facade (`useArxmlStore.ts`) just `create<ArxmlState>()(...)` with
all 7 slice creators. Consumers access fields via
`useArxmlStore((s) => s.someField)` regardless of which slice owns them.

**For `deleteEcucModule`**: add to `MutationSlice` in
`slices/mutationSlice.ts`. Update the `createMutationSlice` factory to
include the action; no facade change needed.

---

## Pattern reference — `deleteContainer` shape

```ts
// mutationSlice.ts:128
deleteContainer: (containerPath) => {
  const state = get();
  if (state.viewMode === 'combined') {
    // combined-mode resolution via resolveContainerTarget
    ...
    return;
  }
  // single-doc path
  ...
  const result = coreRemoveContainer(state.doc!, containerPath, false);
  if (!result.ok) {
    setErrorWithKind(set, state.locale, result.error);
    return;
  }
  applyMutationResultToActive(set, state, activeIdx, result.value, state.activeDocumentPath);
},
```

`deleteEcucModule` does NOT need combined-mode resolution because:

- The user right-clicks the module ROOT in the tree
- In combined mode, the module root has a path like `/COMBINED/Adc`
  which is the same shape used by `updateParam` (no special handling)
- The new action operates on `state.doc` directly (or
  `state.displayDoc` for combined) using `findByPathMultiDoc`

If implementing combined-mode support is needed, mirror the pattern
above. For v1.10.1 PATCH, single-doc + combined-via-displayDoc is
acceptable (consistent with the existing `updateParam` behavior; spec
doesn't require combined-mode special handling).

---

## Test conventions

- File: `src/renderer/store/__tests__/useArxmlStore.deleteModule.test.ts`
  - But! Because the action lives in `mutationSlice.ts`, the test should
    import `useArxmlStore` (the facade) and exercise through it. Same
    pattern as `useArxmlStore.mutation.test.ts`.
- File: `src/renderer/components/__tests__/ContextMenu.deleteModule.test.tsx`
  - Mirror `App.contextMenu.test.tsx` shape (uses `ContextMenuRoot` +
    `openContextMenu` helpers)
- i18n parity test: `src/shared/__tests__/i18n.test.ts` — automatically
  verifies zh-CN + en key parity

---

## Pre-flight: baseline tests

Expected baseline: **2142 passed + 1 skipped** (verified 2026-06-24 on
`feature/v1-9-1-ecucdefs-fold` HEAD `3b185aa`). After Tasks 1+2+3 the
target is **~2149 passed + 1 skipped** (4 store + 3 context menu tests).

If the baseline count drifts >5 from 2142, STOP and surface to user.

---

## Order of execution (subagents)

1. **Subagent A** — Task 1 (i18n): add 5 keys (4 from plan + 1 new
   error key `mutation.error.moduleNotFound`). Run i18n parity test.
   Commit `feat(i18n): add delete-module keys (zh-CN + en)`.

2. **Subagent B** — Task 2 (store action TDD): write 4 failing tests
   for `deleteEcucModule`, implement in `mutationSlice.ts`, GREEN, add
   the `removeModuleFromDoc` pure helper in `core/arxml/mutation.ts`,
   commit `feat(store): add deleteEcucModule action (RED+GREEN)`.

3. **Subagent C** — Task 3 (context menu): widen `ContextMenuTarget`,
   extend `ContextMenuAction`, add menu item, update `TreeNode.tsx`
   re-route, wire in `App.tsx`, write 3 context menu tests, GREEN,
   commit `feat(renderer): add delete-module context menu item`.

4. **code-reviewer** — whole-branch review (last 4 commits). Required
   before Task 4 (verify + release).

5. **Subagent D** — Task 4: `pnpm verify` all 7 stages, write
   `docs/release-notes-v1.10.1.md`, bump `package.json` 1.9.1 → 1.10.1,
   push + tag + GH release.

---

## Verification gates (every task)

```bash
pnpm exec vitest run src/shared/__tests__/i18n.test.ts  # Task 1
pnpm exec vitest run src/renderer/store/__tests__/useArxmlStore.deleteModule.test.ts  # Task 2
pnpm exec vitest run src/renderer/components/__tests__/ContextMenu.deleteModule.test.tsx  # Task 3
pnpm exec vitest run  # Task 4 (final)
pnpm exec tsc --noEmit --incremental  # all tasks (after each commit)
pnpm exec eslint src  # all tasks
pnpm verify  # Task 4 only (all 7 stages)
```

Failure on any gate → STOP, fix, re-run before committing.
