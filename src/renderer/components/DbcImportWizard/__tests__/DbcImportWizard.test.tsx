// @vitest-environment jsdom
//
// DbcImportWizard — v1.23.0 T4 (3-Step Wizard UI + Menu Wiring).
//
// 3-step modal that bridges the renderer-side DBC parser output
// (DbcSummary) to the main-side v1.23.0 T3 IPC handler
// (`window.autosarApi.dbcImportComStack`). Behaviour pinned by tests:
//   1. Step 1 (SelectDbc) renders by default — pick-file CTA
//   2. Step 2 (PreviewMapping) renders when DBC summary is provided
//      AND shows a targetNode <select> populated from dbc.nodes
//   3. The targetNode dropdown advances to Step 3 only when the
//      user has picked a node (defensive: IPC also validates)
//   4. Step 3 (ConfirmApply) shows the 3-file write warning
//   5. Apply button calls onApply(dbcContent, targetNode) — both
//      values are required by the IPC handler
//   6. Close button + Escape key fire onClose

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DbcSummary } from '@shared/types';

import { DbcImportWizard } from '../DbcImportWizard';

const SAMPLE_SUMMARY: DbcSummary = {
  version: '1.0',
  nodeCount: 2,
  messageCount: 2,
  nodes: ['ECM', 'TCM'],
  messages: [
    { id: 272, name: 'EngState', dlc: 8, transmitter: 'ECM', signalCount: 2 },
    { id: 273, name: 'TransState', dlc: 8, transmitter: 'TCM', signalCount: 1 },
  ],
};

const SAMPLE_DBC_CONTENT = 'VERSION "" raw DBC content';

describe('DbcImportWizard (v1.23.0 T4)', () => {
  afterEach(() => cleanup());

  it('step 1 (SelectDbc) renders by default with a pick-file CTA', () => {
    render(<DbcImportWizard onClose={vi.fn()} onApply={vi.fn()} />);
    expect(screen.getByTestId('dbc-wizard-title').textContent).toMatch(/Import DBC/i);
    expect(screen.getByTestId('dbc-wizard-step-select')).not.toBeNull();
    expect(screen.getByTestId('dbc-wizard-pick-file')).not.toBeNull();
  });

  it('advances to step 2 (PreviewMapping) when initialDbc is provided — shows DBC messages and targetNode dropdown', () => {
    render(
      <DbcImportWizard
        initialDbc={SAMPLE_SUMMARY}
        dbcContent={SAMPLE_DBC_CONTENT}
        onClose={vi.fn()}
        onApply={vi.fn()}
      />,
    );
    // Step 2 root present
    expect(screen.getByTestId('dbc-wizard-step-preview')).not.toBeNull();
    // DBC messages from the summary are listed
    expect(screen.getByText(/EngState/)).not.toBeNull();
    expect(screen.getByText(/TransState/)).not.toBeNull();
    // CRITICAL: targetNode <select> is populated from dbc.nodes
    const select = screen.getByTestId('dbc-wizard-target-node') as HTMLSelectElement;
    expect(select).not.toBeNull();
    const optionLabels = within(select)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value);
    expect(optionLabels).toContain('ECM');
    expect(optionLabels).toContain('TCM');
  });

  it('Next button is disabled until a targetNode is selected (defensive — IPC also validates)', () => {
    render(
      <DbcImportWizard
        initialDbc={SAMPLE_SUMMARY}
        dbcContent={SAMPLE_DBC_CONTENT}
        onClose={vi.fn()}
        onApply={vi.fn()}
      />,
    );
    const nextBtn = screen.getByTestId('dbc-wizard-next');
    expect(nextBtn).toBeDisabled();
  });

  it('selecting a targetNode enables the Next button and advances to step 3 (ConfirmApply)', () => {
    render(
      <DbcImportWizard
        initialDbc={SAMPLE_SUMMARY}
        dbcContent={SAMPLE_DBC_CONTENT}
        onClose={vi.fn()}
        onApply={vi.fn()}
      />,
    );
    const select = screen.getByTestId('dbc-wizard-target-node') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'ECM' } });
    const nextBtn = screen.getByTestId('dbc-wizard-next');
    expect(nextBtn).not.toBeDisabled();
    fireEvent.click(nextBtn);
    // Step 3 root present, with the 3-file write warning
    expect(screen.getByTestId('dbc-wizard-step-confirm')).not.toBeNull();
    expect(screen.getByTestId('dbc-wizard-warning').textContent).toMatch(/3/i);
  });

  it('Apply button calls onApply with both dbcContent and targetNode', () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(
      <DbcImportWizard
        initialDbc={SAMPLE_SUMMARY}
        dbcContent={SAMPLE_DBC_CONTENT}
        onClose={vi.fn()}
        onApply={onApply}
      />,
    );
    const select = screen.getByTestId('dbc-wizard-target-node') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'TCM' } });
    fireEvent.click(screen.getByTestId('dbc-wizard-next'));
    fireEvent.click(screen.getByTestId('dbc-wizard-apply'));
    expect(onApply).toHaveBeenCalledWith('VERSION "" raw DBC content', 'TCM');
  });

  it('close button fires onClose; Escape key fires onClose', () => {
    const onClose = vi.fn();
    const { rerender } = render(<DbcImportWizard onClose={onClose} onApply={vi.fn()} />);
    // Step 1 — close button
    fireEvent.click(screen.getByTestId('dbc-wizard-close'));
    expect(onClose).toHaveBeenCalledTimes(1);

    // Rerender with onClose reset, then test Escape on step 2
    onClose.mockReset();
    rerender(
      <DbcImportWizard
        initialDbc={SAMPLE_SUMMARY}
        dbcContent={SAMPLE_DBC_CONTENT}
        onClose={onClose}
        onApply={vi.fn()}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
