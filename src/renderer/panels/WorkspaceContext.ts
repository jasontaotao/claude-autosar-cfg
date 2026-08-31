// src/renderer/panels/WorkspaceContext.ts
// P3 Dock 工作台 — App → wrapper 通信上下文（spec §5.3）
// dockview 面板组件无法直接接收 props，通过 React Context 从 App
// 向 wrapper 注入回调和状态。App 在 <DockviewReact> 外层包 Provider。
import { createContext, useContext } from 'react';

export interface WorkspaceContextValue {
  // LeftPanel
  readonly handleAddEcucFromBswmd: (bswmdPath: string) => void;
  readonly handleContextMenu: (...args: unknown[]) => void;
  // ParamEditor
  readonly openProjectFromDialog: () => void;
  readonly newProject: () => void;
  // DbcViewer (P3 modal transition — P4 docks these)
  readonly dbcOpen: boolean;
  readonly dbcPath: string;
  readonly dbcSummary: unknown;
  readonly dbcOnClose: () => void;
  // OdxViewer
  readonly odxOpen: boolean;
  readonly odxPath: string;
  readonly odxSummary: unknown;
  readonly odxOnClose: () => void;
  readonly odxOnExport: () => void;
  readonly odxExporting: boolean;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspaceContext(): WorkspaceContextValue | null {
  return useContext(WorkspaceContext);
}
