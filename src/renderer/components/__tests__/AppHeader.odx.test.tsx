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
//
// v1.24.0 MINOR T3 — appended the Diagnostic Extract state machine
// integration test. The full App.tsx is mounted with a stub
// `importDiagnosticExtract` IPC handler so the test can drive the
// ODX-viewer → Export-click → success-dialog flow end-to-end.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OdxSummary } from '@shared/types';

import { App } from '../../App.js';
import { useArxmlStore } from '../../store/useArxmlStore.js';
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

// v1.24.0 MINOR T3 — App.tsx state machine for the ODX→Diagnostic
// Extract export IPC. Mounts the full <App />, stubs the
// `openOdx` + `parseOdx` + `importDiagnosticExtract` IPC handlers,
// then drives the user-facing flow:
//
//   1. User clicks File → Open ODX… → mock returns a path + content
//   2. parseOdx returns a summary; OdxViewer opens
//   3. User clicks "Export Diagnostic Extract" inside OdxViewer
//   4. App calls importDiagnosticExtract → mock returns ok: true
//   5. App opens DiagnosticExtractSuccessDialog
//
// The test asserts the dialog renders the 2 file paths + counts.
// Uses the existing useArxmlStore stub setup from
// App.contextMenu.test.tsx (minimal autosarApi + locale en).
interface MinimalAutosarApiForOdxExport {
  readonly openOdx: ReturnType<typeof vi.fn>;
  readonly parseOdx: ReturnType<typeof vi.fn>;
  readonly importDiagnosticExtract: ReturnType<typeof vi.fn>;
}

function installOdxExportStub(): MinimalAutosarApiForOdxExport {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (globalThis as any).window.autosarApi ?? {};
  const stub: MinimalAutosarApiForOdxExport = {
    openOdx: api.openOdx ?? vi.fn(),
    parseOdx: api.parseOdx ?? vi.fn(),
    importDiagnosticExtract: api.importDiagnosticExtract ?? vi.fn(),
  };
  if (stub.openOdx.mock.calls.length === 0) {
    stub.openOdx.mockResolvedValue({
      kind: 'opened',
      path: '/tmp/diag.odx-d',
      content: '<ODX>stub</ODX>',
    });
  }
  if (stub.parseOdx.mock.calls.length === 0) {
    const summary: OdxSummary = {
      dtcCount: 3,
      didCount: 2,
      routineCount: 1,
      dtcs: [
        {
          id: 'DTC_A',
          shortName: 'DTC_A',
          troubleCode: '0xA',
          displayCode: 'A',
          text: 'text',
        },
        {
          id: 'DTC_B',
          shortName: 'DTC_B',
          troubleCode: '0xB',
          displayCode: 'B',
          text: 'text',
        },
        {
          id: 'DTC_C',
          shortName: 'DTC_C',
          troubleCode: '0xC',
          displayCode: 'C',
          text: 'text',
        },
      ],
      dids: [
        { id: 'DID_A', shortName: 'DID_A' },
        { id: 'DID_B', shortName: 'DID_B' },
      ],
      routines: [{ id: 'REQ_A', shortName: 'REQ_A' }],
    };
    stub.parseOdx.mockResolvedValue({ ok: true, value: summary });
  }
  if (stub.importDiagnosticExtract.mock.calls.length === 0) {
    stub.importDiagnosticExtract.mockResolvedValue({
      ok: true,
      value: {
        demPath: '/proj/samples/arxml/diagnostic-extract/Dem_Extract.arxml',
        dcmPath: '/proj/samples/arxml/diagnostic-extract/Dcm_Extract.arxml',
        stats: { dtcCount: 3, didCount: 2, routineCount: 1 },
      },
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window.autosarApi = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(api as any),
    ...stub,
  };
  return stub;
}

describe('App.tsx — Diagnostic Extract state machine (v1.24.0 T3)', () => {
  beforeEach(() => {
    useArxmlStore.getState().clear();
    useArxmlStore.getState().setLocale('en');
    installOdxExportStub();
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window.autosarApi;
    cleanup();
  });

  it('shows DiagnosticExtractSuccessDialog after successful export', async () => {
    render(<App />);

    // Open the AppHeader menu + click "Open ODX…" — this fires the
    // App.tsx state machine that runs openOdx + parseOdx.
    fireEvent.click(screen.getByTestId('btn-menu-toggle'));
    fireEvent.click(screen.getByTestId('btn-open-odx'));

    // Wait for the OdxViewer to mount with the parsed summary.
    await waitFor(() => {
      expect(screen.getByTestId('odx-viewer-export')).toBeInTheDocument();
    });

    // Click the Export button — App calls importDiagnosticExtract.
    await act(async () => {
      fireEvent.click(screen.getByTestId('odx-viewer-export'));
    });

    // The success dialog renders with the file paths from the IPC.
    await waitFor(() => {
      expect(screen.getByTestId('diag-extract-success-dialog')).toBeInTheDocument();
    });
    expect(
      screen.getByText('/proj/samples/arxml/diagnostic-extract/Dem_Extract.arxml'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('/proj/samples/arxml/diagnostic-extract/Dcm_Extract.arxml'),
    ).toBeInTheDocument();
  });
});

// v1.24.0 MINOR T3.1 — regression tests for the i18n-bypass fix.
// T3 shipped rolledBack error message via template-string
// concatenation with a hardcoded English parenthetical, which broke
// zh-CN users. T3.1 splits the message into 2 fully-translated keys
// (rolledBack + partial), mirroring the v1.23.1 T1 MEDIUM-1 DBC
// wizard fix. These tests pin the rolledBack=true and rolledBack=false
// branches in zh-CN so the regression cannot reappear.
describe('App.tsx — Diagnostic Extract rolledBack split (v1.24.0 T3.1)', () => {
  function installWriteFailedStub(rolledBack: boolean): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (globalThis as any).window.autosarApi ?? {};
    const stub = {
      openOdx: api.openOdx ?? vi.fn(),
      parseOdx: api.parseOdx ?? vi.fn(),
      importDiagnosticExtract: vi.fn().mockResolvedValue({
        ok: false,
        error: {
          kind: 'write-failed',
          message: 'EACCES: permission denied',
          rolledBack,
        },
      }),
    };
    if (stub.openOdx.mock.calls.length === 0) {
      stub.openOdx.mockResolvedValue({
        kind: 'opened',
        path: '/tmp/diag.odx-d',
        content: '<ODX>stub</ODX>',
      });
    }
    if (stub.parseOdx.mock.calls.length === 0) {
      const summary: OdxSummary = {
        dtcCount: 1,
        didCount: 0,
        routineCount: 0,
        dtcs: [
          {
            id: 'DTC_A',
            shortName: 'DTC_A',
            troubleCode: '0xA',
            displayCode: 'A',
            text: 'text',
          },
        ],
        dids: [],
        routines: [],
      };
      stub.parseOdx.mockResolvedValue({ ok: true, value: summary });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(api as any),
      ...stub,
    };
  }

  beforeEach(() => {
    useArxmlStore.getState().clear();
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window.autosarApi;
    cleanup();
  });

  it('renders rolledBack-true message in zh-CN when write fails with full rollback', async () => {
    useArxmlStore.getState().setLocale('zh-CN');
    installWriteFailedStub(true);

    render(<App />);

    // Drive the ODX flow: open menu → Open ODX… → wait for viewer → click Export.
    fireEvent.click(screen.getByTestId('btn-menu-toggle'));
    fireEvent.click(screen.getByTestId('btn-open-odx'));
    await waitFor(() => {
      expect(screen.getByTestId('odx-viewer-export')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('odx-viewer-export'));
    });

    // Assert the translated key was used — "已回滚" — NOT the
    // broken English parenthetical "(rolled back — ...)" which
    // the previous v1.24.0 T3 template-string concatenation
    // surfaced to zh-CN users.
    await waitFor(() => {
      expect(screen.getByText(/已回滚/)).toBeInTheDocument();
    });
    // Sanity check: the English parenthetical must NOT appear.
    expect(screen.queryByText(/rolled back — project unchanged/)).toBeNull();
  });

  it('renders rolledBack-false message in zh-CN when write fails with partial rollback', async () => {
    useArxmlStore.getState().setLocale('zh-CN');
    installWriteFailedStub(false);

    render(<App />);

    fireEvent.click(screen.getByTestId('btn-menu-toggle'));
    fireEvent.click(screen.getByTestId('btn-open-odx'));
    await waitFor(() => {
      expect(screen.getByTestId('odx-viewer-export')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('odx-viewer-export'));
    });

    // Assert the translated key was used — "部分回滚" — NOT the
    // broken English parenthetical "(rolled back partially — ...)".
    await waitFor(() => {
      expect(screen.getByText(/部分回滚/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/rolled back partially/)).toBeNull();
  });
});
