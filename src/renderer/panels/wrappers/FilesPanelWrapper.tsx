// src/renderer/panels/wrappers/FilesPanelWrapper.tsx
// P4 IA 重组 — FileListTab 独立 dock 面板包装（spec §6）
import { FileListTab } from '../../components/FileListTab.js';

export function FilesPanelWrapper(): JSX.Element {
  return <FileListTab />;
}
