// src/renderer/panels/wrappers/LeftPanelWrapper.tsx
// P3 Dock 工作台 — LeftPanel 包装组件（spec §5.3）
// 包装层负责从 App 提供的 WorkspaceContext 读取回调，注入业务组件。
// 业务组件 props 契约不变（spec §6 迁移约束）。
import { useContext } from 'react';
import { LeftPanel } from '../../components/LeftPanel.js';
import { WorkspaceContext } from '../WorkspaceContext.js';

export function LeftPanelWrapper(): JSX.Element {
  const ctx = useContext(WorkspaceContext);
  return (
    <LeftPanel
      onAddEcucFromBswmd={ctx?.handleAddEcucFromBswmd}
      onContextMenu={ctx?.handleContextMenu}
    />
  );
}
