// src/renderer/panels/wrappers/ValidationPanelWrapper.tsx
// P4 IA 重组 — ValidationPanel 独立 dock 面板包装（spec §6）
import { PanelErrorBoundary } from '../../components/PanelErrorBoundary.js';
import { ValidationPanel } from '../../components/ValidationPanel.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';

export function ValidationPanelWrapper(): JSX.Element {
  const locale = useArxmlStore((s) => s.locale);
  return (
    <PanelErrorBoundary panel="validation-panel" locale={locale}>
      <ValidationPanel embedded />
    </PanelErrorBoundary>
  );
}
