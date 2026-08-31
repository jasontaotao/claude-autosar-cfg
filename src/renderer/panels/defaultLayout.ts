// src/renderer/panels/defaultLayout.ts
// P4 IA 重组 — 默认布局（spec §6）
// 左 30% 上下分：上为 project/files/validation tab 组，下为 arxml-tree。
// 右 70%：param-editor。script-panel 默认折叠（不在默认布局）。
// viewer 面板按需打开，加入 viewer tab 组。
export const DEFAULT_LAYOUT = {
  version: 2,
  panels: ['project', 'files', 'validation', 'arxml-tree', 'param-editor'] as const,
  orientation: 'HORIZONTAL' as const,
  splits: [30, 70] as const,
  leftVerticalSplit: [60, 40] as const,
};
