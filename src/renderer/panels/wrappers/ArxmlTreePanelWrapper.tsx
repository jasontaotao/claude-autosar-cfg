// src/renderer/panels/wrappers/ArxmlTreePanelWrapper.tsx
// P4 IA 重组 — Tree 独立 dock 面板包装（spec §6）
import { useContext } from 'react';
import { PanelErrorBoundary } from '../../components/PanelErrorBoundary.js';
import { Tree } from '../../components/tree/Tree.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';
import { WorkspaceContext } from '../WorkspaceContext.js';

export function ArxmlTreePanelWrapper(): JSX.Element {
  const locale = useArxmlStore((s) => s.locale);
  const ctx = useContext(WorkspaceContext);
  return (
    <PanelErrorBoundary panel="tree" locale={locale}>
      <Tree
        store={useArxmlStore}
        onContextMenu={
          ctx?.handleContextMenu as ((path: string, kind: 'module' | 'container' | 'reference' | 'bswmd', e: React.MouseEvent) => void) | undefined
        }
      />
    </PanelErrorBoundary>
  );
}
