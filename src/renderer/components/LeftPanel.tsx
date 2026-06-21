// LeftPanel — Tab-based left sidebar.
//
// Replaces the previous vertical stack of ProjectPanel + Tree +
// ValidationPanel with a tabbed layout:
//
//   ┌───────────────────────┐
//   │ [项目] [文件] [验证]  │  ← tab bar (fixed)
//   ├───────────────────────┤
//   │  (tab content area)   │  ← scrollable
//   ├───────────────────────┤
//   │  Tree                 │  ← always visible, fixed
//   └───────────────────────┘
//
// Tab visibility (Sprint 13+ Q5 — three tabs always visible):
//   - Loose mode: project tab shows a localized empty placeholder;
//     the "create / open" CTA lives inside the files tab
//   - Project mode: project tab shows ProjectPanelInfo (project meta
//     + ARXML list (read-only) + BSWMD list (with "+" add))
//
// The Tree is always rendered below the tab area, outside the tab
// switching logic, so it remains visible regardless of active tab.

import type { JSX, MouseEvent as ReactMouseEvent } from 'react';

import { t } from '@shared/i18n';

import { useProjectActions } from '../hooks/useProjectActions';
import { useArxmlStore } from '../store/useArxmlStore';

import { FileListTab } from './FileListTab';
import { ProjectPanelInfo } from './ProjectPanel';
import { ValidationPanel } from './ValidationPanel';
import { Tree } from './tree/Tree';

import './LeftPanel.css';

type TabId = 'project' | 'files' | 'validate';

interface TabDef {
  readonly id: TabId;
  readonly labelKey: Parameters<typeof t>[1];
}

const TABS: readonly TabDef[] = [
  { id: 'project', labelKey: 'leftPanel.tab.project' },
  { id: 'files', labelKey: 'leftPanel.tab.files' },
  { id: 'validate', labelKey: 'leftPanel.tab.validate' },
];

export interface LeftPanelProps {
  /**
   * Sprint 14 / Task 11 — open the ECUC picker for a specific BSWMD
   * (the per-row "+" / `📋 N/M` chip click). When omitted (AppHeader
   * menu click), the picker opens with no pre-selection. App.tsx owns
   * the picker state; LeftPanel just forwards the click.
   */
  readonly onAddEcucFromBswmd?: (bswmdPath: string) => void;
  /**
   * Sprint A X2 — P0-3 wiring: forwarded to `<Tree />` so a right-click
   * on a tree row opens the global ContextMenu. The host (App.tsx)
   * passes a callback that captures the MouseEvent (to read
   * clientX / clientY) before forwarding to `openContextMenu`. The
   * Tree's own prop signature is `(path, kind)` so we match that
   * shape here for forward-compat; the MouseEvent capture happens
   * inside the host. Optional for back-compat with existing call
   * sites.
   */
  readonly onContextMenu?: (
    path: string,
    kind: 'module' | 'container' | 'reference',
    e: ReactMouseEvent,
  ) => void;
}

export function LeftPanel({ onAddEcucFromBswmd, onContextMenu }: LeftPanelProps = {}): JSX.Element {
  const leftTab = useArxmlStore((s) => s.leftTab);
  const setLeftTab = useArxmlStore((s) => s.setLeftTab);
  const locale = useArxmlStore((s) => s.locale);
  const project = useArxmlStore((s) => s.project);
  const projectPath = useArxmlStore((s) => s.projectPath);
  const closeProject = useArxmlStore((s) => s.closeProject);
  const removeDocument = useArxmlStore((s) => s.removeDocument);
  const errors = useArxmlStore((s) => s.validationErrors);
  const lastValidatedAt = useArxmlStore((s) => s.lastValidatedAt);
  const { addBswmdFromDialog, removeBswmdWithGuard } = useProjectActions();

  const isProjectOpen = project !== null && projectPath !== null;

  // Sprint 13+ Q5 — the project tab is always visible. The store-level
  // `leftTab` value is the single source of truth for which tab is
  // active; we no longer force a fallback to 'files' on first
  // loose-mode render. If a persisted 'project' id is in the store,
  // we just render the empty placeholder in that tab.
  const activeTab = leftTab;

  const errorCount = lastValidatedAt !== null ? errors.length : 0;

  return (
    <div className="left-panel" data-tour-id="left-panel">
      {/* Tab bar */}
      <div className="left-panel-tabs" role="tablist">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const label = t(locale, tab.labelKey);
          const showBadge = tab.id === 'validate' && errorCount > 0;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`left-tab-${tab.id}`}
              aria-controls={`left-pane-${tab.id}`}
              className={`left-panel-tab${isActive ? ' is-active' : ''}`}
              aria-selected={isActive}
              onClick={() => setLeftTab(tab.id)}
              data-testid={`left-tab-${tab.id}`}
            >
              {label}
              {showBadge && <span className="left-panel-tab-badge">{errorCount}</span>}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="left-panel-content">
        {activeTab === 'project' && (
          <div
            className="left-panel-pane"
            role="tabpanel"
            id="left-pane-project"
            aria-labelledby="left-tab-project"
            data-testid="left-pane-project"
          >
            {isProjectOpen ? (
              <ProjectPanelInfo
                locale={locale}
                manifest={project}
                manifestPath={projectPath}
                onClose={closeProject}
                onRemoveArxml={removeDocument}
                onAddBswmd={() => void addBswmdFromDialog()}
                onRemoveBswmd={(path) => void removeBswmdWithGuard(path)}
                // Sprint 14 / Task 11 — both the "+" button and the
                // `📋 N/M` chip open the same picker but with different
                // pre-selection semantics. App.tsx ignores the chip-vs-
                // button distinction today (both open with the
                // BSWMD pre-selected); future UX can branch the chip
                // to a configure panel instead.
                onAddEcuc={onAddEcucFromBswmd}
                onConfigureModules={onAddEcucFromBswmd}
              />
            ) : (
              <div className="left-panel-pane-empty" data-testid="left-pane-project-empty">
                {t(locale, 'leftPanel.project.empty')}
              </div>
            )}
          </div>
        )}
        {activeTab === 'files' && (
          <div
            className="left-panel-pane"
            role="tabpanel"
            id="left-pane-files"
            aria-labelledby="left-tab-files"
            data-testid="left-pane-files"
          >
            <FileListTab />
          </div>
        )}
        {activeTab === 'validate' && (
          <div
            className="left-panel-pane"
            role="tabpanel"
            id="left-pane-validate"
            aria-labelledby="left-tab-validate"
            data-testid="left-pane-validate"
          >
            <ValidationPanel embedded />
          </div>
        )}
      </div>

      {/* Tree — always visible below tabs. Sprint A X2 forwards the
          host's onContextMenu so a right-click on a tree row opens
          the global ContextMenu via the host-wired router. */}
      <div className="left-panel-tree">
        <Tree store={useArxmlStore} onContextMenu={onContextMenu} />
      </div>
    </div>
  );
}
