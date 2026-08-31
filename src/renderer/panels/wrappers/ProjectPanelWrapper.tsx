// src/renderer/panels/wrappers/ProjectPanelWrapper.tsx
// P4 IA 重组 — ProjectPanel 独立 dock 面板包装（spec §6）
// 从 LeftPanel project tab 中提取，渲染 ProjectPanelInfo。
import { useContext } from 'react';
import { PanelErrorBoundary } from '../../components/PanelErrorBoundary.js';
import { ProjectPanelInfo } from '../../components/ProjectPanel.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';
import { useProjectActions } from '../../hooks/useProjectActions.js';
import { WorkspaceContext } from '../WorkspaceContext.js';

export function ProjectPanelWrapper(): JSX.Element {
  const locale = useArxmlStore((s) => s.locale);
  const project = useArxmlStore((s) => s.project);
  const projectPath = useArxmlStore((s) => s.projectPath);
  const closeProject = useArxmlStore((s) => s.closeProject);
  const removeDocument = useArxmlStore((s) => s.removeDocument);
  const { addBswmdFromDialog, removeBswmdWithFullFlow } = useProjectActions();
  const ctx = useContext(WorkspaceContext);

  const isProjectOpen = project !== null && projectPath !== null;

  return (
    <PanelErrorBoundary panel="validation-panel" locale={locale}>
      {isProjectOpen ? (
        <ProjectPanelInfo
          locale={locale}
          manifest={project}
          manifestPath={projectPath}
          onClose={closeProject}
          onRemoveArxml={removeDocument}
          onAddBswmd={() => void addBswmdFromDialog()}
          onRemoveBswmd={(path) => void removeBswmdWithFullFlow(path)}
          onAddEcuc={ctx?.handleAddEcucFromBswmd}
          onConfigureModules={ctx?.handleAddEcucFromBswmd}
        />
      ) : (
        <div className="left-panel-pane-empty" data-testid="left-pane-project-empty">
          {''}
        </div>
      )}
    </PanelErrorBoundary>
  );
}
