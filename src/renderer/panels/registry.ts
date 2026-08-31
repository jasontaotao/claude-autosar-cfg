// src/renderer/panels/registry.ts
// P4 IA 重组 — 面板注册表（spec §6）
// 8 个面板：left-panel 退役，拆为 project/files/validation/arxml-tree。
import type { ComponentType } from 'react';

import { ArxmlTreePanelWrapper } from './wrappers/ArxmlTreePanelWrapper.js';
import { DbcViewerWrapper } from './wrappers/DbcViewerWrapper.js';
import { FilesPanelWrapper } from './wrappers/FilesPanelWrapper.js';
import { OdxViewerWrapper } from './wrappers/OdxViewerWrapper.js';
import { ParamEditorWrapper } from './wrappers/ParamEditorWrapper.js';
import { ProjectPanelWrapper } from './wrappers/ProjectPanelWrapper.js';
import { ScriptPanelWrapper } from './wrappers/ScriptPanelWrapper.js';
import { ValidationPanelWrapper } from './wrappers/ValidationPanelWrapper.js';

/** Stable panel id — never rename (layout persistence references id). */
export type PanelId =
  | 'project'
  | 'files'
  | 'validation'
  | 'arxml-tree'
  | 'param-editor'
  | 'script-panel'
  | 'dbc-viewer'
  | 'odx-viewer';

/** defaultGroup: 'viewer' activates in P4 (DBC/ODX open into viewer tab group). */
export type DefaultGroup = 'left' | 'center' | 'bottom' | 'viewer';

export interface PanelDef {
  readonly id: PanelId;
  readonly component: ComponentType;
  readonly titleKey: string;
  readonly defaultGroup: DefaultGroup;
}

export const PANEL_REGISTRY: readonly PanelDef[] = [
  {
    id: 'project',
    component: ProjectPanelWrapper,
    titleKey: 'panels.project',
    defaultGroup: 'left',
  },
  { id: 'files', component: FilesPanelWrapper, titleKey: 'panels.files', defaultGroup: 'left' },
  {
    id: 'validation',
    component: ValidationPanelWrapper,
    titleKey: 'panels.validation',
    defaultGroup: 'left',
  },
  {
    id: 'arxml-tree',
    component: ArxmlTreePanelWrapper,
    titleKey: 'panels.arxmlTree',
    defaultGroup: 'left',
  },
  {
    id: 'param-editor',
    component: ParamEditorWrapper,
    titleKey: 'panels.paramEditor',
    defaultGroup: 'center',
  },
  {
    id: 'script-panel',
    component: ScriptPanelWrapper,
    titleKey: 'panels.scriptPanel',
    defaultGroup: 'bottom',
  },
  {
    id: 'dbc-viewer',
    component: DbcViewerWrapper,
    titleKey: 'panels.dbcViewer',
    defaultGroup: 'viewer',
  },
  {
    id: 'odx-viewer',
    component: OdxViewerWrapper,
    titleKey: 'panels.odxViewer',
    defaultGroup: 'viewer',
  },
] as const;

export function getPanelDef(id: string): PanelDef | undefined {
  return PANEL_REGISTRY.find((p) => p.id === id);
}
