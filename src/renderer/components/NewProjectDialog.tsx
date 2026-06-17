// NewProjectDialog — Sprint 12 #3 Phase 1 Task 1.
//
// Unified "new project" modal that replaces the previous two-step
// flow (PromptDialog → OS showSaveDialog). The dialog collects the
// project name and target directory in one place, previews the
// resulting `<dir>/<name>.autosarcfg.json` path live, validates the
// name as the user types, and hands the validated `{name, dir}` pair
// to a host-provided `onSubmit(name, dir, opts?)` callback. The
// callback owner (App.tsx → useProjectActions.submitNewProject) decides
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
// own the dirty-protection gating.
//
// Sprint 13+ Stage 3.3 — the dialog body embeds a `TemplateCardRow`
// (Empty / Classic / Clone). Only the Empty card is actionable in
// Stage 3.3; the others render the "coming soon" badge. Card
// selection is purely visual at this stage.
//
// Sprint 13+ Stage 3.4:
//   - The dialog lifts the templates-list IPC fetch from
//     `TemplateCardRow` so it can use the resolved rows to look up
//     the selected template's `bswmdPaths`.
//   - The dialog adds a `BswmdChipRow` under the template cards.
//     The chip row is only rendered for the Classic template
//     (or any template whose `bswmdPaths` is non-empty); for Empty
//     and Clone the row is suppressed entirely.
//   - `onSubmit` widens to `(name, dir, opts?)`; `opts.bswmdPaths`
//     carries the user-selected BSWMD absolute paths to the host
//     (which forwards them to `projectNew` IPC).
//
// What this component does NOT do (deferred to other tasks / phases):
//   - Overwrite-confirm flow when the target manifest already exists
//     (handled at the IPC layer + ConfirmDialog call site).
//   - Calling IPC directly (`window.autosarApi.projectNew`). The host
//     wires that through the `onSubmit` prop so the component stays
//     purely UI + form-state.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { Locale } from '@shared/i18n';
import { t } from '@shared/i18n';
import type { TemplateListResponse } from '@shared/types';

import { useArxmlStore } from '../store/useArxmlStore';

import { BswmdChipRow } from './BswmdChipRow';
import { validateProjectName } from './NewProjectDialog.validate';
import { TemplateCardRow } from './TemplateCardRow';
import { type TemplateRow } from './templates';

import './NewProjectDialog.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/**
 * Optional per-submit context passed from the dialog to the host. Stage
 * 3.4 currently only ships `bswmdPaths`; future stages (template
 * selection, etc.) can add fields here without breaking older
 * callers — every key is optional.
 */
export interface NewProjectSubmitOpts {
  /** Absolute paths of the BSWMDs the user pre-selected via
   *  `BswmdChipRow`. The host forwards them to the `projectNew`
   *  IPC; main writes them into the new manifest's
   *  `bswmdPaths`. */
  readonly bswmdPaths?: readonly string[];
}

/**
 * The host wires `onSubmit` to whatever pipeline it wants (typically
 * `useProjectActions.submitNewProject`). Returning a Promise is allowed —
 * the dialog does not await the result; the host is responsible for
 * closing the dialog on success or surfacing an error on failure.
 */
export interface NewProjectDialogProps {
  readonly onSubmit: (
    name: string,
    directory: string,
    opts?: NewProjectSubmitOpts,
  ) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// AutosarApi subset we touch. Typed narrowly so tests can stub
// `window.autosarApi` without pulling in the whole preload bridge.
// ---------------------------------------------------------------------------

interface AutosarApiLike {
  readonly pickDir: (req: {
    readonly defaultPath?: string;
    readonly locale?: 'zh-CN' | 'en';
  }) => Promise<
    { readonly kind: 'picked'; readonly dirPath: string } | { readonly kind: 'canceled' }
  >;
  readonly listTemplates: () => Promise<TemplateListResponse>;
}

// ---------------------------------------------------------------------------
// Hard-coded fallback for the "no templates on disk" case. The
// renderer's job is to keep the user productive even when the main
// process hasn't shipped the samples dir — so we always offer Empty.
// Mirrors `TemplateCardRow.FALLBACK_TEMPLATES` from Stage 3.3.
// ---------------------------------------------------------------------------

const FALLBACK_TEMPLATES: readonly TemplateRow[] = [
  {
    id: 'empty',
    displayNameKey: 'template.empty.displayName',
    descriptionKey: 'template.empty.description',
    fileCount: 0,
    bswmdPaths: [],
  },
];

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
  // Sprint 13+ Stage 3.3 — currently-selected template id. Visual
  // only at this stage; submission still flows through `onSubmit`.
  // Reset to null on dialog close (handled in the same effect that
  // resets name/dir).
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  // Sprint 13+ Stage 3.4 — the resolved list of templates (with
  // `bswmdPaths` per template) lives here. The dialog needs the
  // metadata to decide whether to render the chip row and to look
  // up the selected template's bswmdPaths.
  const [templates, setTemplates] = useState<readonly TemplateRow[]>([]);
  // `true` while the IPC fetch is still in flight. Cleared by the
  // .then() / .catch() handlers. Drives the loading skeleton in
  // TemplateCardRow.
  const [templatesLoading, setTemplatesLoading] = useState(true);
  // Stage 3.4 — absolute paths of the BSWMDs the user has currently
  // selected via the chip row. Reset to [] when the template changes
  // (so a previous Classic pick doesn't leak into an Empty pick) and
  // when the dialog closes.
  const [selectedBswmdPaths, setSelectedBswmdPaths] = useState<readonly string[]>([]);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Sprint 13+ Stage 3.4 — lift the templates IPC fetch from
  // TemplateCardRow (Stage 3.3 owned it there). The dialog re-fetches
  // the same list because it now needs the per-template `bswmdPaths`
  // metadata, and keeping the fetch in the row would force the row
  // to expose the underlying list to its host. Hoisting the fetch
  // up lets the dialog feed the row the resolved list directly.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setTemplatesLoading(true);
    const api = (globalThis as { window?: { autosarApi?: AutosarApiLike } }).window?.autosarApi;
    if (api === undefined || typeof api.listTemplates !== 'function') {
      // No preload bridge (jsdom without the stub), or the stub is
      // a partial that doesn't include listTemplates (e.g. an older
      // App test fixture). Still show Empty so the layout doesn't
      // collapse; a real renderer build always has the full bridge.
      setTemplates(FALLBACK_TEMPLATES);
      setTemplatesLoading(false);
      return (): void => {
        cancelled = true;
      };
    }
    void api
      .listTemplates()
      .then((res) => {
        if (cancelled) return;
        if (res.templates.length === 0) {
          setTemplates(FALLBACK_TEMPLATES);
        } else {
          setTemplates(res.templates);
        }
        setTemplatesLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Defensive: log the failure so a future regression is visible,
        // but degrade to the Empty-only fallback so the dialog still
        // works. The user can create an Empty project regardless.
        // eslint-disable-next-line no-console
        console.warn('[NewProjectDialog] listTemplates() failed; falling back to Empty', err);
        setTemplates(FALLBACK_TEMPLATES);
        setTemplatesLoading(false);
      });
    return (): void => {
      cancelled = true;
    };
  }, [open]);

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
    setSelectedTemplateId(null);
    setSelectedBswmdPaths([]);
    setTemplatesLoading(true);
    setTemplates([]);
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

  // Stage 3.4 — look up the selected template's bswmdPaths so we can
  // render the chip row. `undefined` when the IPC hasn't resolved or
  // the user hasn't picked a template yet.
  const selectedTemplate = templates.find((tmpl) => tmpl.id === selectedTemplateId);
  const selectedTemplateBswmdPaths = selectedTemplate?.bswmdPaths ?? [];
  const showBswmdChipRow = selectedTemplate !== undefined && selectedTemplateBswmdPaths.length > 0;

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
    // Stage 3.4 — forward the selected BSWMD paths (if any) via opts.
    // When the chip row wasn't shown (Empty / Clone / no template),
    // `selectedBswmdPaths` is [] so the IPC gets an empty array.
    const opts: NewProjectSubmitOpts = {
      bswmdPaths: [...selectedBswmdPaths],
    };
    const result = onSubmit(submittedName, submittedDir, opts);
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
    const result = await api.pickDir({ defaultPath: dir || undefined, locale });
    if (result.kind === 'picked') {
      setDir(result.dirPath);
    }
    // 'canceled' → leave the field alone, user may have a path
    // already typed that they want to keep.
  };

  // Stage 3.3 + 3.4 — template card selection. Switching templates
  // resets the BSWMD selection (a previous Classic pick of `Can.arxml`
  // should not leak into an Empty pick that doesn't show chips).
  const handleTemplateSelect = (templateId: string): void => {
    setSelectedTemplateId(templateId);
    setSelectedBswmdPaths([]);
  };

  // Stage 3.4 — BSWMD chip toggle. Adds the path if missing,
  // removes it if already present. The host receives the absolute
  // path so it can pass it straight to the projectNew IPC.
  const handleBswmdToggle = (absolutePath: string): void => {
    setSelectedBswmdPaths((prev) =>
      prev.includes(absolutePath)
        ? prev.filter((p) => p !== absolutePath)
        : [...prev, absolutePath],
    );
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

          {/* Sprint 13+ Stage 3.3 — template picker. Card selection
              is purely visual at this stage; submission is unchanged. */}
          <TemplateCardRow
            templates={templates}
            selectedId={selectedTemplateId}
            onSelect={handleTemplateSelect}
            loading={templatesLoading}
          />
          {/* Sprint 13+ Stage 3.4 — BSWMD chip multi-select. Renders
              only when the selected template ships BSWMDs (currently
              only Classic). Empty / Clone / unselected suppress the
              row entirely. */}
          {showBswmdChipRow ? (
            <BswmdChipRow
              bswmdPaths={selectedTemplateBswmdPaths}
              selectedPaths={selectedBswmdPaths}
              onToggle={handleBswmdToggle}
            />
          ) : null}
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
