// ProjectPanel — Sprint 11 Phase 1 + Sprint 12 #2 Task 5.
//
// Sidebar section that surfaces project metadata when a project is open.
// Lives above the Tree in the left-column. Shows:
//   - project name + manifest path (tooltip)
//   - list of value-side ARXMLs (basename + remove button)
//   - list of BSWMDs (basename + remove button, Sprint 12 #2)
//   - Close Project button
//
// In loose mode (no project), renders a single-line hint prompting the
// user to create or open a project. This keeps the panel visible so the
// user knows the project concept exists, but it never eats vertical
// space from the Tree. Sprint 12 #2 Task 5: loose mode does NOT show
// the BSWMD section at all — loose mode cannot load BSWMDs (user-
// confirmed design decision; the store-level gate happens inside
// `useProjectActions.addBswmdFromDialog`).
//
// Sprint 11 Phase 1 (Option A) i18n: every visible string goes through
// t(locale, key) so the panel flips between zh-CN and en with the
// AppHeader locale toggle.

import type { JSX } from 'react';

import { t } from '@shared/i18n';
import type { Locale } from '@shared/i18n';
import { basename } from '@shared/path';
import type { ProjectManifest } from '@shared/project';

import { useProjectActions } from '../hooks/useProjectActions';
import { useArxmlStore } from '../store/useArxmlStore';

import './ProjectPanel.css';

interface FileListProps {
  readonly title: string;
  readonly paths: readonly string[];
  readonly emptyHint: string;
  readonly testIdPrefix: string;
  readonly onAdd?: () => void;
  readonly addLabel?: string;
  readonly addAriaLabel?: string;
  readonly onRemove?: (path: string) => void;
}

function FileList({
  title,
  paths,
  emptyHint,
  testIdPrefix,
  onAdd,
  addLabel,
  addAriaLabel,
  onRemove,
}: FileListProps): JSX.Element {
  // Read locale on demand so re-renders track the store-level flip
  // without subscribing here (FileList is a small leaf component).
  const locale = useArxmlStore.getState().locale;
  return (
    <div className="project-panel-section">
      <div className="project-panel-section-title-row">
        <div className="project-panel-section-title">{title}</div>
        {onAdd !== undefined && addLabel !== undefined && (
          <button
            type="button"
            className="project-panel-section-add"
            data-testid={`${testIdPrefix}-add`}
            aria-label={addAriaLabel}
            onClick={onAdd}
          >
            {addLabel}
          </button>
        )}
      </div>
      {paths.length === 0 ? (
        <div className="project-panel-empty">{emptyHint}</div>
      ) : (
        <ul className="project-panel-list" data-testid={`${testIdPrefix}-list`}>
          {paths.map((p) => (
            <li key={p} className="project-panel-list-item">
              <span className="project-panel-list-name" title={p}>
                {basename(p)}
              </span>
              {onRemove !== undefined && (
                <button
                  type="button"
                  className="project-panel-list-remove"
                  aria-label={t(locale, 'projectPanel.removeArxmlAria', {
                    name: basename(p),
                  })}
                  data-testid={`${testIdPrefix}-remove-${p}`}
                  onClick={() => onRemove(p)}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface LooseViewProps {
  readonly locale: Locale;
  readonly onNew: () => void;
  readonly onOpen: () => void;
}

function LooseView({ locale, onNew, onOpen }: LooseViewProps): JSX.Element {
  return (
    <div className="project-panel project-panel-loose" data-testid="project-panel-loose">
      <span className="project-panel-loose-text">{t(locale, 'projectPanel.loose.text')}</span>
      <button
        type="button"
        className="project-panel-btn"
        onClick={onNew}
        data-testid="project-panel-loose-new"
      >
        {t(locale, 'projectPanel.loose.new')}
      </button>
      <button
        type="button"
        className="project-panel-btn"
        onClick={onOpen}
        data-testid="project-panel-loose-open"
      >
        {t(locale, 'projectPanel.loose.open')}
      </button>
    </div>
  );
}

interface OpenViewProps {
  readonly locale: Locale;
  readonly manifest: ProjectManifest;
  readonly manifestPath: string;
  readonly onClose: () => void;
  readonly onRemoveArxml: (path: string) => void;
  readonly onAddBswmd: () => void;
  readonly onRemoveBswmd: (path: string) => void;
}

function OpenView({
  locale,
  manifest,
  manifestPath,
  onClose,
  onRemoveArxml,
  onAddBswmd,
  onRemoveBswmd,
}: OpenViewProps): JSX.Element {
  return (
    <div className="project-panel project-panel-open" data-testid="project-panel-open">
      <header className="project-panel-header">
        <div className="project-panel-header-text">
          <div className="project-panel-title" title={manifestPath}>
            {manifest.name}
          </div>
          <div className="project-panel-subtitle">
            {t(locale, 'projectPanel.subtitle', {
              arxmlCount: manifest.valueArxmlPaths.length,
              bswmdCount: manifest.bswmdPaths.length,
            })}
          </div>
        </div>
        <button
          type="button"
          className="project-panel-close"
          onClick={onClose}
          data-testid="project-panel-close-btn"
          aria-label={t(locale, 'projectPanel.closeAria', { name: manifest.name })}
        >
          ×
        </button>
      </header>
      <FileList
        title={t(locale, 'projectPanel.arxml.title')}
        paths={manifest.valueArxmlPaths}
        emptyHint={t(locale, 'projectPanel.arxml.empty')}
        testIdPrefix="project-panel-arxml"
        onRemove={onRemoveArxml}
      />
      <FileList
        title={t(locale, 'projectPanel.bswmd.title')}
        paths={manifest.bswmdPaths}
        emptyHint={t(locale, 'projectPanel.bswmd.empty')}
        testIdPrefix="project-panel-bswmd"
        onAdd={onAddBswmd}
        addLabel={t(locale, 'projectPanel.bswmd.add')}
        addAriaLabel={t(locale, 'projectPanel.bswmd.addAria', { name: '' })}
        onRemove={onRemoveBswmd}
      />
    </div>
  );
}

export function ProjectPanel(): JSX.Element {
  const project = useArxmlStore((s) => s.project);
  const projectPath = useArxmlStore((s) => s.projectPath);
  const removeDocument = useArxmlStore((s) => s.removeDocument);
  const removeBswmd = useArxmlStore((s) => s.removeBswmd);
  const closeProject = useArxmlStore((s) => s.closeProject);
  const locale = useArxmlStore((s) => s.locale);
  // Sprint 11 Phase 1 (H2 fix) — use the shared hook instead of
  // dispatching synthetic clicks on AppHeader's buttons. The hook
  // returns the same ProjectActionResult that AppHeader wires to its
  // local error banner; here we silently consume it (the panel is a
  // sidebar, not an error surface).
  //
  // Sprint 12 #2 Task 5: `addBswmdFromDialog` is the loose-mode-aware
  // IPC + store.addBswmd wrapper. It's added by Sprint 12 #2 Task 4
  // (parallel); if Task 4 hasn't landed yet the property is undefined
  // and the add button silently no-ops, which is acceptable for the
  // Task 5 UI shell — the button itself renders, the wiring lights up
  // when Task 4 ships.
  const { newProject, openProjectFromDialog, addBswmdFromDialog } = useProjectActions();

  const handleAddBswmd = (): void => {
    if (addBswmdFromDialog === undefined) return;
    void addBswmdFromDialog();
  };

  // Loose mode — render the compact hint. Sprint 12 #2 Task 5: the
  // BSWMD section is intentionally absent here (loose mode cannot
  // load BSWMDs — user-confirmed design decision; the gate is also
  // enforced inside `useProjectActions.addBswmdFromDialog` for
  // defense in depth).
  if (project === null || projectPath === null) {
    return (
      <LooseView
        locale={locale}
        onNew={() => {
          void newProject();
        }}
        onOpen={() => {
          void openProjectFromDialog();
        }}
      />
    );
  }

  return (
    <OpenView
      locale={locale}
      manifest={project}
      manifestPath={projectPath}
      onClose={closeProject}
      onRemoveArxml={removeDocument}
      onAddBswmd={handleAddBswmd}
      onRemoveBswmd={removeBswmd}
    />
  );
}
