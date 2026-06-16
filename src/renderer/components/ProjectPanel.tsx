// ProjectPanel — Sprint 11 Phase 1.
//
// Sidebar section that surfaces project metadata when a project is open.
// Lives above the Tree in the left-column. Shows:
//   - project name + manifest path (tooltip)
//   - list of value-side ARXMLs (basename + remove button)
//   - list of BSWMDs (basename, no remove button in Phase 1)
//   - Close Project button
//
// In loose mode (no project), renders a single-line hint prompting the
// user to create or open a project. This keeps the panel visible so the
// user knows the project concept exists, but it never eats vertical
// space from the Tree.
//
// Sprint 11 Phase 1 (Option A) i18n: every visible string goes through
// t(locale, key) so the panel flips between zh-CN and en with the
// AppHeader locale toggle.

import type { JSX } from 'react';

import { t } from '@shared/i18n';
import type { ProjectManifest } from '@shared/project';

import { useProjectActions } from '../hooks/useProjectActions';
import { useArxmlStore } from '../store/useArxmlStore';

import './ProjectPanel.css';

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

interface FileListProps {
  readonly title: string;
  readonly paths: readonly string[];
  readonly emptyHint: string;
  readonly testIdPrefix: string;
  readonly onRemove?: (path: string) => void;
}

function FileList({
  title,
  paths,
  emptyHint,
  testIdPrefix,
  onRemove,
}: FileListProps): JSX.Element {
  return (
    <div className="project-panel-section">
      <div className="project-panel-section-title">{title}</div>
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
                  aria-label={t(useArxmlStore.getState().locale, 'projectPanel.removeArxmlAria', {
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
  readonly locale: import('@shared/i18n').Locale;
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
  readonly locale: import('@shared/i18n').Locale;
  readonly manifest: ProjectManifest;
  readonly manifestPath: string;
  readonly onClose: () => void;
  readonly onRemoveArxml: (path: string) => void;
}

function OpenView({
  locale,
  manifest,
  manifestPath,
  onClose,
  onRemoveArxml,
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
      />
    </div>
  );
}

export function ProjectPanel(): JSX.Element {
  const project = useArxmlStore((s) => s.project);
  const projectPath = useArxmlStore((s) => s.projectPath);
  const removeDocument = useArxmlStore((s) => s.removeDocument);
  const closeProject = useArxmlStore((s) => s.closeProject);
  const locale = useArxmlStore((s) => s.locale);
  // Sprint 11 Phase 1 (H2 fix) — use the shared hook instead of
  // dispatching synthetic clicks on AppHeader's buttons. The hook
  // returns the same ProjectActionResult that AppHeader wires to its
  // local error banner; here we silently consume it (the panel is a
  // sidebar, not an error surface).
  const { newProject, openProjectFromDialog } = useProjectActions();

  // Loose mode — render the compact hint.
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
    />
  );
}
