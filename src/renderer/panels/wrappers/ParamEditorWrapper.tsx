// src/renderer/panels/wrappers/ParamEditorWrapper.tsx
// P3 Dock 工作台 — ParamEditor 包装组件（spec §5.3）
import { useContext } from 'react';

import { ParamEditor } from '../../components/editor/ParamEditor.js';
import { WorkspaceContext } from '../WorkspaceContext.js';

export function ParamEditorWrapper(): JSX.Element {
  const ctx = useContext(WorkspaceContext);
  return <ParamEditor onOpenProject={ctx?.openProjectFromDialog} onNewProject={ctx?.newProject} />;
}
