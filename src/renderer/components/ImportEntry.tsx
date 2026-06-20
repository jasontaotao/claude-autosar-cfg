// ImportEntry — Sprint 14 ECUC ARXML Import — T10.
//
// The `[Import…]` button in FileListTab. Triggers the existing
// `openArxmlMulti` preload bridge (which itself calls
// `dialog.showOpenDialog` in main) and, on the `opened` / `partial`
// results, parses each file via the existing `parseArxml` IPC
// channel and dispatches `store.startImport([...docs], [...paths])`.
//
// Dirty-guard semantics: this entry point mirrors the pattern used
// by `useProjectActions.addBswmdFromDialog` (Sprint 12 #2). When
// `isDirty()` is true (or the existing `dirtyPaths` is non-empty),
// we pop the unsaved-changes ConfirmDialog and only proceed on
// 'discard' / 'saveAndProceed'. cancel / Esc = no-op.
//
// Sprint 17a — the dirty-guard now uses the app's 3-state `confirm()`
// (from ConfirmDialog.tsx) instead of `window.confirm`. The
// `saveAndProceed` choice is wired to the standard "save then
// proceed" path; the 3rd button is labelled "Save and import" so the
// action matches the entry point.
//
// Design choices:
//   - We do NOT introduce a new IPC channel — the existing
//     `openArxmlMulti` + `parseArxml` pair covers the flow.
//   - We do NOT add a new file extension filter — `.arxml` is
//     already wired by the existing dialog.
//   - On partial read / partial parse, the user is shown the
//     "Import {N} file(s) into the project" toast (success) or
//     a localized error (partial failure) via the store's `error`
//     slice. The store is the source of truth for toast lifecycle.

import { useCallback, useState } from 'react';
import type { JSX } from 'react';

import type { ArxmlDocument } from '@core/arxml/types';
import { t } from '@shared/i18n';

import { useArxmlStore } from '../store/useArxmlStore';

import { confirm } from './ConfirmDialog';

import './ImportEntry.css';

interface ImportEntryProps {
  /**
   * Render variant. `inline` renders the button as a row in a
   * list (used inside FileListTab's ARXML group). `standalone`
   * renders it as a primary button (used by the AppHeader
   * menu).
   */
  readonly variant?: 'inline' | 'standalone';
}

/**
 * The Import entry-point component. Mounts a single button +
 * dirty-guard. Click flow:
 *   1. isDirty() → ConfirmDialog (only when dirty).
 *   2. openArxmlMulti → canceled / read-failed / opened / partial.
 *   3. parseArxml per file → build a (doc, path) pair list.
 *   4. startImport(docs, paths) → viewMode flips to 'import-merged'.
 */
export function ImportEntry({ variant = 'inline' }: ImportEntryProps): JSX.Element {
  const locale = useArxmlStore((s) => s.locale);
  const isDirty = useArxmlStore((s) => s.isDirty());
  const startImport = useArxmlStore((s) => s.startImport);
  const setError = useArxmlStore((s) => s.setError);
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(async (): Promise<void> => {
    if (busy) return;
    // 1. Dirty guard — mirror useProjectActions.addBswmdFromDialog.
    // Sprint 17a: use the app's 3-state confirm() instead of
    // window.confirm so the experience is consistent with the
    // other dirty-guards (New / Open / Add BSWMD / Remove BSWMD).
    if (isDirty) {
      const choice = await confirm({
        title: t(locale, 'confirm.unsaved.title'),
        message: t(locale, 'confirm.unsaved.message.import'),
        saveLabel: t(locale, 'confirm.unsaved.saveAndNew.import'),
      });
      if (choice === 'continue') return;
      if (choice === 'saveAndProceed') {
        // Sprint 17a — silent-save-back of dirty ARXML docs before
        // proceeding with the import. Mirrors the pattern in
        // `useRemoveEcucFiles.ts:151-186` (Sprint 16 T2 / 16c #3):
        // feed each dirty target's on-disk path as `currentPath` so
        // the IPC skips the dialog. If the FIRST save fails we
        // break the loop and surface the failure; the unsaved
        // edits stay in memory and we bail.
        const state = useArxmlStore.getState();
        for (const filePath of Array.from(state.dirtyPaths)) {
          const doc = state.documents.find((d) => d.path === filePath);
          if (doc === undefined) continue;
          const saveResult = await window.autosarApi.saveArxml({
            doc,
            currentPath: filePath,
          });
          if (saveResult.ok && !saveResult.value.canceled) {
            useArxmlStore.getState().markSaved(saveResult.value.path ?? filePath);
            continue;
          }
          // First failure aborts the loop and bails the import.
          const message = saveResult.ok ? 'save canceled by user' : saveResult.error.message;
          setError(
            t(locale, 'app.error.saveFailed', { message }),
          );
          return;
        }
      }
      // 'discard' falls through to proceed with import.
    }
    // 2. Open dialog.
    setBusy(true);
    let pickResult: Awaited<ReturnType<typeof window.autosarApi.openArxmlMulti>>;
    try {
      pickResult = await window.autosarApi.openArxmlMulti();
    } catch (err) {
      setBusy(false);
      setError(
        t(locale, 'app.error.openFailed', {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
      return;
    }
    if (pickResult.kind === 'canceled' || pickResult.kind === 'read-failed') {
      setBusy(false);
      return;
    }
    // 3. Parse each opened file via the existing parseArxml IPC.
    // `startImport` accepts a readonly array, so we accumulate into
    // a regular mutable array and pass it in once at the end.
    const docs: ArxmlDocument[] = [];
    const paths: string[] = [];
    let lastError: string | null = null;
    const opened = pickResult.kind === 'opened' ? pickResult.results : pickResult.opened;
    for (const file of opened) {
      const parsed = await window.autosarApi.parseArxml({
        path: file.path,
        content: file.content,
      });
      if (parsed.ok) {
        docs.push(parsed.value);
        paths.push(file.path);
      } else {
        lastError = t(locale, 'app.import.error.parseFailed', {
          path: file.path,
          message: parsed.error.kind,
        });
      }
    }
    if (docs.length === 0) {
      setBusy(false);
      setError(lastError ?? t(locale, 'app.error.openFailed', { message: 'no files parsed' }));
      return;
    }
    // 4. Dispatch startImport — this flips viewMode to
    //    'import-merged' and the ModuleSelectionPanel mounts.
    startImport(docs, paths);
    setBusy(false);
    if (lastError !== null) {
      setError(lastError);
    }
  }, [busy, isDirty, locale, setError, startImport]);

  const className = variant === 'standalone' ? 'import-entry import-entry-standalone' : 'import-entry';
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        void handleClick();
      }}
      disabled={busy}
      data-testid="import-entry-button"
      aria-label={t(locale, 'app.import.button')}
    >
      <span className="import-entry-icon" aria-hidden="true">
        ⬇
      </span>
      <span className="import-entry-label">{t(locale, 'app.import.button')}</span>
    </button>
  );
}
