// @vitest-environment jsdom
//
// UI-v2 regression: the main project menu should not repeat the icons
// already shown in the dock panel chrome. This keeps the menu compact
// and text-only.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AppHeader } from '../AppHeader';

function renderHeader(): void {
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

describe('AppHeader project menu (UI-v2)', () => {
  afterEach(() => cleanup());

  it('renders text-only menu items without duplicate icon chips', () => {
    renderHeader();
    fireEvent.click(screen.getByTestId('btn-menu-toggle'));
    expect(screen.getByTestId('btn-project-new')).toBeInTheDocument();
    expect(document.querySelectorAll('.app-dropdown-icon')).toHaveLength(0);
  });
});
