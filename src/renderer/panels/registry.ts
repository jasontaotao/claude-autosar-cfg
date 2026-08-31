// src/renderer/panels/registry.ts
// P3 Dock 工作台 — 面板注册表（spec §5.3）
// Panel id 一经注册永不改名（布局持久化引用 id）。
import type { ComponentType } from 'react';

import { DbcViewerWrapper } from './wrappers/DbcViewerWrapper.js';
import { LeftPanelWrapper } from './wrappers/LeftPanelWrapper.js';
import { OdxViewerWrapper } from './wrappers/OdxViewerWrapper.js';
import { ParamEditorWrapper } from './wrappers/ParamEditorWrapper.js';
import { ScriptPanelWrapper } from './wrappers/ScriptPanelWrapper.js';

/** Stable panel id — never rename (layout persistence references id). */
export type PanelId = 'left-panel' | 'param-editor' | 'script-panel' | 'dbc-viewer' | 'odx-viewer';

/** defaultGroup: 'viewer' is defined for P4 but not consumed in P3. */
export type DefaultGroup = 'left' | 'center' | 'bottom' | 'viewer';

export interface PanelDef {
  readonly id: PanelId;
  readonly component: ComponentType;
  readonly titleKey: string;
  readonly defaultGroup: DefaultGroup;
}

export const PANEL_REGISTRY: readonly PanelDef[] = [
  {
    id: 'left-panel',
    component: LeftPanelWrapper,
    titleKey: 'panels.leftPanel',
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
