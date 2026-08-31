// src/renderer/panels/wrappers/DbcViewerWrapper.tsx
// P3 Dock 工作台 — DbcViewer 包装组件（spec §5.3）
// P3 中 DBC viewer 保持 modal 行为；wrapper 为 P4 dock 迁移预留。
// state 由 App 通过 WorkspaceContext 注入。
import { useContext } from 'react';
import { PanelErrorBoundary } from '../../components/PanelErrorBoundary.js';
import { DbcViewer } from '../../components/DbcViewer/DbcViewer.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';
import { WorkspaceContext } from '../WorkspaceContext.js';

export function DbcViewerWrapper(): JSX.Element {
  const locale = useArxmlStore((s) => s.locale);
  const ctx = useContext(WorkspaceContext);
  return (
    <PanelErrorBoundary panel="dbc-viewer" locale={locale}>
      <DbcViewer
        open={ctx?.dbcOpen ?? false}
        path={ctx?.dbcPath ?? ''}
        summary={ctx?.dbcSummary ?? null}
        locale={locale}
        onClose={ctx?.dbcOnClose ?? (() => {})}
      />
    </PanelErrorBoundary>
  );
}
