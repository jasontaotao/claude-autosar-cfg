// @vitest-environment jsdom
//
// XlsxBatchWizard — v1.25.0 T5 (3-Step Wizard UI).
//
// 3-step modal that bridges the renderer to the v1.25.0 T2/T3 IPC
// surface (`window.autosarApi.xlsxWriteBatchTemplate` /
// `xlsxParseBatch` / `xlsxCommitBatch`) end-to-end:
//   1. Step1 (DownloadTemplate) — calls writeBatchTemplate IPC, then
//      exposes the bytes via an `<a download>` anchor (the renderer
//      uses the Blob URL pattern from DbcImportWizard for the file
//      dialog).
//   2. Step2 (UploadAndPreview) — file input feeds parseBatch IPC,
//      renders the per-row collision table (overwrite/skip radio).
//      Default resolution = skip (per spec §error handling, safer).
//   3. Step3 (Commit) — calls commitBatch IPC with the resolutions
//      map; success dialog shows the per-file added/overwritten/
//      skipped counts.
//
// Behaviour pinned by tests:
//   - title + step-1 download button render via i18n key (zh-CN)
//   - step-1 click invokes writeBatchTemplate IPC (xlsx:writeBatchTemplate)
//   - step-2 file upload invokes parseBatch IPC (xlsx:parseBatch)
//   - step-3 commit invokes commitBatch IPC (xlsx:commitBatch) with
//     the resolutions map

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@shared/i18n/index.js';

import { XlsxBatchWizard } from '../XlsxBatchWizard.js';

// Stub the IPC bridge. The wizard imports the `window.autosarApi`
// shape (mirroring DbcImportWizard / OdxViewer) rather than a
// `ipcInvoke` module helper, so the mock lands on `window.autosarApi`.
const writeBatchTemplateMock = vi.fn();
const parseBatchMock = vi.fn();
const commitBatchMock = vi.fn();

beforeAll(() => {
  (globalThis as { window?: Window }).window = window;
  Object.defineProperty(window, 'autosarApi', {
    value: {
      xlsxWriteBatchTemplate: writeBatchTemplateMock,
      xlsxParseBatch: parseBatchMock,
      xlsxCommitBatch: commitBatchMock,
    },
    writable: true,
    configurable: true,
  });
  // URL.createObjectURL / revokeObjectURL are jsdom stubs that return
  // empty strings; replace them with no-ops + a click spy so the
  // download anchor doesn't throw.
  Object.defineProperty(URL, 'createObjectURL', {
    value: vi.fn(() => 'blob:mock'),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });
  HTMLAnchorElement.prototype.click = vi.fn();
});

beforeEach(() => {
  writeBatchTemplateMock.mockReset();
  parseBatchMock.mockReset();
  commitBatchMock.mockReset();
});

describe('XlsxBatchWizard (v1.25.0 T5)', () => {
  afterEach(() => cleanup());

  it('renders title + step 1 download button on zh-CN locale', () => {
    render(<XlsxBatchWizard onClose={vi.fn()} projectManifestPath="" locale="zh-CN" />);
    expect(screen.getByTestId('xlsx-wizard-title').textContent).toBe(
      t('zh-CN', 'xlsxBatch.wizard.title'),
    );
    expect(screen.getByTestId('xlsx-wizard-step1-download')).not.toBeNull();
  });

  it('step 1 download click invokes xlsxWriteBatchTemplate IPC', async () => {
    writeBatchTemplateMock.mockResolvedValueOnce({
      ok: true,
      value: { xlsxBytes: new Uint8Array([1, 2, 3]) },
    });
    render(<XlsxBatchWizard onClose={vi.fn()} projectManifestPath="" locale="en" />);
    fireEvent.click(screen.getByTestId('xlsx-wizard-step1-download'));
    await waitFor(() =>
      expect(writeBatchTemplateMock).toHaveBeenCalledWith({
        projectManifestPath: '',
      }),
    );
  });

  it('step 2 file upload invokes xlsxParseBatch IPC + renders collision table', async () => {
    parseBatchMock.mockResolvedValueOnce({
      ok: true,
      value: {
        instances: [
          { sheet: 'ComIPdu', shortName: 'Pdu1', params: { 'param:A': 1 } },
          { sheet: 'CanIfTxPdu', shortName: 'Pdu1', params: { 'param:B': 2 } },
        ],
        collisions: { 'ComIPdu:Pdu1': true, 'CanIfTxPdu:Pdu1': true },
      },
    });
    const onError = vi.fn();
    render(
      <XlsxBatchWizard onClose={vi.fn()} projectManifestPath="" locale="en" onError={onError} />,
    );
    // Step 1 -> Step 2: advance via the Next button (skip the download).
    // Then explicitly assert Step 2 is rendered (avoids a race where
    // the file-input getByTestId runs before React commits the state).
    fireEvent.click(screen.getByTestId('xlsx-wizard-step1-next'));
    await waitFor(() => screen.getByTestId('xlsx-wizard-step2'));
    // Upload a file on Step 2 — RTL's `fireEvent.change` second-arg
    // overrides `target` on the synthetic event, so the wizard's
    // `e.target.files?.[0]` reads the file we put there.
    const file = new File(['x'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const fileInput = screen.getByTestId('xlsx-wizard-file-input') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(
      () => {
        // eslint-disable-next-line no-console
        if (parseBatchMock.mock.calls.length === 0 && onError.mock.calls.length > 0) {
          // eslint-disable-next-line no-console
          console.error('Wizard surfaced error:', onError.mock.calls);
        }
        expect(parseBatchMock).toHaveBeenCalledTimes(1);
      },
      { timeout: 3000 },
    );
    expect(parseBatchMock.mock.calls[0]?.[0]).toEqual({
      projectManifestPath: '',
      xlsxBytes: expect.any(Uint8Array),
    });
    // The wizard surfaces collisions in a per-row table — assert the
    // key rows are present.
    expect(screen.getByTestId('xlsx-wizard-collision-row-ComIPdu:Pdu1')).not.toBeNull();
    expect(screen.getByTestId('xlsx-wizard-collision-row-CanIfTxPdu:Pdu1')).not.toBeNull();
  });

  it('step 3 commit invokes xlsxCommitBatch IPC with resolutions map', async () => {
    writeBatchTemplateMock.mockResolvedValueOnce({
      ok: true,
      value: { xlsxBytes: new Uint8Array([1, 2, 3]) },
    });
    parseBatchMock.mockResolvedValueOnce({
      ok: true,
      value: {
        instances: [{ sheet: 'ComIPdu', shortName: 'Pdu1', params: {} }],
        collisions: { 'ComIPdu:Pdu1': true },
      },
    });
    commitBatchMock.mockResolvedValueOnce({
      ok: true,
      value: { added: 1, overwritten: 0, skipped: 0, perFile: { Com: 1, CanIf: 0, PduR: 0 } },
    });
    const onError = vi.fn();
    render(
      <XlsxBatchWizard onClose={vi.fn()} projectManifestPath="" locale="en" onError={onError} />,
    );

    // Step 1: click download (the IPC returns ok — wizard state now
    // has templateBytes; we don't need to await the IPC, the user
    // can still advance).
    fireEvent.click(screen.getByTestId('xlsx-wizard-step1-download'));
    // Advance to Step 2
    fireEvent.click(screen.getByTestId('xlsx-wizard-step1-next'));
    await waitFor(() => screen.getByTestId('xlsx-wizard-step2'));
    // Upload file
    const file = new File(['x'], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const fileInput = screen.getByTestId('xlsx-wizard-file-input') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => expect(parseBatchMock).toHaveBeenCalledTimes(1), { timeout: 3000 });
    // Default resolution = skip; advance to Step 3
    fireEvent.click(screen.getByTestId('xlsx-wizard-step2-next'));
    // Commit
    fireEvent.click(screen.getByTestId('xlsx-wizard-commit'));
    await waitFor(() => expect(commitBatchMock).toHaveBeenCalledTimes(1));
    const callArg = commitBatchMock.mock.calls[0]?.[0];
    expect(callArg).toEqual({
      projectManifestPath: '',
      instances: [{ sheet: 'ComIPdu', shortName: 'Pdu1', params: {} }],
      resolutions: { 'ComIPdu:Pdu1': 'skip' },
    });
  });
});
