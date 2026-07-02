// @vitest-environment jsdom
//
// AppHeader ODX menu entry — v1.22.0 T3 (HIGH: ODX 完全没做).
//
// Closes the v1.21.0 carry-over "ODX 完全没做" gap: the `onOpenOdx`
// prop wires the "File Operations → Open ODX…" menu entry to the
// App.tsx state machine that opens the file picker + parses the
// result.
//
// Mirrors the v1.21.0 T4 DBC menu entry pattern (AppHeader.dbc.test
// .tsx line-for-line).
//
// Behaviour pinned by tests (T3 Phase 2 — RED):
//   1. The "Open ODX…" menu item is rendered under File Operations
//      (alongside "Open ARXML…" + "Open DBC…")
//   2. Clicking it fires `onOpenOdx` exactly once
//   3. The entry is disabled when the header is `odxBusy`
//   4. The entry sits alongside "Open ARXML…" + "Open DBC…"

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppHeader } from '../AppHeader';

function renderHeader(
  args: { readonly onOpenOdx?: () => void; readonly odxBusy?: boolean } = {},
): void {
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
      onOpenOdx={args.onOpenOdx ?? ((): void => {})}
      odxBusy={args.odxBusy ?? false}
    />,
  );
}

describe('AppHeader ODX menu entry (T3)', () => {
  afterEach(() => cleanup());

  it('"Open ODX…" appears in File Operations when the menu opens', () => {
    renderHeader();
    fireEvent.click(screen.getByTestId('btn-menu-toggle'));
    expect(screen.getByTestId('btn-open-odx')).not.toBeNull();
  });

  it('clicking "Open ODX…" fires onOpenOdx once', () => {
    const onOpenOdx = vi.fn();
    renderHeader({ onOpenOdx });
    fireEvent.click(screen.getByTestId('btn-menu-toggle'));
    fireEvent.click(screen.getByTestId('btn-open-odx'));
    expect(onOpenOdx).toHaveBeenCalledOnce();
  });

  it('"Open ODX…" sits alongside "Open ARXML…" + "Open DBC…" in File Operations', () => {
    renderHeader();
    fireEvent.click(screen.getByTestId('btn-menu-toggle'));
    expect(screen.getByTestId('btn-open')).not.toBeNull();
    expect(screen.getByTestId('btn-open-dbc')).not.toBeNull();
    expect(screen.getByTestId('btn-open-odx')).not.toBeNull();
  });

  it('"Open ODX…" is disabled when odxBusy is true', () => {
    renderHeader({ odxBusy: true });
    fireEvent.click(screen.getByTestId('btn-menu-toggle'));
    const btn = screen.getByTestId('btn-open-odx');
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('"Open ODX…" is enabled when odxBusy is false', () => {
    renderHeader({ odxBusy: false });
    fireEvent.click(screen.getByTestId('btn-menu-toggle'));
    const btn = screen.getByTestId('btn-open-odx');
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});
