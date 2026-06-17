// @vitest-environment jsdom
//
// TemplateCardRow tests — Sprint 13+ Stage 3.3 Task 3.
//
// The row is a container: it owns the IPC fetch + the empty-array /
// error fallback. It is *not* aware of the dialog form (name/dir) —
// that lives in NewProjectDialog. The row only emits
// `onSelect(id)` to its host.
//
// Why a fallback when the IPC fails or returns empty? The dialog must
// never crash the user-facing flow; if the backend hasn't shipped the
// samples dir yet, we still want to let the user create an Empty
// project. So the "empty list" case degrades to a single Empty card.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TemplateListResponse } from '@shared/types';

import { useArxmlStore } from '../../store/useArxmlStore.js';
import { TemplateCardRow } from '../TemplateCardRow.js';

interface AutosarApiStub {
  readonly listTemplates: ReturnType<typeof vi.fn>;
}

let originalAutosarApi: unknown;

function installListTemplates(response: TemplateListResponse | Error): AutosarApiStub {
  const listTemplates = vi.fn();
  if (response instanceof Error) {
    listTemplates.mockRejectedValue(response);
  } else {
    listTemplates.mockResolvedValue(response);
  }
  const stub: AutosarApiStub = { listTemplates };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).window.autosarApi = stub;
  return stub;
}

const THREE_TEMPLATES: TemplateListResponse = {
  templates: [
    {
      id: 'empty',
      displayNameKey: 'template.empty.displayName',
      descriptionKey: 'template.empty.description',
      fileCount: 0,
    },
    {
      id: 'classic',
      displayNameKey: 'template.classic.displayName',
      descriptionKey: 'template.classic.description',
      fileCount: 3,
    },
    {
      id: 'clone',
      displayNameKey: 'template.clone.displayName',
      descriptionKey: 'template.clone.description',
      fileCount: 0,
    },
  ],
};

const EMPTY_LIST: TemplateListResponse = { templates: [] };

beforeEach(() => {
  // Ensure `window` exists on globalThis so we can stub the preload
  // bridge. Vitest's default env is `node`; the `@vitest-environment
  // jsdom` directive at the top of this file gives us a real window
  // object, but the autosarApi property must be assigned by us.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (globalThis as any).window === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {};
  }
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

describe('TemplateCardRow', () => {
  it('renders nothing visible (but the container) before the IPC resolves', () => {
    installListTemplates(THREE_TEMPLATES);
    render(<TemplateCardRow selectedId={null} onSelect={() => undefined} />);
    // The container is always present (so the dialog layout doesn't shift).
    expect(screen.getByTestId('tpl-card-row')).toBeInTheDocument();
    // But no card is rendered until the IPC resolves.
    expect(screen.queryByTestId('tpl-card-empty')).toBeNull();
  });

  it('renders 3 cards after the IPC resolves with 3 templates', async () => {
    installListTemplates(THREE_TEMPLATES);
    render(<TemplateCardRow selectedId={null} onSelect={() => undefined} />);
    await waitFor(() => {
      expect(screen.getByTestId('tpl-card-empty')).toBeInTheDocument();
    });
    expect(screen.getByTestId('tpl-card-classic')).toBeInTheDocument();
    expect(screen.getByTestId('tpl-card-clone')).toBeInTheDocument();
  });

  it('falls back to a single Empty card when the IPC returns an empty list', async () => {
    installListTemplates(EMPTY_LIST);
    render(<TemplateCardRow selectedId={null} onSelect={() => undefined} />);
    await waitFor(() => {
      expect(screen.getByTestId('tpl-card-empty')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('tpl-card-classic')).toBeNull();
    expect(screen.queryByTestId('tpl-card-clone')).toBeNull();
  });

  it('falls back to a single Empty card when the IPC rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    installListTemplates(new Error('IPC failed'));
    render(<TemplateCardRow selectedId={null} onSelect={() => undefined} />);
    await waitFor(() => {
      expect(screen.getByTestId('tpl-card-empty')).toBeInTheDocument();
    });
    expect(warn).toHaveBeenCalled();
    expect(screen.queryByTestId('tpl-card-classic')).toBeNull();
    expect(screen.queryByTestId('tpl-card-clone')).toBeNull();
    warn.mockRestore();
  });

  it('emits onSelect("empty") when the Empty card is clicked', async () => {
    installListTemplates(THREE_TEMPLATES);
    const onSelect = vi.fn();
    render(<TemplateCardRow selectedId={null} onSelect={onSelect} />);
    await waitFor(() => {
      expect(screen.getByTestId('tpl-card-empty')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tpl-card-empty'));
    expect(onSelect).toHaveBeenCalledWith('empty');
  });

  it('does NOT emit onSelect when a disabled card is clicked (parent is bypassed anyway)', async () => {
    installListTemplates(THREE_TEMPLATES);
    const onSelect = vi.fn();
    render(<TemplateCardRow selectedId={null} onSelect={onSelect} />);
    await waitFor(() => {
      expect(screen.getByTestId('tpl-card-classic')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('tpl-card-classic'));
    // TemplateCard itself swallows the click before forwarding to
    // onSelect; TemplateCardRow never sees it.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('applies the --selected modifier to the card whose id matches selectedId', async () => {
    installListTemplates(THREE_TEMPLATES);
    render(<TemplateCardRow selectedId="empty" onSelect={() => undefined} />);
    await waitFor(() => {
      expect(screen.getByTestId('tpl-card-empty')).toBeInTheDocument();
    });
    expect(screen.getByTestId('tpl-card-empty').className).toMatch(/tpl-card--selected/);
    expect(screen.getByTestId('tpl-card-classic').className).not.toMatch(/tpl-card--selected/);
  });

  it('re-renders correctly when selectedId switches from empty to null (deselect)', async () => {
    installListTemplates(THREE_TEMPLATES);
    const { rerender } = render(<TemplateCardRow selectedId="empty" onSelect={() => undefined} />);
    await waitFor(() => {
      expect(screen.getByTestId('tpl-card-empty').className).toMatch(/tpl-card--selected/);
    });
    rerender(<TemplateCardRow selectedId={null} onSelect={() => undefined} />);
    expect(screen.getByTestId('tpl-card-empty').className).not.toMatch(/tpl-card--selected/);
  });
});
