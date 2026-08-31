// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { DiagnosticsPanel } from '../DiagnosticsPanel.js';

describe('DiagnosticsPanel', () => {
  beforeEach(() => {
    useArxmlStore.setState({ diagnostics: [] });
    useArxmlStore.getState().setLocale('en');
  });

  it('renders an empty state', () => {
    render(<DiagnosticsPanel />);
    expect(screen.getByTestId('diagnostics-empty')).toBeInTheDocument();
  });

  it('keeps toast history and shows newest first', () => {
    useArxmlStore.getState().setInfo('first');
    useArxmlStore.getState().setError('second');
    render(<DiagnosticsPanel />);
    const items = screen.getAllByTestId('diagnostics-item');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('second');
    expect(items[1]?.textContent).toContain('first');
  });

  it('filters errors without losing the full history', () => {
    const store = useArxmlStore.getState();
    store.setInfo('informational');
    store.setError('failure');
    render(<DiagnosticsPanel />);
    fireEvent.click(screen.getByTestId('diagnostics-filter-error'));
    expect(screen.getAllByTestId('diagnostics-item')).toHaveLength(1);
    expect(screen.getByTestId('diagnostics-panel').textContent).toContain('failure');
    fireEvent.click(screen.getByTestId('diagnostics-filter-all'));
    expect(screen.getAllByTestId('diagnostics-item')).toHaveLength(2);
  });

  it('clears diagnostics', () => {
    useArxmlStore.getState().setWarning('warning');
    render(<DiagnosticsPanel />);
    fireEvent.click(screen.getByTestId('diagnostics-clear'));
    expect(useArxmlStore.getState().diagnostics).toHaveLength(0);
    expect(screen.getByTestId('diagnostics-empty')).toBeInTheDocument();
  });

  it('expands detail fields', () => {
    const entry = useArxmlStore.getState().appendDiagnostic({
      level: 'debug',
      source: 'test',
      message: 'state snapshot',
      detail: 'docs=6 paths=6',
    });
    render(<DiagnosticsPanel />);
    fireEvent.click(screen.getByTestId(`diagnostics-toggle-${entry.id}`));
    const item = screen.getAllByTestId('diagnostics-item')[0];
    const detail = within(item!).getByTestId(`diagnostics-detail-${entry.id}`);
    expect(detail.textContent).toContain('docs=6 paths=6');
  });
});
