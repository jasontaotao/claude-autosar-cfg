// @vitest-environment jsdom
//
// OdxViewer — v1.22.0 T2 (HIGH: ODX 完全没做).
//
// Read-only modal that renders an `OdxSummary` (see
// `src/shared/types.ts`) produced by the main-side
// `parseOdxHandler` (src/main/ipc/parseOdxHandler.ts). Closes the
// v1.21.0 carry-over "ODX 完全没做" gap by giving the user a visible
// UI affordance for "open a .odx file".
//
// Three tabs mirror the ODX-D diagnostic surface: DTCs (trouble
// codes), DIDs (data identifiers), and Routines. Each tab is a
// separate table; the stats strip at the top shows counts. Mirrors
// the v1.21.0 T4 DbcViewer modal a11y pattern (Escape + backdrop-
// click + initial focus).
//
// Behaviour pinned by tests (T2 Phase 2 — RED):
//   1. Renders the title with the source filename
//   2. Renders the stats strip with DTC/DID/Routine counts
//   3. DTC tab: one row per DTC with id, name, troubleCode, text
//   4. DID tab: one row per DID with id, name
//   5. Routine tab: one row per routine with id, name
//   6. Empty tabs show a localized "no {kind}" hint (not a crash)
//   7. Close button fires onClose
//   8. Error state shows a localized error banner (not the table)
//   9. Escape key fires onClose
//  10. Backdrop click fires onClose; modal body click does NOT
//  11. Initial focus on the close button
//  12. Localizes the title in zh-CN

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OdxSummary } from '@shared/types';

import { OdxViewer } from '../OdxViewer';

const SAMPLE_SUMMARY: OdxSummary = {
  dtcCount: 2,
  didCount: 1,
  routineCount: 1,
  dtcs: [
    {
      id: 'DTC_001',
      shortName: 'DTC_EngineOverheat',
      troubleCode: '0x123456',
      displayCode: '123456',
      text: 'Engine coolant temperature too high',
    },
    {
      id: 'DTC_002',
      shortName: 'DTC_BatteryLow',
      troubleCode: '0xABCDEF',
      displayCode: 'ABCDEF',
      text: 'System voltage low',
    },
  ],
  dids: [{ id: 'DID_001', shortName: 'DID_VIN_Read' }],
  routines: [{ id: 'REQ_001', shortName: 'Routine_Check_Req' }],
};

const EMPTY_SUMMARY: OdxSummary = {
  dtcCount: 0,
  didCount: 0,
  routineCount: 0,
  dtcs: [],
  dids: [],
  routines: [],
};

describe('OdxViewer (T2)', () => {
  afterEach(() => cleanup());

  it('renders the title with the source filename', () => {
    render(
      <OdxViewer
        open
        path="/tmp/diag.odx"
        summary={SAMPLE_SUMMARY}
        locale="en"
        onClose={vi.fn()}
        onExport={vi.fn()}
        exporting={false}
      />,
    );
    expect(screen.getByTestId('odx-viewer-title').textContent).toMatch(/diag\.odx/);
  });

  it('renders the stats strip with DTC/DID/Routine counts', () => {
    render(
      <OdxViewer
        open
        path="/tmp/diag.odx"
        summary={SAMPLE_SUMMARY}
        locale="en"
        onClose={vi.fn()}
        onExport={vi.fn()}
        exporting={false}
      />,
    );
    const stats = screen.getByTestId('odx-viewer-stats').textContent;
    expect(stats).toMatch(/2/); // dtcCount
    expect(stats).toMatch(/1/); // didCount and routineCount
    expect(stats).toMatch(/DTC/i);
    expect(stats).toMatch(/DID/i);
    expect(stats).toMatch(/Routine/i);
  });

  it('DTC tab: one row per DTC with id, name, raw troubleCode, text', () => {
    render(
      <OdxViewer
        open
        path="/tmp/diag.odx"
        summary={SAMPLE_SUMMARY}
        locale="en"
        onClose={vi.fn()}
        onExport={vi.fn()}
        exporting={false}
      />,
    );
    expect(screen.getByTestId('odx-dtc-DTC_001')).not.toBeNull();
    expect(screen.getByTestId('odx-dtc-DTC_002')).not.toBeNull();
    const row1 = screen.getByTestId('odx-dtc-DTC_001').textContent ?? '';
    expect(row1).toMatch(/DTC_001/);
    expect(row1).toMatch(/DTC_EngineOverheat/);
    // The viewer renders the raw ODX `TROUBLE-CODE` value (with the
    // `0x` prefix). Code-review HIGH-1 caught the prior discrepancy
    // where the column header read "Trouble code" but the cell
    // rendered the prefix-stripped `displayCode` variant.
    expect(row1).toMatch(/0x123456/);
    expect(row1).toMatch(/Engine coolant/);
  });

  it('DID tab: one row per DID with id, name', () => {
    render(
      <OdxViewer
        open
        path="/tmp/diag.odx"
        summary={SAMPLE_SUMMARY}
        locale="en"
        onClose={vi.fn()}
        onExport={vi.fn()}
        exporting={false}
      />,
    );
    expect(screen.getByTestId('odx-did-DID_001')).not.toBeNull();
    const row = screen.getByTestId('odx-did-DID_001').textContent ?? '';
    expect(row).toMatch(/DID_001/);
    expect(row).toMatch(/DID_VIN_Read/);
  });

  it('Routine tab: one row per routine with id, name', () => {
    render(
      <OdxViewer
        open
        path="/tmp/diag.odx"
        summary={SAMPLE_SUMMARY}
        locale="en"
        onClose={vi.fn()}
        onExport={vi.fn()}
        exporting={false}
      />,
    );
    expect(screen.getByTestId('odx-routine-REQ_001')).not.toBeNull();
    const row = screen.getByTestId('odx-routine-REQ_001').textContent ?? '';
    expect(row).toMatch(/REQ_001/);
    expect(row).toMatch(/Routine_Check_Req/);
  });

  it('empty DTCs tab shows a localized "no DTCs" hint, not a crash', () => {
    render(
      <OdxViewer
        open
        path="/tmp/empty.odx"
        summary={EMPTY_SUMMARY}
        locale="en"
        onClose={vi.fn()}
        onExport={vi.fn()}
        exporting={false}
      />,
    );
    // "no DTCs" hint appears (the exact wording depends on i18n key).
    const hint = screen.getByTestId('odx-empty-dtc');
    expect(hint).not.toBeNull();
    expect(hint.textContent?.length).toBeGreaterThan(0);
  });

  it('close button fires onClose', () => {
    const onClose = vi.fn();
    render(
      <OdxViewer
        open
        path="/tmp/diag.odx"
        summary={SAMPLE_SUMMARY}
        locale="en"
        onClose={onClose}
        onExport={vi.fn()}
        exporting={false}
      />,
    );
    fireEvent.click(screen.getByTestId('odx-viewer-close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('error state: renders localized error banner instead of the tables', () => {
    render(
      <OdxViewer
        open
        path="/tmp/bad.odx"
        summary={null}
        error="ODX parse failed: missing <ODX> root"
        locale="en"
        onClose={vi.fn()}
        onExport={vi.fn()}
        exporting={false}
      />,
    );
    expect(screen.getByTestId('odx-viewer-error')).not.toBeNull();
    expect(screen.getByTestId('odx-viewer-error').textContent).toMatch(/missing/i);
    expect(screen.queryByTestId('odx-viewer-stats')).toBeNull();
  });

  it('Escape key fires onClose', () => {
    const onClose = vi.fn();
    render(
      <OdxViewer
        open
        path="/tmp/diag.odx"
        summary={SAMPLE_SUMMARY}
        locale="en"
        onClose={onClose}
        onExport={vi.fn()}
        exporting={false}
      />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('clicking the backdrop fires onClose; clicking the modal body does NOT', () => {
    const onClose = vi.fn();
    render(
      <OdxViewer
        open
        path="/tmp/diag.odx"
        summary={SAMPLE_SUMMARY}
        locale="en"
        onClose={onClose}
        onExport={vi.fn()}
        exporting={false}
      />,
    );
    const backdrop = screen.getByTestId('odx-viewer');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
    const titleEl = screen.getByTestId('odx-viewer-title');
    fireEvent.click(titleEl);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('focuses the close button on open (initial focus)', async () => {
    render(
      <OdxViewer
        open
        path="/tmp/diag.odx"
        summary={SAMPLE_SUMMARY}
        locale="en"
        onClose={vi.fn()}
        onExport={vi.fn()}
        exporting={false}
      />,
    );
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const closeBtn = screen.getByTestId('odx-viewer-close');
    expect(document.activeElement).toBe(closeBtn);
  });

  it('localizes the title in zh-CN', () => {
    render(
      <OdxViewer
        open
        path="/tmp/diag.odx"
        summary={SAMPLE_SUMMARY}
        locale="zh-CN"
        onClose={vi.fn()}
        onExport={vi.fn()}
        exporting={false}
      />,
    );
    const title = screen.getByTestId('odx-viewer-title').textContent ?? '';
    expect(title).toMatch(/ODX/);
  });
});

// v1.24.0 MINOR T3 — Export Diagnostic Extract button wiring.
//
// The button lives inside the OdxViewer modal footer; clicking it
// fires `onExport()` so App.tsx can run the T2 IPC handler
// (`window.autosarApi.importDiagnosticExtract(...)`). The button is
// disabled when summary is null (no parsed data to export) or while
// exporting (in-flight IPC round-trip). Mirrors the v1.23.0 T4
// DBC-wizard apply-button disable gating.
describe('OdxViewer — Export Diagnostic Extract button (v1.24.0 T3)', () => {
  const baseProps = {
    open: true,
    path: '/x.odx-d',
    summary: SAMPLE_SUMMARY,
    locale: 'en' as const,
    onClose: vi.fn(),
    onExport: vi.fn(),
    exporting: false,
  } as const;

  it('renders Export Diagnostic Extract button when summary is loaded', () => {
    render(<OdxViewer {...baseProps} />);
    expect(screen.getByRole('button', { name: /Export Diagnostic Extract/i })).toBeInTheDocument();
  });

  it('disables Export button when summary is null', () => {
    render(<OdxViewer {...baseProps} summary={null} error="x" />);
    const btn = screen.getByRole('button', { name: /Export Diagnostic Extract/i });
    expect(btn).toBeDisabled();
  });

  it('calls onExport when clicked', () => {
    const onExport = vi.fn();
    render(<OdxViewer {...baseProps} onExport={onExport} />);
    fireEvent.click(screen.getByRole('button', { name: /Export Diagnostic Extract/i }));
    expect(onExport).toHaveBeenCalledOnce();
  });

  it('disables Export button while exporting is in flight', () => {
    render(<OdxViewer {...baseProps} exporting={true} />);
    const btn = screen.getByRole('button', { name: /Exporting/i });
    expect(btn).toBeDisabled();
  });
});
