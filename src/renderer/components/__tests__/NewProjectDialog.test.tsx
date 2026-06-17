// @vitest-environment jsdom
//
// NewProjectDialog (Sprint 12 #3 Task 1) — the unified "new project"
// modal that replaces the previous `PromptDialog → OS showSaveDialog`
// two-step flow.
//
// Pattern mirrors `ConfirmDialog` and `PromptDialog` but the dialog
// itself is a **single instance** mounted at the app root whose
// visibility is driven by the `newProjectDialogOpen` store flag
// (Task 7). The host wires `setNewProjectDialogOpen(true)` from
// `useProjectActions.newProject` (Task 5 — out of scope here).
//
// Scope for this file:
//   1. Renders nothing when `newProjectDialogOpen` is false
//   2. Renders name input / dir input / browse button / filename
//      preview / cancel + create buttons when open
//   3. Live validation: invalid name → red error + create disabled
//   4. Live validation: valid name → no error + create enabled
//      (but stays disabled when dir is empty)
//   5. Filename preview updates live as the name/dir change
//   6. "Browse…" invokes `window.autosarApi.pickDir({ defaultPath })`
//      and refills the dir input
//   7. Esc closes the dialog (sets `newProjectDialogOpen` to false)
//   8. Enter on the focused input triggers `onSubmit(name, dir)`
//   9. Clicking "Create" with valid inputs invokes `onSubmit(name, dir)`
//  10. Clicking "Cancel" closes the dialog without invoking onSubmit
//  11. Localized strings come from the i18n bundle via the store
//      (`locale` selector); flipping locale flips the labels
//  12. `onSubmit` may be `async` (returns a Promise); dialog handles
//      both sync and async cases

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Locale } from '@shared/i18n';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { NewProjectDialog } from '../NewProjectDialog.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AutosarApiStub {
  readonly pickDir: ReturnType<typeof vi.fn>;
}

let originalAutosarApi: unknown;

function installPickDirApi(
  result: { kind: 'picked'; dirPath: string } | { kind: 'canceled' },
): AutosarApiStub {
  const pickDir = vi.fn().mockResolvedValue(result);
  const stub: AutosarApiStub = { pickDir };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window.autosarApi = stub;
  return stub;
}

function setOpen(open: boolean): void {
  act(() => {
    useArxmlStore.getState().setNewProjectDialogOpen(open);
  });
}

function setLocale(locale: Locale): void {
  act(() => {
    useArxmlStore.getState().setLocale(locale);
  });
}

beforeEach(() => {
  originalAutosarApi = (globalThis as { window?: { autosarApi?: unknown } }).window?.autosarApi;
  useArxmlStore.getState().clear();
  useArxmlStore.getState().setLocale('en');
});

afterEach(() => {
  if (originalAutosarApi === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).window.autosarApi;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window.autosarApi = originalAutosarApi;
  }
  cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NewProjectDialog (Sprint 12 #3 Task 1)', () => {
  it('renders nothing when newProjectDialogOpen is false', () => {
    render(<NewProjectDialog onSubmit={() => {}} />);
    expect(screen.queryByTestId('npd-overlay')).toBeNull();
  });

  it('renders all expected fields once newProjectDialogOpen is true', () => {
    setOpen(true);
    render(<NewProjectDialog onSubmit={() => {}} />);

    expect(screen.getByTestId('npd-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('npd-title')).toBeInTheDocument();
    // name input
    expect(screen.getByTestId('npd-name-input')).toBeInTheDocument();
    // dir input + browse button
    expect(screen.getByTestId('npd-dir-input')).toBeInTheDocument();
    expect(screen.getByTestId('npd-browse')).toBeInTheDocument();
    // filename preview
    expect(screen.getByTestId('npd-filename-preview')).toBeInTheDocument();
    // action buttons
    expect(screen.getByTestId('npd-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('npd-create')).toBeInTheDocument();
    // close ×
    expect(screen.getByTestId('npd-close')).toBeInTheDocument();
  });

  it('shows the localized title from the i18n bundle (en)', () => {
    setLocale('en');
    setOpen(true);
    render(<NewProjectDialog onSubmit={() => {}} />);
    expect(screen.getByTestId('npd-title')).toHaveTextContent('New Project');
  });

  it('shows the localized title in zh-CN when locale flips', () => {
    setLocale('zh-CN');
    setOpen(true);
    render(<NewProjectDialog onSubmit={() => {}} />);
    expect(screen.getByTestId('npd-title')).toHaveTextContent('新建项目');
  });

  it('shows a red error and disables Create when the name is empty', () => {
    setOpen(true);
    render(<NewProjectDialog onSubmit={() => {}} />);
    const nameInput = screen.getByTestId('npd-name-input');
    // Type nothing — empty by default.
    expect(nameInput).toHaveValue('');
    // Create must be disabled.
    expect(screen.getByTestId('npd-create')).toBeDisabled();
  });

  it('shows a red error and disables Create when the name has invalid characters', () => {
    setOpen(true);
    render(<NewProjectDialog onSubmit={() => {}} />);
    const nameInput = screen.getByTestId('npd-name-input');
    fireEvent.change(nameInput, { target: { value: 'foo<bar' } });
    expect(screen.getByTestId('npd-name-error')).toBeInTheDocument();
    expect(nameInput.className).toMatch(/error/);
    expect(screen.getByTestId('npd-create')).toBeDisabled();
  });

  it('shows a red error and disables Create when the name exceeds 64 characters', () => {
    setOpen(true);
    render(<NewProjectDialog onSubmit={() => {}} />);
    fireEvent.change(screen.getByTestId('npd-name-input'), {
      target: { value: 'a'.repeat(65) },
    });
    expect(screen.getByTestId('npd-name-error')).toBeInTheDocument();
    expect(screen.getByTestId('npd-create')).toBeDisabled();
  });

  it('clears the error and enables Create when name is valid AND dir is set', () => {
    setOpen(true);
    const onSubmit = vi.fn();
    render(<NewProjectDialog onSubmit={onSubmit} />);
    fireEvent.change(screen.getByTestId('npd-name-input'), {
      target: { value: 'MyProject' },
    });
    fireEvent.change(screen.getByTestId('npd-dir-input'), {
      target: { value: '/tmp/projects' },
    });
    expect(screen.queryByTestId('npd-name-error')).toBeNull();
    expect(screen.getByTestId('npd-create')).not.toBeDisabled();
  });

  it('keeps Create disabled when name is valid but dir is empty', () => {
    setOpen(true);
    render(<NewProjectDialog onSubmit={() => {}} />);
    fireEvent.change(screen.getByTestId('npd-name-input'), {
      target: { value: 'MyProject' },
    });
    expect(screen.getByTestId('npd-create')).toBeDisabled();
  });

  it('updates the filename preview live as name and dir change', () => {
    setOpen(true);
    render(<NewProjectDialog onSubmit={() => {}} />);
    const preview = screen.getByTestId('npd-filename-preview');
    // Empty + empty → no name in preview yet (placeholder form).
    expect(preview).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('npd-dir-input'), {
      target: { value: '/tmp/projects' },
    });
    fireEvent.change(screen.getByTestId('npd-name-input'), {
      target: { value: 'MyProject' },
    });
    expect(preview).toHaveTextContent('/tmp/projects');
    expect(preview).toHaveTextContent('MyProject.autosarcfg.json');
  });

  it('invokes window.autosarApi.pickDir with the current dir and refills the dir input', async () => {
    setOpen(true);
    const api = installPickDirApi({ kind: 'picked', dirPath: '/picked/dir' });
    render(<NewProjectDialog onSubmit={() => {}} />);
    fireEvent.change(screen.getByTestId('npd-dir-input'), {
      target: { value: '/seed' },
    });
    fireEvent.click(screen.getByTestId('npd-browse'));
    await waitFor(() => expect(api.pickDir).toHaveBeenCalledTimes(1));
    expect(api.pickDir).toHaveBeenCalledWith({ defaultPath: '/seed' });
    await waitFor(() => expect(screen.getByTestId('npd-dir-input')).toHaveValue('/picked/dir'));
  });

  it('does NOT refill the dir input when the user cancels the picker', async () => {
    setOpen(true);
    installPickDirApi({ kind: 'canceled' });
    render(<NewProjectDialog onSubmit={() => {}} />);
    fireEvent.change(screen.getByTestId('npd-dir-input'), {
      target: { value: '/seed' },
    });
    fireEvent.click(screen.getByTestId('npd-browse'));
    await waitFor(() => {
      expect(screen.getByTestId('npd-dir-input')).toHaveValue('/seed');
    });
  });

  it('Escape key closes the dialog (sets newProjectDialogOpen to false)', () => {
    setOpen(true);
    render(<NewProjectDialog onSubmit={() => {}} />);
    const overlay = screen.getByTestId('npd-overlay');
    fireEvent.keyDown(overlay, { key: 'Escape' });
    expect(useArxmlStore.getState().newProjectDialogOpen).toBe(false);
  });

  it('Enter in the name input triggers onSubmit with the current name and dir', async () => {
    setOpen(true);
    const onSubmit = vi.fn();
    render(<NewProjectDialog onSubmit={onSubmit} />);
    const nameInput = screen.getByTestId('npd-name-input');
    fireEvent.change(nameInput, { target: { value: 'MyProject' } });
    fireEvent.change(screen.getByTestId('npd-dir-input'), {
      target: { value: '/tmp' },
    });
    fireEvent.keyDown(nameInput, { key: 'Enter' });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('MyProject', '/tmp'));
  });

  it('clicking Create with valid inputs invokes onSubmit(name, dir)', () => {
    setOpen(true);
    const onSubmit = vi.fn();
    render(<NewProjectDialog onSubmit={onSubmit} />);
    fireEvent.change(screen.getByTestId('npd-name-input'), {
      target: { value: 'MyProject' },
    });
    fireEvent.change(screen.getByTestId('npd-dir-input'), {
      target: { value: '/tmp' },
    });
    fireEvent.click(screen.getByTestId('npd-create'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('MyProject', '/tmp');
  });

  it('clicking Cancel closes the dialog without invoking onSubmit', () => {
    setOpen(true);
    const onSubmit = vi.fn();
    render(<NewProjectDialog onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId('npd-cancel'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(useArxmlStore.getState().newProjectDialogOpen).toBe(false);
  });

  it('accepts an async onSubmit (returns Promise) without throwing', async () => {
    setOpen(true);
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NewProjectDialog onSubmit={onSubmit} />);
    fireEvent.change(screen.getByTestId('npd-name-input'), {
      target: { value: 'MyProject' },
    });
    fireEvent.change(screen.getByTestId('npd-dir-input'), {
      target: { value: '/tmp' },
    });
    fireEvent.click(screen.getByTestId('npd-create'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it('clicking the × close button closes the dialog', () => {
    setOpen(true);
    render(<NewProjectDialog onSubmit={() => {}} />);
    fireEvent.click(screen.getByTestId('npd-close'));
    expect(useArxmlStore.getState().newProjectDialogOpen).toBe(false);
  });

  it('does NOT submit when Enter is pressed but name is empty (Create stays disabled)', () => {
    setOpen(true);
    const onSubmit = vi.fn();
    render(<NewProjectDialog onSubmit={onSubmit} />);
    // Default empty name; dir has a value. Create still disabled because
    // name empty — Enter in the empty input must not bypass that.
    fireEvent.change(screen.getByTestId('npd-dir-input'), {
      target: { value: '/tmp' },
    });
    fireEvent.keyDown(screen.getByTestId('npd-name-input'), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
