// @vitest-environment jsdom
//
// StencilWizard (v1.8.0 K Stencil Wizard — Task 6) — renderer modal
// for generating minimal valid ECUC module skeletons.
//
// Tests pin:
//   1. Renders the title + the 3 sub-components (family picker,
//      mode toggle, gate toggle).
//   2. Clicking Cancel invokes `onClose`.
//   3. Family picker reflects the default family (`com`) as the
//      currently-selected option.
//   4. Esc closes the modal (invokes `onClose`).
//   5. Clicking Generate invokes the IPC channel with the current
//      family/mode/gate and on success calls `onClose`.
//
// We do NOT test the actual file-save dialog here — Task 6 just
// generates the XML string and shows a toast; the OS save dialog
// flow is a later polish task.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Locale } from '@shared/i18n';

import { useArxmlStore } from '../../../store/useArxmlStore.js';
import { StencilWizard } from '../StencilWizard.js';

// ---------------------------------------------------------------------------
// IPC stub — Task 6 doesn't add a preload wrapper, so the modal
// invokes `window.electron.ipcRenderer.invoke` directly. Tests install a
// minimal stub before mounting.
// ---------------------------------------------------------------------------

interface IpcStub {
  readonly ipcRenderer: { readonly invoke: ReturnType<typeof vi.fn> };
}

let originalElectron: unknown;

function installIpc(result: { ok: boolean; xml?: string; suggestedFilename?: string } | Error): IpcStub {
  const invoke = vi.fn().mockImplementation(() => {
    if (result instanceof Error) {
      return Promise.reject(result);
    }
    return Promise.resolve(result);
  });
  const stub = { ipcRenderer: { invoke } };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window.electron = stub;
  return stub;
}

beforeEach(() => {
  originalElectron = (globalThis as { window?: { electron?: unknown } }).window?.electron;
  useArxmlStore.getState().clear();
  useArxmlStore.getState().setLocale('en');
});

afterEach(() => {
  if (originalElectron === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window.electron;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.electron = originalElectron;
  }
  cleanup();
});

describe('StencilWizard (Task 6)', () => {
  it('renders the title and the 3 sub-components (family / mode / gate)', () => {
    render(<StencilWizard onClose={() => {}} />);

    // Title — keyed via i18n.
    expect(screen.getByTestId('stencil-title')).toHaveTextContent('New from Stencil');
    // Family picker — a <select> for the 4 families.
    const familySelect = screen.getByTestId('stencil-family');
    expect(familySelect).toBeInTheDocument();
    expect(familySelect.tagName).toBe('SELECT');
    expect(familySelect.querySelectorAll('option')).toHaveLength(4);
    // Mode toggle — radio group with 2 options.
    expect(screen.getByTestId('stencil-mode-free')).toBeInTheDocument();
    expect(screen.getByTestId('stencil-mode-withBswmd')).toBeInTheDocument();
    // Gate toggle — a single checkbox.
    expect(screen.getByTestId('stencil-gate')).toBeInTheDocument();
    // Footer buttons.
    expect(screen.getByTestId('stencil-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('stencil-generate')).toBeInTheDocument();
  });

  it('invokes onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<StencilWizard onClose={onClose} />);
    fireEvent.click(screen.getByTestId('stencil-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('invokes onClose when Esc is pressed on the overlay', () => {
    const onClose = vi.fn();
    render(<StencilWizard onClose={onClose} />);
    const overlay = screen.getByTestId('stencil-overlay');
    fireEvent.keyDown(overlay, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Family picker reflects the default family (com) as selected', () => {
    render(<StencilWizard onClose={() => {}} />);
    const familySelect = screen.getByTestId('stencil-family') as HTMLSelectElement;
    expect(familySelect.value).toBe('com');
  });

  it('changing the family picker updates the local state', () => {
    render(<StencilWizard onClose={() => {}} />);
    const familySelect = screen.getByTestId('stencil-family') as HTMLSelectElement;
    fireEvent.change(familySelect, { target: { value: 'pdur' } });
    expect(familySelect.value).toBe('pdur');
  });

  it('Mode toggle defaults to free', () => {
    render(<StencilWizard onClose={() => {}} />);
    const freeRadio = screen.getByTestId('stencil-mode-free') as HTMLInputElement;
    const withBswmdRadio = screen.getByTestId('stencil-mode-withBswmd') as HTMLInputElement;
    expect(freeRadio.checked).toBe(true);
    expect(withBswmdRadio.checked).toBe(false);
  });

  it('Gate toggle defaults to false', () => {
    render(<StencilWizard onClose={() => {}} />);
    const gateCheckbox = screen.getByTestId('stencil-gate') as HTMLInputElement;
    expect(gateCheckbox.checked).toBe(false);
  });

  it('clicking Generate invokes the stencil IPC channel and closes on success', async () => {
    const onClose = vi.fn();
    const ipc = installIpc({ ok: true, xml: '<AR-PACKAGE>...</AR-PACKAGE>', suggestedFilename: 'Com.arxml' });
    render(<StencilWizard onClose={onClose} />);
    fireEvent.click(screen.getByTestId('stencil-generate'));
    await waitFor(() => expect(ipc.ipcRenderer.invoke).toHaveBeenCalledTimes(1));
    // The IPC channel name is 'stencil:generate:v1' (matches IPC_CHANNELS.STENCIL_GENERATE_V1).
    expect(ipc.ipcRenderer.invoke).toHaveBeenCalledWith('stencil:generate:v1', {
      family: 'com',
      mode: 'free',
      gate: false,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('uses the i18n bundle for title and button labels (zh-CN)', () => {
    useArxmlStore.setState({ locale: 'zh-CN' satisfies Locale });
    render(<StencilWizard onClose={() => {}} />);
    expect(screen.getByTestId('stencil-title')).toHaveTextContent('从模板新建');
    expect(screen.getByTestId('stencil-cancel')).toHaveTextContent('取消');
    expect(screen.getByTestId('stencil-generate')).toHaveTextContent('生成');
  });

  it('does NOT close when the IPC call fails — surfaces an error toast instead', async () => {
    const onClose = vi.fn();
    installIpc(new Error('boom'));
    render(<StencilWizard onClose={onClose} />);
    fireEvent.click(screen.getByTestId('stencil-generate'));
    await waitFor(() => expect(screen.getByTestId('stencil-error')).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    // The error message contains the i18n key for "build failed" — en
    // or zh-CN both satisfy the spirit of "build failed" being surfaced.
    const errorText = screen.getByTestId('stencil-error').textContent ?? '';
    expect(errorText.length).toBeGreaterThan(0);
    expect(errorText).toMatch(/failed|生成失败/);
  });
});