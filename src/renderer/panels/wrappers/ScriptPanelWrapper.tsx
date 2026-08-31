// src/renderer/panels/wrappers/ScriptPanelWrapper.tsx
// P3 Dock 工作台 — ScriptPanel 包装组件（spec §5.3）
import { PanelErrorBoundary } from '../../components/PanelErrorBoundary.js';
import { ScriptPanel } from '../../components/ScriptPanel/ScriptPanel.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';

export function ScriptPanelWrapper(): JSX.Element {
  const locale = useArxmlStore((s) => s.locale);
  return (
    <PanelErrorBoundary panel="script-panel" locale={locale}>
      <ScriptPanel />
    </PanelErrorBoundary>
  );
}
