// @vitest-environment jsdom
// P2 (spec §9.13) — fault injection at the App mount points: a throwing
// ParamEditor / ScriptPanel degrades to its in-panel error card while
// the rest of the shell keeps working.
// Reality note (ledger R1): scriptPanelOpen is useAppMainHandlers-local
// state, so the ScriptPanel case opens via the header toggle button.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.jsx';

// P3 note: ParamEditor is now inside a dockview panel via ParamEditorWrapper.
// The fault-injection mocks the WRAPPER component (which dockview renders)
// and wraps the throwing element in PanelErrorBoundary to mirror the real
// wrapper structure (wrapper = PanelErrorBoundary + business component).
vi.mock('../panels/wrappers/ParamEditorWrapper.js', async (importOriginal) => {
  const mod = await importOriginal<object>();
  const { PanelErrorBoundary } = await import('../components/PanelErrorBoundary.js');
  const { useArxmlStore } = await import('../store/useArxmlStore.js');
  return {
    ...mod,
    ParamEditorWrapper: () => {
      const locale = useArxmlStore.getState().locale;
      const ThrowingParamEditor = (): never => {
        throw new Error('boom: param editor fault');
      };
      return (
        <PanelErrorBoundary panel="param-editor" locale={locale}>
          <ThrowingParamEditor />
        </PanelErrorBoundary>
      );
    },
  };
});

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
afterEach(() => {
  cleanup();
  consoleErrorSpy.mockClear();
});

describe('App local error boundaries (P2 fault injection)', () => {
  it('throwing ParamEditor degrades to panel-error-param-editor; header survives', () => {
    render(<App />);
    expect(screen.getByTestId('panel-error-param-editor')).toHaveTextContent(
      'boom: param editor fault',
    );
    expect(screen.getByTestId('app-header')).toBeInTheDocument();
  });

  it('throwing ScriptPanel degrades to panel-error-script-panel inside its host', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('btn-scripts-toggle'));
    const host = screen.getByTestId('app-script-panel-host');
    expect(host.querySelector('[data-testid="panel-error-script-panel"]')).not.toBeNull();
    expect(screen.getByTestId('app-header')).toBeInTheDocument();
  });
});
