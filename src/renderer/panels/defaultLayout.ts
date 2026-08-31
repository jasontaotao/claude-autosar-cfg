// src/renderer/panels/defaultLayout.ts
// P3 Dock 工作台 — 默认布局（spec §5.4）
// left-panel 居左 30%，param-editor 居右 70%。script-panel 默认折叠
// （不在默认布局中）。viewer 面板按需打开。
// 注意：实际 serialize() 输出格式以 dockview@8.2.0 为准，此对象
// 用于 api.fromJSON() 恢复或 api.addPanel() 构建默认布局。
export const DEFAULT_LAYOUT = {
  version: 1,
  panels: ['left-panel', 'param-editor'] as const,
  orientation: 'HORIZONTAL' as const,
  splits: [30, 70] as const,
};
