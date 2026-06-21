// @vitest-environment jsdom
//
// StencilWizard (v1.8.0 K Stencil Wizard — Task 6 + Task 7 + Task 12) —
// renderer modal for generating minimal valid ECUC module skeletons.
//
// Tests pin:
//   1. Renders the title + the 3 sub-components (family picker,
//      mode toggle, gate toggle).
//   2. Clicking Cancel invokes `onClose`.
//   3. Family picker reflects the default family (`com`) as the
//      currently-selected option.
//   4. Esc closes the modal (invokes `onClose`).
//   5. Clicking Generate invokes the IPC channel with the current
//      family/mode/gate, on success calls `stencilSave` with the
//      generated XML + suggestedFilename, and on save-success
//      invokes `onClose` (Task 12 — native save dialog wire-up).
//   6. Save cancellation closes the wizard without surfacing a
//      success toast.
//   7. Save IO error keeps the wizard open and surfaces a typed
//      error message.
//   8. The dialog auto-focuses its first interactive element on
//      mount (Task 12 a11y polish).

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Locale } from '@shared/i18n';

import { useArxmlStore } from '../../../store/useArxmlStore.js';
import { StencilWizard } from '../StencilWizard.js';

// ---------------------------------------------------------------------------
// IPC stub — Task 7 replaces the Task 6 defensive `window.electron`
// shim with the production preload wrapper
// `window.autosarApi.stencilGenerate(req)`. Task 12 adds
// `window.autosarApi.stencilSave({ xml, suggestedFilename })` for the
// native save dialog + disk write. Tests install stubs for both
// (matches the surface in `src/preload/index.ts`).
// ---------------------------------------------------------------------------

type GenerateResult =
  | { ok: true; xml: string; suggestedFilename: string }
  | {
      ok: false;
      errors: ReadonlyArray<{ ruleId: string; severity: string; message: string }>;
    }
  | { ok: false; error: { code: string; i18nKey: string } };

type SaveResult =
  | { ok: true; value: { canceled: false; path: string } }
  | { ok: true; value: { canceled: true } }
  | { ok: false; error: { kind: string; code?: string; message: string } };

interface AutosarApiStub {
  readonly stencilGenerate: ReturnType<typeof vi.fn>;
  readonly stencilSave: ReturnType<typeof vi.fn>;
}

let originalAutosarApi: unknown;

function installStencilApi(opts: {
  readonly generate?: GenerateResult | Error;
  readonly save?: SaveResult | Error;
}): AutosarApiStub {
  const generateResult = opts.generate ?? {
    ok: true as const,
    xml: '<AR-PACKAGE>...</AR-PACKAGE>',
    suggestedFilename: 'Com.arxml',
  };
  const saveResult = opts.save ?? {
    ok: true as const,
    value: { canceled: false as const, path: 'C:\\tmp\\Com.arxml' },
  };
  const stencilGenerate = vi.fn().mockImplementation(() => {
    if (generateResult instanceof Error) return Promise.reject(generateResult);
    return Promise.resolve(generateResult);
  });
  const stencilSave = vi.fn().mockImplementation(() => {
    if (saveResult instanceof Error) return Promise.reject(saveResult);
    return Promise.resolve(saveResult);
  });
  const api = (globalThis as { window?: { autosarApi?: unknown } }).window?.autosarApi;
  originalAutosarApi = api;
  const next = {
    ...((api as Record<string, unknown> | undefined) ?? {}),
    stencilGenerate,
    stencilSave,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window.autosarApi = next;
  return { stencilGenerate, stencilSave };
}

beforeEach(() => {
  useArxmlStore.getState().clear();
  useArxmlStore.getState().setLocale('en');
});

afterEach(() => {
  const api = (globalThis as { window?: { autosarApi?: Record<string, unknown> } }).window
    ?.autosarApi;
  if (api !== undefined) {
    if (originalAutosarApi === undefined) {
      delete api.stencilGenerate;
      delete api.stencilSave;
    } else {
      const orig = originalAutosarApi as {
        stencilGenerate?: unknown;
        stencilSave?: unknown;
      };
      api.stencilGenerate = orig.stencilGenerate;
      api.stencilSave = orig.stencilSave;
    }
  }
  cleanup();
});

describe('StencilWizard (Task 6 + Task 7 + Task 12)', () => {
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

  it('clicking Generate invokes the stencil IPC channel and saves to disk (Task 12)', async () => {
    const onClose = vi.fn();
    const api = installStencilApi({
      generate: { ok: true, xml: '<AR-PACKAGE>...</AR-PACKAGE>', suggestedFilename: 'Com.arxml' },
    });
    render(<StencilWizard onClose={onClose} />);
    fireEvent.click(screen.getByTestId('stencil-generate'));
    await waitFor(() => expect(api.stencilGenerate).toHaveBeenCalledTimes(1));
    // The generate payload matches StencilRequest.
    expect(api.stencilGenerate).toHaveBeenCalledWith({
      family: 'com',
      mode: 'free',
      gate: false,
    });
    // Task 12 — on success, the wizard now calls stencilSave with the
    // generated XML + the suggested filename from the generate
    // response.
    await waitFor(() => expect(api.stencilSave).toHaveBeenCalledTimes(1));
    expect(api.stencilSave).toHaveBeenCalledWith({
      xml: '<AR-PACKAGE>...</AR-PACKAGE>',
      suggestedFilename: 'Com.arxml',
    });
    // On save success, the wizard closes.
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('save cancellation closes the wizard without a success toast', async () => {
    const onClose = vi.fn();
    const api = installStencilApi({
      save: { ok: true, value: { canceled: true } },
    });
    render(<StencilWizard onClose={onClose} />);
    fireEvent.click(screen.getByTestId('stencil-generate'));
    await waitFor(() => expect(api.stencilSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('save IO error keeps the wizard open and surfaces a typed error', async () => {
    const onClose = vi.fn();
    const api = installStencilApi({
      save: {
        ok: false,
        error: { kind: 'permission-denied', code: 'EACCES', message: 'denied' },
      },
    });
    render(<StencilWizard onClose={onClose} />);
    fireEvent.click(screen.getByTestId('stencil-generate'));
    await waitFor(() => expect(api.stencilSave).toHaveBeenCalledTimes(1));
    // Wizard stays open (Generate didn't crash) and surfaces an error.
    await waitFor(() => expect(screen.getByTestId('stencil-error')).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('uses the i18n bundle for title and button labels (zh-CN)', () => {
    useArxmlStore.setState({ locale: 'zh-CN' satisfies Locale });
    render(<StencilWizard onClose={() => {}} />);
    expect(screen.getByTestId('stencil-title')).toHaveTextContent('从模板新建');
    expect(screen.getByTestId('stencil-cancel')).toHaveTextContent('取消');
    expect(screen.getByTestId('stencil-generate')).toHaveTextContent('生成');
  });

  it('does NOT close when the generate IPC call fails — surfaces an error toast instead', async () => {
    const onClose = vi.fn();
    installStencilApi({ generate: new Error('boom') });
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

  it('auto-focuses the first interactive element on mount (Task 12 a11y)', async () => {
    render(<StencilWizard onClose={() => {}} />);
    // The first focusable in the dialog is the family picker
    // (a <select>). The wizard schedules the focus in a
    // requestAnimationFrame callback, so we wait for it.
    const familySelect = screen.getByTestId('stencil-family');
    await waitFor(() => expect(familySelect).toBe(document.activeElement));
  });
});
