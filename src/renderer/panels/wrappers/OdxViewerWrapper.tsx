// src/renderer/panels/wrappers/OdxViewerWrapper.tsx
// P3 Dock 工作台 — OdxViewer 包装组件（spec §5.3）
// P3 中 ODX viewer 保持 modal 行为；wrapper 为 P4 dock 迁移预留。
import { useContext } from 'react';
import { PanelErrorBoundary } from '../../components/PanelErrorBoundary.js';
import { OdxViewer } from '../../components/OdxViewer/OdxViewer.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';
import { WorkspaceContext } from '../WorkspaceContext.js';

export function OdxViewerWrapper(): JSX.Element {
  const locale = useArxmlStore((s) => s.locale);
  const ctx = useContext(WorkspaceContext);
  return (
    <PanelErrorBoundary panel="odx-viewer" locale={locale}>
      <OdxViewer
        open={ctx?.odxOpen ?? false}
        path={ctx?.odxPath ?? ''}
        summary={ctx?.odxSummary ?? null}
        locale={locale}
        onClose={ctx?.odxOnClose ?? (() => {})}
        onExport={ctx?.odxOnExport ?? (() => {})}
        exporting={ctx?.odxExporting ?? false}
      />
    </PanelErrorBoundary>
  );
}
