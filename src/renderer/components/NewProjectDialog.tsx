// NewProjectDialog — Sprint 12 #3 Phase 1 Task 1.
//
// Unified "new project" modal that replaces the previous two-step
// flow (PromptDialog → OS showSaveDialog). The dialog collects the
// project name and target directory in one place, previews the
// resulting `<dir>/<name>.autosarcfg.json` path live, validates the
// name as the user types, and hands the validated `{name, dir}` pair
// to a host-provided `onSubmit(name, dir)` callback. The callback
// owner (App.tsx → useProjectActions.newProject in Task 5) decides
// what to do with it: invoke `window.autosarApi.projectNew`, dispatch
// the resulting manifest into the store, and dismiss the dialog.
//
// Why a **single-instance** store-driven dialog (not the
// `module-level externalSetState` pattern used by ConfirmDialog /
// PromptDialog)? This dialog is project-creation-scoped, lives
// behind a single store flag, and never needs to resolve a promise
// — the caller reacts to the returned data outside the component.
// Driving it through `newProjectDialogOpen` keeps `useProjectActions`
// able to open it from IPC error paths and lets the hook layer
// (Task 5) own the dirty-protection gating.
//
// What this component does NOT do (deferred to other tasks / phases):
//   - Templates (Phase 2 / Sprint 13 #1)
//   - BSWMD chip multi-select (Phase 3 / Sprint 13 #2)
//   - Overwrite-confirm flow when the target manifest already exists
//     (Task 5 — handled at the IPC layer + ConfirmDialog call site)
//   - Calling IPC directly (`window.autosarApi.projectNew`). The host
//     wires that through the `onSubmit` prop so the component stays
//     purely UI + form-state.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { Locale } from '@shared/i18n';
import { t } from '@shared/i18n';

import { useArxmlStore } from '../store/useArxmlStore';

import { validateProjectName } from './NewProjectDialog.validate';

import './NewProjectDialog.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * The host wires `onSubmit` to whatever pipeline it wants (typically
 * `useProjectActions.newProject`). Returning a Promise is allowed —
 * the dialog does not await the result; the host is responsible for
 * closing the dialog on success or surfacing an error on failure.
 */
export interface NewProjectDialogProps {
  readonly onSubmit: (name: string, directory: string) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// AutosarApi subset we touch. Typed narrowly so tests can stub
// `window.autosarApi` without pulling in the whole preload bridge.
// ---------------------------------------------------------------------------

interface AutosarApiLike {
  readonly pickDir: (req: {
    readonly defaultPath?: string;
  }) => Promise<
    { readonly kind: 'picked'; readonly dirPath: string } | { readonly kind: 'canceled' }
  >;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewProjectDialog({ onSubmit }: NewProjectDialogProps): JSX.Element | null {
  // Visibility is store-driven — the hook layer flips
  // `newProjectDialogOpen` from `useProjectActions.newProject`. Locale
  // comes from the same store so label refreshes when the user
  // toggles language without a remount.
  const open = useArxmlStore((s) => s.newProjectDialogOpen);
  const setOpen = useArxmlStore((s) => s.setNewProjectDialogOpen);
  const locale: Locale = useArxmlStore((s) => s.locale);

  // Local form state. We deliberately don't mirror this to the store:
  // the dialog is the only consumer and unmounts when closed, so
  // component state is the right home (and resets cleanly on every
  // open).
  const [name, setName] = useState('');
  const [dir, setDir] = useState('');
  const [busy, setBusy] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the name input every time the dialog opens so the
  // user can start typing immediately.
  useEffect(() => {
    if (open) {
      // Defer to next frame so the DOM node is painted and reachable
      // via ref.
      const id = requestAnimationFrame(() => nameInputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    // Reset form state when the dialog closes — next open starts
    // fresh (also handled implicitly by the unmount/remount cycle of
    // the portal, but explicit reset defends against future
    // "don't unmount" refactors).
    setName('');
    setDir('');
    setBusy(false);
    return undefined;
  }, [open]);

  if (!open) return null;

  // Live validation — recomputed on every render. The function is
  // pure and allocation-free so this is cheaper than `useMemo`.
  const nameError = validateProjectName(name);
  const hasDir = dir.trim().length > 0;
  const canSubmit = nameError === null && hasDir && !busy;

  // The filename preview interpolates the user's current inputs into
  // the same template the i18n bundle ships, so en/zh-CN render the
  // exact suffix and path separators expected for that locale.
  const filenamePreview = t(locale, 'newProject.filenamePreview', {
    dir: dir || '(dir)',
    name: name || '(name)',
  });

  const handleCancel = (): void => {
    setOpen(false);
  };

  const handleClose = (): void => {
    setOpen(false);
  };

  const handleSubmit = (): void => {
    if (!canSubmit) return;
    // We snapshot name/dir at click-time (the form-state setters are
    // synchronous; capturing at the top is purely defensive against a
    // future React batching change).
    const submittedName = name;
    const submittedDir = dir;
    const result = onSubmit(submittedName, submittedDir);
    // If the host returned a Promise, mark busy so the user can't
    // double-click Create while IPC is in flight. We don't await —
    // the host owns the dialog-close decision (e.g. closing only on
    // `{ kind: 'created' }`).
    if (result !== undefined && typeof (result as Promise<void>).then === 'function') {
      setBusy(true);
      // Swallow the rejection here — the host surfaces it via the
      // store's `error` field. An unhandled rejection would be a
      // real bug; we deliberately ignore the value.
      (result as Promise<void>).catch(() => undefined);
    }
  };

  const handleBackdropClick = (): void => {
    setOpen(false);
  };

  const handleDialogClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    // Prevent backdrop-click from firing when the user clicks
    // anywhere inside the dialog body. Mirrors ConfirmDialog.
    e.stopPropagation();
  };

  const handleOverlayKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleBrowse = async (): Promise<void> => {
    // Type-narrowed read of the preload bridge. In a real renderer
    // this is non-nullable (preload/index.ts always installs it);
    // the guard is for jsdom where tests may or may not install a
    // stub depending on which scenario is being exercised.
    const api = (globalThis as { window?: { autosarApi?: AutosarApiLike } }).window?.autosarApi;
    if (api === undefined) return;
    const result = await api.pickDir({ defaultPath: dir || undefined });
    if (result.kind === 'picked') {
      setDir(result.dirPath);
    }
    // 'canceled' → leave the field alone, user may have a path
    // already typed that they want to keep.
  };

  // Map the validator's error kind to the localized message text.
  // We render the message text inside the `.field-error` slot so the
  // UI doesn't have to t() a key directly.
  const nameErrorText =
    nameError === 'empty'
      ? t(locale, 'app.error.projectNameEmpty')
      : nameError === 'invalid'
        ? t(locale, 'app.error.projectNameInvalid')
        : nameError === 'tooLong'
          ? t(locale, 'app.error.projectNameTooLong')
          : null;

  const titleId = 'npd-title';

  return createPortal(
    <div
      className="npd-overlay"
      data-testid="npd-overlay"
      onClick={handleBackdropClick}
      onKeyDown={handleOverlayKeyDown}
      role="presentation"
    >
      <div
        className="npd-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={handleDialogClick}
      >
        <div className="npd-header">
          <h2 id={titleId} data-testid="npd-title">
            {t(locale, 'newProject.title')}
          </h2>
          <button
            type="button"
            className="npd-close"
            aria-label="close"
            data-testid="npd-close"
            onClick={handleClose}
          >
            ✕
          </button>
        </div>

        <div className="npd-body">
          <div className="npd-field">
            <label htmlFor="npd-name" className="npd-label">
              {t(locale, 'newProject.nameLabel')}
            </label>
            <input
              ref={nameInputRef}
              id="npd-name"
              type="text"
              className={`npd-input${nameError !== null ? ' npd-input--error' : ''}`}
              data-testid="npd-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleNameKeyDown}
              autoComplete="off"
              spellCheck={false}
            />
            {nameErrorText !== null ? (
              <div className="npd-field-error" data-testid="npd-name-error">
                {nameErrorText}
              </div>
            ) : (
              <div className="npd-field-hint">{t(locale, 'newProject.nameHint')}</div>
            )}
          </div>

          <div className="npd-field">
            <label htmlFor="npd-dir" className="npd-label">
              {t(locale, 'newProject.dirLabel')}
            </label>
            <div className="npd-field-row">
              <input
                id="npd-dir"
                type="text"
                className="npd-input"
                data-testid="npd-dir-input"
                value={dir}
                onChange={(e) => setDir(e.target.value)}
                placeholder="C:\\projects"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="npd-browse"
                data-testid="npd-browse"
                onClick={() => {
                  void handleBrowse();
                }}
              >
                {t(locale, 'newProject.browse')}
              </button>
            </div>
            <div className="npd-filename-preview" data-testid="npd-filename-preview">
              {filenamePreview}
            </div>
          </div>
        </div>

        <div className="npd-footer">
          <button
            type="button"
            className="npd-btn npd-btn-cancel"
            data-testid="npd-cancel"
            onClick={handleCancel}
          >
            {t(locale, 'newProject.cancel')}
          </button>
          <button
            type="button"
            className="npd-btn npd-btn-create"
            data-testid="npd-create"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {t(locale, 'newProject.create')}
          </button>
        </div>

        <div className="npd-kbd-hint">
          <span>
            <kbd>Enter</kbd> {t(locale, 'newProject.create')}
          </span>
          <span>
            <kbd>Esc</kbd> {t(locale, 'newProject.cancel')}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
