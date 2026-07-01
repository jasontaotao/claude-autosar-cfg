// v1.18.5 PATCH — extracted from useProjectActions.ts (lines 97-219).
//
// Module-level helpers used by the `useProjectActions` hook. Co-located
// in the subdir so the main hook file can stay focused on the hook body.
// C13 Option B split 1/2.

import type { Locale } from '../../../shared/i18n.js';
import { t } from '../../../shared/i18n.js';
import { confirm } from '../../components/ConfirmDialog.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';

import type { ProjectActionResult, SwitchingAction } from './types.js';

// ---------------------------------------------------------------------------
// Store dialog-state accessor (defensive wrapper)
// ---------------------------------------------------------------------------
//
// Sprint 12 #3 Task 7 added a top-level setter to the store
// (`setNewProjectDialogOpen`). The hook touches it. To keep the hook
// tolerant of builds where Task 7 hasn't yet landed, the accessor
// falls back to a no-op. Production builds where Task 7 has shipped
// take the fast path; tests that exercise the dialog fields patch the
// store directly (see `useProjectActions.test.ts`).
// ---------------------------------------------------------------------------

export function setNewProjectDialogOpen(open: boolean): void {
  const fn = (useArxmlStore.getState() as { setNewProjectDialogOpen?: (o: boolean) => void })
    .setNewProjectDialogOpen;
  if (typeof fn === 'function') fn(open);
}

// ---------------------------------------------------------------------------
// Switching-action axis for confirm-dialog i18n
// ---------------------------------------------------------------------------
//
// The dirty-guard confirm dialog now has action-specific text so the
// message says "打开其他项目将丢失这些更改" instead of "新建项目将丢失
// 这些更改" when the trigger is openProject.
//
// The `SwitchingAction` type is the camelCase verb that matches the
// `useProjectActions` method names. The `toI18nAxis` helper below
// maps it to the i18n key suffix, which intentionally drops the
// trailing "Project" so the keys are short and the bundles read
// naturally (`message.new` not `message.newProject`).

/** Map a SwitchingAction to the short axis used in i18n key suffixes. */
export function toI18nAxis(
  action: SwitchingAction,
): 'new' | 'open' | 'addBswmd' | 'removeBswmd' | 'deleteModule' {
  switch (action) {
    case 'newProject':
      return 'new';
    case 'openProject':
      return 'open';
    case 'addBswmd':
      return 'addBswmd';
    case 'removeBswmd':
      return 'removeBswmd';
    case 'deleteModule':
      return 'deleteModule';
  }
}

// ---------------------------------------------------------------------------
// Module-level dirty-guard helper
// ---------------------------------------------------------------------------
//
// Sprint 12 #3 Task 5 moved this helper to module scope so all four
// switching actions (`newProject` / `openProjectFromDialog` /
// `addBswmdFromDialog` / `removeBswmdWithGuard`) can call it without a
// TDZ on the helper itself, and without putting `guarded` into the
// useCallback dep array (which would force the callback to be
// re-created on every render).
//
// Sprint 13 #2 Stage 3.2 Task 1 + Task 4:
//
//   - The helper now takes `action: SwitchingAction` and uses per-action
//     i18n keys for message / discard / save labels.
//   - The helper takes an optional `save` callback so the
//     'saveAndProceed' choice can actually persist the project (was
//     a no-op in Phase 1 — confusing for users who clicked "保存并
//     打开" and saw nothing happen). The caller injects its own
//     `saveProject` useCallback so the helper stays hook-agnostic and
//     unit-testable.
//   - The 'saveAndProceed' branch returns either `{ proceed: true }`
//     (save succeeded) or `{ proceed: false, saveError }` (save
//     failed; caller surfaces the message via ProjectActionResult).
// ---------------------------------------------------------------------------

interface GuardedDirtySwitchOptions {
  readonly action: SwitchingAction;
  /** Display name for the target, e.g. the BSWMD path being removed. */
  readonly targetName?: string;
  /** The caller's own saveProject callback. Required when the user
   *  may pick 'saveAndProceed'. */
  readonly save?: () => Promise<ProjectActionResult>;
}

type GuardedDirtySwitchResult =
  | { readonly proceed: true }
  | { readonly proceed: false }
  | { readonly proceed: false; readonly saveError: string };

export async function guardedDirtySwitch(
  opts: GuardedDirtySwitchOptions,
): Promise<GuardedDirtySwitchResult> {
  if (useArxmlStore.getState().dirtyPaths.size === 0) {
    return { proceed: true };
  }
  const locale: Locale = useArxmlStore.getState().locale;
  const projectName = useArxmlStore.getState().project?.name ?? '';
  // Per-action interpolation: removeBswmd gets a `{target}` placeholder
  // for the BSWMD path so the message is unambiguous about which one.
  const params: Record<string, string> = { name: projectName };
  if (opts.targetName !== undefined) {
    params.target = opts.targetName;
  }
  const axis = toI18nAxis(opts.action);
  const choice = await confirm({
    title: t(locale, 'confirm.unsaved.title'),
    message: t(locale, `confirm.unsaved.message.${axis}`, params),
    continueLabel: t(locale, 'confirm.unsaved.continue'),
    discardLabel: t(locale, `confirm.unsaved.discard.${axis}`),
    saveLabel: t(locale, `confirm.unsaved.saveAndNew.${axis}`),
  });
  if (choice === 'discard') {
    return { proceed: true };
  }
  if (choice === 'saveAndProceed' && opts.save !== undefined) {
    const saveResult = await opts.save();
    if (saveResult.kind === 'ok') {
      return { proceed: true };
    }
    if (saveResult.kind === 'error') {
      return { proceed: false, saveError: saveResult.message };
    }
    // saveResult.kind === 'canceled' (loose mode or no project on disk)
    // — fall through to proceed: false so the caller bails.
  }
  return { proceed: false };
}
