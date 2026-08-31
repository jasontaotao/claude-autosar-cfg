// @vitest-environment jsdom
// P2 (spec §9.13) — fault injection at the App mount points: a throwing
// ParamEditor / ScriptPanel degrades to its in-panel error card while
// the rest of the shell keeps working.
// Reality note (ledger R1): scriptPanelOpen is useAppMainHandlers-local
// state, so the ScriptPanel case opens via the header toggle button.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App.jsx';

vi.mock('../components/editor/ParamEditor.js', () => ({
  ParamEditor: () => {
    throw new Error('boom: param editor fault');
  },
}));
vi.mock('../components/ScriptPanel/ScriptPanel.js', () => ({
  ScriptPanel: () => {
    throw new Error('boom: script panel fault');
  },
}));

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
