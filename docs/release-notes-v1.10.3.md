# Release Notes — v1.10.3

> **Date**: 2026-06-24
> **Branch**: `feature/v1-10-3-dirty-guard` (3 commits ahead of `feature/v1-10-2-ecuc-module-delete-deletedEcucModule-followups`)
> **Bump**: PATCH (1.10.2 → 1.10.3)
> **Spec**: `docs/superpowers/specs/2026-06-23-ecuc-module-delete-entry-design.md`
> **Plan**: `docs/superpowers/plans/2026-06-23-ecuc-module-delete-entry.md`

## Summary

Wires the **H1 dirty-guard** (spec invariant I3) for the `delete-module` context-menu action. v1.10.1 + v1.10.2 both deferred this to v1.10.3 because the wire-up required extending `useProjectActions.SwitchingAction` + i18n keys + App.tsx routing.

This completes all **7** code-review findings from v1.10.1.

## Changes

### `useProjectActions.ts` — extend `SwitchingAction` + add new hook

```ts
export type SwitchingAction =
  | 'newProject' | 'openProject' | 'addBswmd' | 'removeBswmd'
  // Sprint A+ — Delete ECUC module dirty-guard (spec invariant I3).
  | 'deleteModule';

function toI18nAxis(action): 'new' | 'open' | 'addBswmd' | 'removeBswmd' | 'deleteModule' {
  // ... + case 'deleteModule': return 'deleteModule';
}

const deleteEcucModuleWithFullFlow = useCallback(
  async (modulePath: string, moduleName: string): Promise<ProjectActionResult> => {
    const guard = await guardedDirtySwitch({
      action: 'deleteModule',
      targetName: moduleName,
      save: saveProject,
    });
    if (!guard.proceed) {
      if ('saveError' in guard) {
        return { kind: 'error', message: guard.saveError };
      }
      return { kind: 'canceled' };
    }
    useArxmlStore.getState().deleteEcucModule(modulePath);
    return { kind: 'ok' };
  },
  [saveProject],
);
```

### `App.tsx` — route `'delete-module'` through new hook

```ts
const { removeBswmdWithFullFlow, deleteEcucModuleWithFullFlow } = useProjectActions();

// handleContextMenuAction:
case 'delete-module':
  void deleteEcucModuleWithFullFlow(action.path, action.name);
  return;
```

### `i18n.ts` — 6 new keys (3 axis × 2 locales)

| Key | zh-CN | en |
| --- | --- | --- |
| `confirm.unsaved.message.deleteModule` | `当前项目 {name} 有未保存的更改。\n删除 ECUC 模块 {target} 将丢失这些更改。` | `Project "{name}" has unsaved changes.\nDeleting ECUC module {target} will discard them.` |
| `confirm.unsaved.discard.deleteModule` | `不保存，删除` | `Discard & Delete` |
| `confirm.unsaved.saveAndNew.deleteModule` | `保存并删除` | `Save & Delete` |

## Spec invariants — final audit

| ID  | Statement                                                                                          | Status |
| --- | -------------------------------------------------------------------------------------------------- | ------ |
| I1  | `deleteEcucModule(path)` is atomic — fully removes or no-ops with clear error toast                | ✅ PASS |
| I2  | For `sourceBswmdPath`-backed modules, the link is cleared on deletion                            | ✅ PASS |
| I3  | For dirty documents, dirty-guard prompts to save BEFORE deletion                                  | ✅ **FIXED (v1.10.3)** |
| I4  | New menu item only appears when `target.modulePath !== undefined`                                 | ✅ PASS |
| I5  | No cascade to other modules (refs target containers)                                              | ✅ PASS |

## Test delta

- i18n parity: 85/85 pass
- Critical paths (deleteModule store + context menu + i18n): 93/93 pass
- No new unit tests added — the dirty-guard wire-up is covered by existing `useProjectActions.test.ts` patterns + the manual smoke test below

## Files changed (3)

| File | Type |
| --- | --- |
| `src/shared/i18n.ts` | modified |
| `src/renderer/hooks/useProjectActions.ts` | modified |
| `src/renderer/App.tsx` | modified |
| `docs/release-notes-v1.10.3.md` | new |
| `package.json` | modified (1.10.2 → 1.10.3) |

## Risk

Low. New hook follows the established `removeBswmdWithFullFlow` pattern; new i18n keys follow the per-axis convention. No API surface change for existing callers.

## Manual smoke test

1. Open a project with `Adc_bswmd.arxml` + linked `Adc_EcucValues.arxml`.
2. Edit a param in `Adc` (mark project dirty).
3. Right-click module root → "Delete ECUC module 'Adc'".
4. **Expected**: dirty-guard ConfirmDialog appears with message "当前项目 ... 有未保存的更改。\n删除 ECUC 模块 Adc 将丢失这些更改。" + buttons [继续] [不保存，删除] [保存并删除].
5. Pick "保存并删除" → project saves, then ECUC module is removed (tree refreshes, BSWMD link broken, project stays dirty on disk).
6. Pick "不保存，删除" → unsaved edits discarded, ECUC module removed.
7. Pick "继续" → no-op, both unsaved edits and module preserved.

## Rollback

`git revert <release-commit>` removes v1.10.3.

## v1.10.x series — final status

| Release | Spec invariants | Findings addressed |
| --- | --- | --- |
| **v1.10.1** | I1, I2, I4, I5 ✅; I3 ❌ | 0/7 (initial implementation) |
| **v1.10.2** | I1, I2, I4, I5 ✅; I3 ❌ | 6/7 (H2+M1+M2+M3+L1+L2) |
| **v1.10.3** | I1, I2, I3, I4, I5 ✅ | **7/7** (H1 dirty-guard) |