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
// Tab visibility:
//   - Loose mode (no project): only "files" and "validate" tabs
//   - Project mode: all three tabs
//
// The Tree is always rendered below the tab area, outside the tab
// switching logic, so it remains visible regardless of active tab.

import { useEffect, type JSX } from 'react';

import { t } from '@shared/i18n';

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
  /** Only visible when a project is open. */
  readonly projectOnly?: boolean;
}

const TABS: readonly TabDef[] = [
  { id: 'project', labelKey: 'leftPanel.tab.project', projectOnly: true },
  { id: 'files', labelKey: 'leftPanel.tab.files' },
  { id: 'validate', labelKey: 'leftPanel.tab.validate' },
];

export function LeftPanel(): JSX.Element {
  const leftTab = useArxmlStore((s) => s.leftTab);
  const setLeftTab = useArxmlStore((s) => s.setLeftTab);
  const locale = useArxmlStore((s) => s.locale);
  const project = useArxmlStore((s) => s.project);
  const errors = useArxmlStore((s) => s.validationErrors);
  const lastValidatedAt = useArxmlStore((s) => s.lastValidatedAt);

  const isProjectOpen = project !== null;

  // Filter tabs based on mode
  const visibleTabs = TABS.filter((tab) => !tab.projectOnly || isProjectOpen);

  // Loose-mode guard: when no project is open and the persisted leftTab
  // still says 'project' (e.g. the user just closed a project), fall
  // back to 'files' so subsequent renders and persistence stay in sync
  // with the visual fallback below. The effect runs after commit so
  // we're not mutating state during render.
  useEffect(() => {
    if (leftTab === 'project' && !isProjectOpen) {
      setLeftTab('files');
    }
  }, [leftTab, isProjectOpen, setLeftTab]);

  // Ensure active tab is valid for current mode
  const activeTab =
    leftTab === 'project' && !isProjectOpen ? 'files' : leftTab;

  const errorCount = lastValidatedAt !== null ? errors.length : 0;

  return (
    <div className="left-panel">
      {/* Tab bar */}
      <div className="left-panel-tabs" role="tablist">
        {visibleTabs.map((tab) => {
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
              {showBadge && (
                <span className="left-panel-tab-badge">{errorCount}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="left-panel-content">
        {activeTab === 'project' && isProjectOpen && (
          <div
            className="left-panel-pane"
            role="tabpanel"
            id="left-pane-project"
            aria-labelledby="left-tab-project"
            data-testid="left-pane-project"
          >
            <ProjectPanelInfo />
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

      {/* Tree — always visible below tabs */}
      <div className="left-panel-tree">
        <Tree store={useArxmlStore} />
      </div>
    </div>
  );
}
