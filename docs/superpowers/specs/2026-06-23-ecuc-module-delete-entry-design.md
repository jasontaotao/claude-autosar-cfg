# ECUC Module Delete Entry Point — Design Spec

> **Date**: 2026-06-23
> **Target**: v1.8.5 or later (no rush; parked per user direction)
> **Scope**: Restore a UI entry to delete the entire `<ECUC-MODULE-CONFIGURATION-VALUES>` while preserving the BSWMD file. Lost when Sprint 17 P3 T3.2 routed module-root right-click to BSWMD removal.
> **Status**: Design discussion only; do not implement until user greenlights.

## Background

### What the user reported (2026-06-23)

User opens `Adc_bswmd.arxml` (generated ECUC) in the renderer. The Tree
shows the module. Right-click → context menu shows only **Remove BSWMD**
(with the 4-option cascade dialog) — no entry to delete the ECUC values
without also deleting the BSWMD.

### Root cause

Sprint 17 P3 T3.2 (commit per `docs/release-notes-v1.7.x` + memory entry
`Sprint 17 P1+P2 SHIPPED`) added a re-route in
`src/renderer/components/tree/TreeNode.tsx:182-218`:

```ts
if (kind === 'module') {
  const doc = useArxmlStore.getState().doc ?? useArxmlStore.getState().displayDoc;
  if (doc?.sourceBswmdPath !== undefined) {
    openContextMenu(
      { path: doc.sourceBswmdPath, kind: 'bswmd', ... },
      e.clientX, e.clientY,
    );
    return;  // ← bypasses the host's onContextMenu
  }
}
```

When the ECUC was generated from a BSWMD skeleton (`sourceBswmdPath` is
set), the module-root right-click is silently redirected to the BSWMD
removal dialog. The host's `handleContextMenuAction` in `App.tsx:329-370`
never sees the `'module'` kind for these docs, so the
`'delete-container'` branch (which would otherwise be available for any
non-reference, non-bswmd node) is unreachable.

### Why this matters

A user editing ECUC values needs to be able to:

1. **Reset the ECUC values to skeleton defaults** — delete all container
   values, keep the BSWMD, regenerate. Common when iterating on a config.
2. **Switch to a different ECUC file for the same module** — e.g. move
   from `Adc_EcucValues.arxml` to `Adc_Production_EcucValues.arxml`.
   The current ECUC must go, the BSWMD must stay.
3. **Recover from a corrupted ECUC** — delete the file, regenerate from
   BSWMD skeleton.

None of these require deleting the BSWMD. The current UX forces the user
to either delete the BSWMD + ECUC (heavy-handed) or manually remove every
container one at a time (slow + cascade-confirm dialog each time).

### What exists today

| Right-click target                         | Menu items                                          | Outcome                                                         |
| ------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------- |
| Container (any depth)                      | Add c/p/r + **Delete container**                    | One container removed; cascade dialog if 1+ incoming refs       |
| Reference                                  | Delete reference (info toast — **not implemented**) | No-op                                                           |
| Module root (with `sourceBswmdPath`)       | **Remove module** (4-option dialog)                 | BSWMD removed + ECUC cascade or unlink                          |
| Module root (legacy, no `sourceBswmdPath`) | Add c/p/r + Delete container                        | Container deletion only — **no way to remove the whole module** |

### The gap

There is **no UI entry** to delete the entire `<ECUC-MODULE-CONFIGURATION-VALUES>`
regardless of `sourceBswmdPath`. The current best workaround is to delete the
ECUC file from the OS file manager and let the next "regenerate" flow recreate
it — which loses any uncommitted edits.

## Goal

Provide a UI entry to "delete the entire ECUC module (keep BSWMD)" that:

- Lives in the existing context menu (no new toolbar / dialog host)
- Only fires for `kind: 'module'` nodes (container/reference menus unchanged)
- Skips cascade (deleting a whole module is atomic — its children vanish with
  it, no incoming refs to clean up at the module level because refs target
  containers)
- Honors dirty-guard (if the document has unsaved edits, prompt to save first)
- Honors BSWMD link (if `sourceBswmdPath` is set, deleting the ECUC means the
  next render will show "0 modules covered by BSWMD" — surface a clear toast,
  don't silently dangle)
- Has a parallel file-system entry for legacy (no `sourceBswmdPath`) modules —
  same menu item, same handler, with a confirm step ("Delete ECUC values for
  `<moduleName>`? BSWMD unaffected.")

## Design candidates

### Candidate A — Add `'delete-module'` to the existing context menu

Extend `ContextMenuAction` union in `ContextMenu.tsx:60-66` with a new variant:

```ts
| { readonly type: 'delete-module'; readonly path: string; readonly name: string };
```

`buildContainerItems` (currently called for any non-`reference` non-`bswmd`
target) gets a 5th item **before** the "Delete container" item. The label is
i18n-keyed: `mutation.action.deleteModule = "Delete ECUC module '{name}'"`
(zh-CN + en).

Routing in `App.tsx handleContextMenuAction`:

```ts
case 'delete-module':
  deleteEcucModule(action.path);  // new store action
  return;
```

**TreeNode.tsx** needs a new branch — the current re-route (lines 182-218)
folds `module` into `bswmd` for `sourceBswmdPath` docs. We add a sibling
item before the re-route, so the menu shows BOTH "Remove BSWMD" and
"Delete ECUC module" for `sourceBswmdPath` docs:

```ts
if (kind === 'module') {
  const doc = ...;
  if (doc?.sourceBswmdPath !== undefined) {
    openContextMenu({ path: doc.sourceBswmdPath, kind: 'bswmd', ... }, ...);
    // ← only this fires today; need to merge bswmd + module target into one menu
  }
}
```

The cleanest fix is to widen the context menu target so a single right-click
on the module root can offer BOTH actions. Two paths:

- **A1**: Change `kind: 'bswmd'` to a richer discriminated union that carries
  BOTH the BSWMD path AND the module path, then `buildItems` emits two
  destructive items.
- **A2**: Open the menu twice (no — too clever, breaks UX expectation of a
  single menu).
- **A3**: Keep the BSWMD item, add the module item, and have both target the
  same `path` in `buildItems`. The `action.path` discriminates downstream.

A3 is the minimal change: extend `ContextMenuTarget` with
`readonly modulePath?: string`, populated by the host when the right-click
target has both meanings. `buildContainerItems` emits a "Delete ECUC module"
item whenever `modulePath !== undefined`.

### Candidate B — New `deleteEcucModule` store action

The new store action in `useArxmlStore.ts`:

```ts
deleteEcucModule: (modulePath: string) => void;
```

Internally:

1. Walk the `displayDoc` to find the source `ArxmlModule` element
   (`modulePath` is the post-fold path `/Adc`).
2. Check `state.doc !== null && state.doc.sourceBswmdPath !== undefined`
   to decide dirty-guard (if source-backed, deletion dangles the link).
3. For non-source-backed: pure in-memory edit of `state.doc`, mark dirty,
   toast `'mutation.info.ecucModuleDeleted'`.
4. For source-backed: same in-memory edit, but ALSO clear the
   `sourceBswmdPath` link (the ECUC no longer reflects the BSWMD skeleton
   once the user manually deletes it) and toast a clearer message that
   mentions the unlink.
5. For legacy (no `sourceBswmdPath`): same as #3, no link to clear.

### Candidate C — Extend the existing 4-option BSWMD dialog

The current `RemoveModuleConfirmRoot` dialog (Sprint 17 P2) has 4 options:
cancel / only / cascade / cascade-and-unlink. Add a 5th option
"Delete ECUC only (keep BSWMD)".

**Pros**: Reuses the existing dialog UX; user already knows the affordances.
**Cons**: Couples a "delete BSWMD" dialog with a "delete ECUC" action that
isn't BSWMD-related. Semantically confusing — the dialog title is
"Remove BSWMD" but option 5 isn't removing the BSWMD. Also requires the
right-click on the module root to NOT be re-routed (currently is), so we'd
need to undo the Sprint 17 P3 T3.2 re-route.

## Recommendation

**Candidate A3 + Candidate B**. Reasons:

- **A3 keeps the context menu as the entry point**, which is the established
  pattern (Sprint 15 + Sprint 17). The user already knows "right-click the
  node to mutate it."
- **B's store action is the only safe way to handle dirty-guard + source-link
  unlink** without leaking these concerns into the renderer.
- **C is rejected** because it conflates two unrelated actions (BSWMD removal
  vs ECUC deletion) in one dialog. The current 4-option dialog is already
  full; adding a 5th option creates ambiguity about what gets deleted when.
- **A1 (richer discriminated union)** is over-engineered for a single new
  menu item. A3's `modulePath?: string` is the minimal surface change.

### Proposed implementation surface (for the eventual plan)

| File                                                                  | Change                                                                                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/shared/i18n.ts`                                                  | Add `mutation.action.deleteModule` + `mutation.action.deleteModuleAria` + `mutation.info.ecucModuleDeleted` (zh-CN + en) |
| `src/renderer/components/ContextMenu.tsx`                             | Widen `ContextMenuTarget.modulePath?: string`; `buildContainerItems` adds the new item when `modulePath !== undefined`   |
| `src/renderer/components/tree/TreeNode.tsx`                           | Update the re-route (lines 182-218) to pass both `bswmdPath` and `modulePath` into the target                            |
| `src/renderer/App.tsx`                                                | `handleContextMenuAction` adds `case 'delete-module':` branch                                                            |
| `src/renderer/store/useArxmlStore.ts`                                 | New `deleteEcucModule(path: string)` action                                                                              |
| `src/renderer/store/slices/ecucSlice.ts` (new?) or inline             | The mutation itself — depends on existing slice layout                                                                   |
| `src/renderer/store/__tests__/useArxmlStore.deleteModule.test.ts`     | New file — happy path + source-link unlink + dirty-guard + legacy (no link)                                              |
| `src/renderer/components/__tests__/ContextMenu.deleteModule.test.tsx` | New file — menu item appears for module kind, absent for container/ref/bswmd                                             |

## Invariants (locked)

| ID  | Statement                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | `deleteEcucModule(path)` is atomic — either fully removes the module or no-ops with a clear error toast                                              |
| I2  | For `sourceBswmdPath`-backed modules, the link is cleared on deletion (otherwise the next render shows a dangling "0 modules covered by BSWMD" chip) |
| I3  | For dirty documents, the dirty-guard prompts to save BEFORE the deletion fires (consistent with the existing `'remove-module'` flow)                 |
| I4  | The new menu item only appears when `target.modulePath !== undefined` — never on container / reference / bswmd nodes                                 |
| I5  | Deleting a module does NOT cascade to other modules (refs target containers, not modules — there's nothing to clean up)                              |

## Out of scope

- **Bulk delete multiple ECUC modules in one action** — single-item only for
  this spec. Multi-select could come later.
- **Undo** — the existing `undoLastRemoveBswmd` PATCH (v1.8.1) handles BSWMD
  removal undo; ECUC module deletion undo would require a new action in
  `useArxmlStore.undoStack`. Defer to a separate spec.
- **"Regenerate from skeleton" action** — the natural follow-up: after
  deleting an ECUC module, offer to regenerate it from the linked BSWMD.
  This is the "Reset to skeleton defaults" workflow. Defer.

## Acceptance gates (when implementation lands)

- `pnpm exec vitest run src/renderer/store/__tests__/useArxmlStore.deleteModule.test.ts`
  passes all cases.
- `pnpm exec vitest run src/renderer/components/__tests__/ContextMenu.deleteModule.test.tsx`
  passes all cases.
- Existing `removeBswmd.fullFlow.test.tsx` still passes (no behavior change
  to BSWMD removal).
- Manual smoke: load `Adc_bswmd.arxml`, right-click module root, see
  BOTH "Remove BSWMD" AND "Delete ECUC module 'Adc'"; pick the latter,
  confirm dirty-guard + source-link cleared + no dangle chip.

## Risk assessment

- **Code surface**: ~30 LOC across 4 files (ContextMenu + App + store + i18n) +
  2 test files. Small.
- **Behavioral change**: New menu item only — does not change existing
  behavior of any other menu item. The Sprint 17 P3 T3.2 re-route is
  widened (adds a sibling item), not undone.
- **Regression risk**: Low. The re-route was a single conditional in
  TreeNode; widening it to pass both `bswmdPath` and `modulePath` keeps
  the BSWMD path in `action.path` and adds the new path in
  `action.payload.modulePath` (or similar). Existing tests that pin the
  `'remove-module'` action shape need a quick update (~1 line each).

## Why this spec exists without a plan

User explicitly said "上面那个问题也一起 plan 一下" (plan that question too).
This document is the **design spec only**; the implementation plan will be
written after user reviews and approves this spec.
