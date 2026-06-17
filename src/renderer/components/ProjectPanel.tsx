// ProjectPanel — Sprint 11 Phase 1 + Sprint 12 #2 Task 5.
//
// Sidebar section that surfaces project metadata when a project is open.
// Lives above the Tree in the left-column. Shows:
//   - project name + manifest path (tooltip)
//   - list of value-side ARXMLs (basename + remove button)
//   - list of BSWMDs (basename + remove button, Sprint 12 #2)
//   - Close Project button
//
// Sprint 13 refactor: this file now ONLY exports `ProjectPanelInfo` —
// the open-mode render. Loose mode (no project open) is handled by
// `FileListTab` which renders its own compact New/Open header inline.
// The top-level `ProjectPanel` switch was removed because the new
// `LeftPanel` decides which tab to show; the "project" tab is hidden
// in loose mode, so ProjectPanel only needs the open branch.
//
// Sprint 11 Phase 1 (Option A) i18n: every visible string goes through
// t(locale, key) so the panel flips between zh-CN and en with the
// AppHeader locale toggle.

import type { JSX } from 'react';

import { t } from '@shared/i18n';
import type { Locale } from '@shared/i18n';
import { basename } from '@shared/path';
import type { ProjectManifest } from '@shared/project';

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

/**
 * Props for `ProjectPanelInfo`. The parent (`LeftPanel` in Sprint 13)
 * is responsible for the `project === null` gate and only mounts
 * `ProjectPanelInfo` when both `manifest` and `manifestPath` are
 * non-null. Keeping this component pure (no null guards inside) makes
 * the render path simple and the props contract obvious.
 */
export interface ProjectPanelInfoProps {
  readonly locale: Locale;
  readonly manifest: ProjectManifest;
  readonly manifestPath: string;
  readonly onClose: () => void;
  readonly onRemoveArxml: (path: string) => void;
  readonly onAddBswmd: () => void;
  readonly onRemoveBswmd: (path: string) => void;
}

/**
 * Sprint 13 refactor — renamed from the private `OpenView` and
 * exported. Mounted by `LeftPanel` as the body of the "project" tab
 * when a project is open. Pure render — no store reads, no hooks
 * beyond i18n lookups inside the leaf `FileList`.
 */
export function ProjectPanelInfo({
  locale,
  manifest,
  manifestPath,
  onClose,
  onRemoveArxml,
  onAddBswmd,
  onRemoveBswmd,
}: ProjectPanelInfoProps): JSX.Element {
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
