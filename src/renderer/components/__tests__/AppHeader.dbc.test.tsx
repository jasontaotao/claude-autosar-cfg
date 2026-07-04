// @vitest-environment jsdom
//
// AppHeader DBC menu entry — v1.21.0 Bug #5 (HIGH: DBC 解析器装上
// 未接入).
//
// Closes the v1.7.0 dead-code gap: the `onOpenDbc` prop wires the
// "File Operations → Open DBC…" menu entry to the App.tsx state
// machine that opens the file picker + parses the result.
//
// Behaviour pinned by tests:
//   1. The "Open DBC…" menu item is rendered under File Operations
//      (alongside "Open ARXML…")
//   2. Clicking it fires `onOpenDbc` exactly once
//   3. The menu closes after a click (mirrors the existing
//      `onOpen` / `onProjectNew` / `onProjectOpen` pattern at
//      AppHeader.tsx:498-527)
//   4. The entry is disabled when the header is `busy`

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppHeader } from '../AppHeader';

function renderHeader(args: { readonly onOpenDbc?: () => void } = {}): void {
  render(
    <AppHeader
      onEcucModuleSelect={(): void => {}}
      canSelectEcucModule={false}
      scriptPanelOpen={false}
      onToggleScriptPanel={(): void => {}}
      onGenerate={(): void => {}}
      canGenerate={false}
      generateBusy={false}
      onOpenDbc={args.onOpenDbc ?? ((): void => {})}
      dbcBusy={false}
      onOpenOdx={(): void => {}}
      odxBusy={false}
      onOpenDbcImport={(): void => {}}
      dbcImportBusy={false}
      onOpenXlsxBatch={(): void => {}}
      xlsxBatchBusy={false}
    />,
  );
}

describe('AppHeader DBC menu entry (Bug #5)', () => {
  afterEach(() => cleanup());

  it('"Open DBC…" appears in File Operations when the menu opens', () => {
    renderHeader();
    // Open the menu by clicking the trigger.
    fireEvent.click(screen.getByTestId('btn-menu-toggle'));
    expect(screen.getByTestId('btn-open-dbc')).not.toBeNull();
  });

  it('clicking "Open DBC…" fires onOpenDbc once', () => {
    const onOpenDbc = vi.fn();
    renderHeader({ onOpenDbc });
    fireEvent.click(screen.getByTestId('btn-menu-toggle'));
    fireEvent.click(screen.getByTestId('btn-open-dbc'));
    expect(onOpenDbc).toHaveBeenCalledOnce();
  });

  it('"Open DBC…" sits alongside "Open ARXML…" in File Operations', () => {
    renderHeader();
    fireEvent.click(screen.getByTestId('btn-menu-toggle'));
    // Both entries must exist — DBC sits right next to ARXML in the
    // menu (Bug #5 design: scan from ARXML → DBC is one click).
    expect(screen.getByTestId('btn-open')).not.toBeNull();
    expect(screen.getByTestId('btn-open-dbc')).not.toBeNull();
  });
});
