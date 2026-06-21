// @vitest-environment jsdom
//
// StencilWizard (v1.8.0 K Stencil Wizard — Task 6 + Task 7) — renderer
// modal for generating minimal valid ECUC module skeletons.
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
// We do NOT test the actual file-save dialog here — Task 6/7 just
// generates the XML string and shows a toast; the OS save dialog
// flow is a later polish task.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Locale } from '@shared/i18n';

import { useArxmlStore } from '../../../store/useArxmlStore.js';
import { StencilWizard } from '../StencilWizard.js';

// ---------------------------------------------------------------------------
// IPC stub — Task 7 replaces the Task 6 defensive `window.electron`
// shim with the production preload wrapper
// `window.autosarApi.stencilGenerate(req)`. Tests install a minimal
// stub for that one method (matches the surface in
// `src/preload/index.ts`).
// ---------------------------------------------------------------------------

interface AutosarApiStub {
  readonly stencilGenerate: ReturnType<typeof vi.fn>;
}

let originalStencilGenerate: unknown;

function installStencilApi(
  result: { ok: boolean; xml?: string; suggestedFilename?: string } | Error,
): AutosarApiStub {
  const stencilGenerate = vi.fn().mockImplementation(() => {
    if (result instanceof Error) {
      return Promise.reject(result);
    }
    return Promise.resolve(result);
  });
  const api = (globalThis as { window?: { autosarApi?: unknown } }).window?.autosarApi;
  const previous =
    api !== undefined && typeof (api as { stencilGenerate?: unknown }).stencilGenerate !== 'undefined'
      ? (api as { stencilGenerate: unknown }).stencilGenerate
      : undefined;
  const next = {
    ...((api as Record<string, unknown> | undefined) ?? {}),
    stencilGenerate,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window.autosarApi = next;
  originalStencilGenerate = previous;
  return { stencilGenerate };
}

beforeEach(() => {
  useArxmlStore.getState().clear();
  useArxmlStore.getState().setLocale('en');
});

afterEach(() => {
  const api = (globalThis as { window?: { autosarApi?: Record<string, unknown> } }).window?.autosarApi;
  if (api !== undefined) {
    if (originalStencilGenerate === undefined) {
      delete api.stencilGenerate;
    } else {
      api.stencilGenerate = originalStencilGenerate;
    }
  }
  cleanup();
});

describe('StencilWizard (Task 6 + Task 7)', () => {
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
    const api = installStencilApi({
      ok: true,
      xml: '<AR-PACKAGE>...</AR-PACKAGE>',
      suggestedFilename: 'Com.arxml',
    });
    render(<StencilWizard onClose={onClose} />);
    fireEvent.click(screen.getByTestId('stencil-generate'));
    await waitFor(() => expect(api.stencilGenerate).toHaveBeenCalledTimes(1));
    // The payload matches StencilRequest.
    expect(api.stencilGenerate).toHaveBeenCalledWith({
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
    installStencilApi(new Error('boom'));
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