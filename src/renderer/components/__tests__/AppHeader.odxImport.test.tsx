// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppHeader } from '../AppHeader';

function renderHeader(args: {
  readonly onImportOdxExtract?: () => void;
  readonly odxExtractBusy?: boolean;
} = {}): void {
  render(
    <AppHeader
      onEcucModuleSelect={(): void => {}}
      canSelectEcucModule={false}
      scriptPanelOpen={false}
      onToggleScriptPanel={(): void => {}}
      onGenerate={(): void => {}}
      canGenerate={false}
      generateBusy={false}
      onOpenDbc={(): void => {}}
      dbcBusy={false}
      onOpenOdx={(): void => {}}
      odxBusy={false}
      onImportOdxExtract={args.onImportOdxExtract}
      odxExtractBusy={args.odxExtractBusy}
      onOpenDbcImport={(): void => {}}
      dbcImportBusy={false}
      onOpenXlsxBatch={(): void => {}}
      xlsxBatchBusy={false}
      onOpenDcmConfig={(): void => {}}
      canOpenDcmConfig={false}
      dcmConfigBusy={false}
    />,
  );
}

describe('AppHeader ODX-D diagnostic extract entry', () => {
  afterEach(() => cleanup());

  it('renders and invokes the explicit import entry', () => {
    const onImportOdxExtract = vi.fn();
    renderHeader({ onImportOdxExtract });
    fireEvent.click(screen.getByTestId('btn-menu-toggle'));
    const button = screen.getByTestId('btn-import-odx-diagnostic-extract');
    expect(button).not.toBeNull();
    fireEvent.click(button);
    expect(onImportOdxExtract).toHaveBeenCalledOnce();
  });

  it('disables the entry while ODX parsing or extraction is busy', () => {
    renderHeader({ odxExtractBusy: true });
    fireEvent.click(screen.getByTestId('btn-menu-toggle'));
    const button = screen.getByTestId('btn-import-odx-diagnostic-extract') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
