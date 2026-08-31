// P5 — renderer diagnostics ring buffer panel wrapper.
import { DiagnosticsPanel } from '../../components/DiagnosticsPanel.js';
import { PanelErrorBoundary } from '../../components/PanelErrorBoundary.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';

export function DiagnosticsPanelWrapper(): JSX.Element {
  const locale = useArxmlStore((s) => s.locale);
  return (
    <PanelErrorBoundary panel="diagnostics" locale={locale}>
      <DiagnosticsPanel />
    </PanelErrorBoundary>
  );
}
